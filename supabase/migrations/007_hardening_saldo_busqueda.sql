-- Migración 007: hardening de las RPC, invariantes del ledger y lecturas que
-- no pueden hacerse fila por fila.
--
-- Las cinco RPC de escritura/consulta de 006 siguen siendo SECURITY DEFINER
-- (corren como dueño y cruzan RLS). Por eso EXECUTE queda solo para
-- `authenticated`: ni PUBLIC ni `anon` pueden usarlas para insertar un canje
-- salteando las políticas.
--
-- El dominio sigue calculando montos. Acá solo se rechaza una visita sin
-- entradas y se fijan signos que el dominio ya emite:
--   earn     >= 0  (el monto 0 es válido: consulta o cortesía)
--   redeem   <= 0
--   reversal cualquiera (deshace un earn en negativo y un canje en positivo;
--                        un saldo negativo posterior es válido)

ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_reverses_entry_id_key
  UNIQUE (reverses_entry_id);

ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_monto_signo_chk
  CHECK (
    CASE tipo
      WHEN 'earn' THEN monto_puntos >= 0
      WHEN 'redeem' THEN monto_puntos <= 0
      -- Reversal no tiene signo propio: es el opuesto de la entrada que deshace.
      WHEN 'reversal' THEN TRUE
      ELSE FALSE
    END
  );

-- Misma función que 006, más el rechazo de una visita sin entradas.
-- search_path fijo: no hereda el del llamador (evita shadowing en DEFINER).
CREATE OR REPLACE FUNCTION guardar_visita_y_entradas(
  p_visita_id uuid,
  p_cliente_id uuid,
  p_nota text,
  p_created_by uuid,
  p_entradas jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
  entrada jsonb;
BEGIN
  IF p_entradas IS NULL
     OR jsonb_typeof(p_entradas) <> 'array'
     OR jsonb_array_length(p_entradas) = 0 THEN
    RAISE EXCEPTION 'Una visita requiere al menos una entrada';
  END IF;

  INSERT INTO visitas (id, cliente_id, nota, created_by)
  VALUES (p_visita_id, p_cliente_id, p_nota, p_created_by)
  RETURNING id INTO v_id;

  FOR entrada IN SELECT * FROM jsonb_array_elements(p_entradas)
  LOOP
    INSERT INTO ledger_entries (
      id, cliente_id, tipo, monto_puntos, servicio_id, premio_id, visita_id,
      reverses_entry_id, nota, created_by
    ) VALUES (
      COALESCE(to_uuid_or_null(entrada->>'id'), uuid_generate_v4()),
      p_cliente_id,
      (entrada->>'tipo')::ledger_tipo,
      (entrada->>'monto_puntos')::int,
      to_uuid_or_null(entrada->>'servicio_id'),
      to_uuid_or_null(entrada->>'premio_id'),
      v_id,
      to_uuid_or_null(entrada->>'reverses_entry_id'),
      to_text_or_null(entrada->>'nota'),
      p_created_by
    );
  END LOOP;

  RETURN v_id;
END;
$$;

ALTER FUNCTION guardar_canje(jsonb)
  SET search_path = public, extensions;

ALTER FUNCTION guardar_reversion_visita(uuid, uuid, jsonb)
  SET search_path = public, extensions;

ALTER FUNCTION guardar_reversion_canje(jsonb)
  SET search_path = public, extensions;

ALTER FUNCTION obtener_ultima_accion(uuid)
  SET search_path = public, extensions;

-- Saldo = SUM en SQL. El adaptador no puede traer filas y sumar en JS:
-- PostgREST corta el SELECT en 1000 y el saldo quedaría corto.
-- INVOKER: no saltea RLS; solo agrega las filas que el llamador puede ver.
CREATE OR REPLACE FUNCTION obtener_saldo(p_cliente_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(SUM(monto_puntos), 0)::integer
  FROM ledger_entries
  WHERE cliente_id = p_cliente_id;
$$;

-- Búsqueda parametrizada. El patrón se arma acá para que PostgREST no
-- interpole el texto de la operadora en un filtro .or().
--
-- `lower(f_unaccent(nombre)) LIKE $patron` coincide con el índice GIN
-- idx_clientes_nombre_trgm. El patrón tiene que ser un parámetro (no una
-- expresión '%' || ... en el WHERE) para que el planificador pueda usarlo.
-- El nombre va en su propia rama UNION: un OR con teléfono/DNI (sin índice)
-- hace que Postgres descarte el GIN y recorra la tabla.
-- plan_cache_mode custom: el índice trigram no entra en un plan genérico
-- (`LIKE $1` sin el valor) y PostgREST reutiliza la sesión.
-- También matchea teléfono y DNI. '%' '_' y '\' del texto se descartan
-- para que no actúen como comodines.
CREATE OR REPLACE FUNCTION buscar_clientas(p_parcial text, p_limite integer DEFAULT 10)
RETURNS SETOF clientes
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
SET plan_cache_mode = force_custom_plan
AS $$
DECLARE
  v_literal text;
  v_pattern text;
BEGIN
  IF p_parcial IS NULL OR btrim(p_parcial) = '' OR p_limite IS NULL OR p_limite <= 0 THEN
    RETURN;
  END IF;

  v_literal := regexp_replace(btrim(p_parcial), '[%_\\]', '', 'g');
  IF v_literal = '' THEN
    RETURN;
  END IF;

  v_pattern := '%' || lower(f_unaccent(v_literal)) || '%';

  RETURN QUERY
  SELECT e.*
  FROM (
    SELECT c.*
    FROM clientes c
    WHERE lower(f_unaccent(c.nombre)) LIKE v_pattern
    UNION
    SELECT c.*
    FROM clientes c
    WHERE c.telefono ILIKE v_pattern
    UNION
    SELECT c.*
    FROM clientes c
    WHERE c.dni ILIKE v_pattern
  ) e
  ORDER BY e.nombre
  LIMIT p_limite;
END;
$$;

-- EXECUTE solo para authenticated. PUBLIC lo trae por defecto al crear la
-- función; anon solo si el rol existe (Supabase).
DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.guardar_visita_y_entradas(uuid, uuid, text, uuid, jsonb)'::regprocedure,
    'public.guardar_canje(jsonb)'::regprocedure,
    'public.guardar_reversion_visita(uuid, uuid, jsonb)'::regprocedure,
    'public.guardar_reversion_canje(jsonb)'::regprocedure,
    'public.obtener_ultima_accion(uuid)'::regprocedure,
    'public.obtener_saldo(uuid)'::regprocedure,
    'public.buscar_clientas(text, integer)'::regprocedure
  ]
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END
$$;
