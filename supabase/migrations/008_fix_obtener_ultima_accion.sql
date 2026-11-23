-- Migración 008: obtener_ultima_accion nunca devolvía una visita.
--
-- En PL/pgSQL, `record IS NOT NULL` es verdadero solo si TODOS los campos son
-- no nulos. La visita candidata siempre tiene `revertida_at IS NULL` (es el
-- filtro), así que `v_visita IS NOT NULL` daba falso y la función caía en la
-- rama de canje: devolvía el canje aunque la visita fuera más reciente, o un
-- objeto 'redeem' con todos los campos en null cuando no había canjes. Deshacer
-- una visita era imposible.
--
-- Se usa FOUND (y el id) para saber si hubo fila. Misma firma, mismo JSON,
-- SECURITY DEFINER y search_path fijo como dejó 007. CREATE OR REPLACE conserva
-- los GRANT/REVOKE de 007.

CREATE OR REPLACE FUNCTION obtener_ultima_accion(p_operador_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_visita record;
  v_canje record;
  v_hay_visita boolean;
  v_hay_canje boolean;
  v_entradas jsonb;
BEGIN
  SELECT *
  INTO v_visita
  FROM visitas
  WHERE created_by = p_operador_id AND revertida_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;
  v_hay_visita := FOUND;

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
  v_hay_canje := FOUND;

  IF NOT v_hay_visita AND NOT v_hay_canje THEN
    RETURN NULL;
  END IF;

  IF v_hay_visita AND (NOT v_hay_canje OR v_visita.created_at >= v_canje.created_at) THEN
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
