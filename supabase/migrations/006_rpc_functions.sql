-- Migración 006: funciones RPC atómicas para escrituras críticas del ledger.
-- Principio: el dominio es la única fuente de verdad. Estas funciones SOLO
-- garantizan atomicidad; no calculan montos, no generan entradas, no deciden reglas.

-- Helper para convertir texto JSON a uuid o NULL sin riesgo de cast inválido.
CREATE OR REPLACE FUNCTION to_uuid_or_null(p_text text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_text IS NULL OR p_text = '' OR lower(p_text) = 'null' THEN NULL
    ELSE p_text::uuid
  END;
$$;

-- Helper para convertir texto JSON a text o NULL.
CREATE OR REPLACE FUNCTION to_text_or_null(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_text IS NULL OR p_text = '' THEN NULL
    ELSE p_text
  END;
$$;

-- Guarda una visita y las entradas earn YA CALCULADAS por el dominio.
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
AS $$
DECLARE
  v_id uuid;
  entrada jsonb;
BEGIN
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

-- Guarda una entrada redeem YA CALCULADA por el dominio de forma atómica.
-- El dominio ya validó el saldo antes de llamar; esta función no decide.
CREATE OR REPLACE FUNCTION guardar_canje(
  p_entrada jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO ledger_entries (
    id, cliente_id, tipo, monto_puntos, servicio_id, premio_id, visita_id,
    reverses_entry_id, nota, created_by
  ) VALUES (
    COALESCE(to_uuid_or_null(p_entrada->>'id'), uuid_generate_v4()),
    to_uuid_or_null(p_entrada->>'cliente_id'),
    (p_entrada->>'tipo')::ledger_tipo,
    (p_entrada->>'monto_puntos')::int,
    to_uuid_or_null(p_entrada->>'servicio_id'),
    to_uuid_or_null(p_entrada->>'premio_id'),
    to_uuid_or_null(p_entrada->>'visita_id'),
    to_uuid_or_null(p_entrada->>'reverses_entry_id'),
    to_text_or_null(p_entrada->>'nota'),
    to_uuid_or_null(p_entrada->>'created_by')
  );
END;
$$;

-- Guarda las entradas reversal YA CALCULADAS por el dominio y marca la visita revertida.
CREATE OR REPLACE FUNCTION guardar_reversion_visita(
  p_visita_id uuid,
  p_operador_id uuid,
  p_entradas jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  entrada jsonb;
BEGIN
  UPDATE visitas
  SET revertida_at = now()
  WHERE id = p_visita_id AND revertida_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visita ya revertida o no encontrada: %', p_visita_id;
  END IF;

  FOR entrada IN SELECT * FROM jsonb_array_elements(p_entradas)
  LOOP
    INSERT INTO ledger_entries (
      id, cliente_id, tipo, monto_puntos, servicio_id, premio_id, visita_id,
      reverses_entry_id, nota, created_by
    ) VALUES (
      COALESCE(to_uuid_or_null(entrada->>'id'), uuid_generate_v4()),
      to_uuid_or_null(entrada->>'cliente_id'),
      (entrada->>'tipo')::ledger_tipo,
      (entrada->>'monto_puntos')::int,
      to_uuid_or_null(entrada->>'servicio_id'),
      to_uuid_or_null(entrada->>'premio_id'),
      to_uuid_or_null(entrada->>'visita_id'),
      to_uuid_or_null(entrada->>'reverses_entry_id'),
      to_text_or_null(entrada->>'nota'),
      p_operador_id
    );
  END LOOP;
END;
$$;

-- Guarda la entrada reversal de un canje YA CALCULADA por el dominio.
CREATE OR REPLACE FUNCTION guardar_reversion_canje(
  p_entrada jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO ledger_entries (
    id, cliente_id, tipo, monto_puntos, servicio_id, premio_id, visita_id,
    reverses_entry_id, nota, created_by
  ) VALUES (
    COALESCE(to_uuid_or_null(p_entrada->>'id'), uuid_generate_v4()),
    to_uuid_or_null(p_entrada->>'cliente_id'),
    (p_entrada->>'tipo')::ledger_tipo,
    (p_entrada->>'monto_puntos')::int,
    to_uuid_or_null(p_entrada->>'servicio_id'),
    to_uuid_or_null(p_entrada->>'premio_id'),
    to_uuid_or_null(p_entrada->>'visita_id'),
    to_uuid_or_null(p_entrada->>'reverses_entry_id'),
    to_text_or_null(p_entrada->>'nota'),
    to_uuid_or_null(p_entrada->>'created_by')
  );
END;
$$;

-- Devuelve la última acción no revertida de una operadora como JSON.
-- El dominio decide qué hacer con ella; esta función solo consulta.
CREATE OR REPLACE FUNCTION obtener_ultima_accion(p_operador_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_visita record;
  v_canje record;
  v_entradas jsonb;
BEGIN
  SELECT *
  INTO v_visita
  FROM visitas
  WHERE created_by = p_operador_id AND revertida_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT le.*
  INTO v_canje
  FROM ledger_entries le
  WHERE le.tipo = 'redeem'
    AND le.created_by = p_operador_id
    AND NOT EXISTS (
      SELECT 1 FROM ledger_entries rev
      WHERE rev.reverses_entry_id = le.id AND rev.tipo = 'reversal'
    )
  ORDER BY le.created_at DESC
  LIMIT 1;

  IF v_visita IS NULL AND v_canje IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_visita IS NOT NULL AND (v_canje IS NULL OR v_visita.created_at >= v_canje.created_at) THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', le.id,
        'cliente_id', le.cliente_id,
        'tipo', le.tipo,
        'monto_puntos', le.monto_puntos,
        'servicio_id', le.servicio_id,
        'premio_id', le.premio_id,
        'visita_id', le.visita_id,
        'reverses_entry_id', le.reverses_entry_id,
        'nota', le.nota,
        'created_by', le.created_by,
        'created_at', le.created_at
      ) ORDER BY le.created_at
    )
    INTO v_entradas
    FROM ledger_entries le
    WHERE le.visita_id = v_visita.id AND le.tipo = 'earn';

    RETURN jsonb_build_object(
      'tipo', 'visita',
      'visita', jsonb_build_object(
        'id', v_visita.id,
        'cliente_id', v_visita.cliente_id,
        'nota', v_visita.nota,
        'created_by', v_visita.created_by,
        'created_at', v_visita.created_at,
        'revertida_at', v_visita.revertida_at
      ),
      'entradas', COALESCE(v_entradas, '[]'::jsonb)
    );
  END IF;

  RETURN jsonb_build_object(
    'tipo', 'redeem',
    'entrada', jsonb_build_object(
      'id', v_canje.id,
      'cliente_id', v_canje.cliente_id,
      'tipo', v_canje.tipo,
      'monto_puntos', v_canje.monto_puntos,
      'servicio_id', v_canje.servicio_id,
      'premio_id', v_canje.premio_id,
      'visita_id', v_canje.visita_id,
      'reverses_entry_id', v_canje.reverses_entry_id,
      'nota', v_canje.nota,
      'created_by', v_canje.created_by,
      'created_at', v_canje.created_at
    )
  );
END;
$$;
