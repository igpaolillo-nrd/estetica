-- Migración 006: funciones RPC atómicas para escrituras críticas del ledger.
-- El dominio ya aplica las invariantes y excepciones tipadas; estas funciones
-- garantizan atomicidad y actúan como defensa en profundidad.

-- Guarda una visita y sus entradas earn en una sola transacción.
CREATE OR REPLACE FUNCTION guardar_visita_y_entradas(
  p_visita_id uuid,
  p_cliente_id uuid,
  p_nota text,
  p_created_by uuid,
  p_servicios jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
  serv jsonb;
BEGIN
  INSERT INTO visitas (id, cliente_id, nota, created_by)
  VALUES (p_visita_id, p_cliente_id, p_nota, p_created_by)
  RETURNING id INTO v_id;

  FOR serv IN SELECT * FROM jsonb_array_elements(p_servicios)
  LOOP
    INSERT INTO ledger_entries (
      cliente_id, tipo, monto_puntos, servicio_id, visita_id, nota, created_by
    ) VALUES (
      p_cliente_id,
      'earn',
      (serv->>'monto_puntos')::int,
      (serv->>'servicio_id')::uuid,
      v_id,
      p_nota,
      p_created_by
    );
  END LOOP;

  RETURN v_id;
END;
$$;

-- Guarda las entradas reversal de una visita y marca la visita como revertida.
CREATE OR REPLACE FUNCTION guardar_reversion_visita(
  p_visita_id uuid,
  p_operador_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  entrada record;
BEGIN
  UPDATE visitas
  SET revertida_at = now()
  WHERE id = p_visita_id AND revertida_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visita ya revertida o no encontrada: %', p_visita_id;
  END IF;

  FOR entrada IN
    SELECT id, cliente_id, servicio_id, monto_puntos
    FROM ledger_entries
    WHERE visita_id = p_visita_id AND tipo = 'earn'
  LOOP
    INSERT INTO ledger_entries (
      cliente_id, tipo, monto_puntos, servicio_id, visita_id, reverses_entry_id, nota, created_by
    ) VALUES (
      entrada.cliente_id,
      'reversal',
      -entrada.monto_puntos,
      entrada.servicio_id,
      p_visita_id,
      entrada.id,
      'Reversión de visita ' || p_visita_id,
      p_operador_id
    );
  END LOOP;
END;
$$;

-- Guarda la entrada reversal de un canje.
CREATE OR REPLACE FUNCTION guardar_reversion_canje(
  p_entry_id uuid,
  p_operador_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  entrada record;
BEGIN
  SELECT *
  INTO entrada
  FROM ledger_entries
  WHERE id = p_entry_id AND tipo = 'redeem';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Canje no encontrado: %', p_entry_id;
  END IF;

  INSERT INTO ledger_entries (
    cliente_id, tipo, monto_puntos, premio_id, reverses_entry_id, nota, created_by
  ) VALUES (
    entrada.cliente_id,
    'reversal',
    -entrada.monto_puntos,
    entrada.premio_id,
    entrada.id,
    'Reversión de canje',
    p_operador_id
  );
END;
$$;
