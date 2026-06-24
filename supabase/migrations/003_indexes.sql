-- Migración 003: índices para lecturas frecuentes

-- Búsqueda tolerante a acentos y parcial por nombre de clienta.
-- unaccent es STABLE por defecto; para usarlo en un índice necesitamos
-- un wrapper IMMUTABLE.
CREATE OR REPLACE FUNCTION f_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT unaccent($1);
$$;

CREATE INDEX IF NOT EXISTS idx_clientes_nombre_trgm
    ON clientes
    USING GIN (lower(f_unaccent(nombre)) gin_trgm_ops);

-- Ledger: lectura por cliente y por rango de tiempo para saldo e historial.
CREATE INDEX IF NOT EXISTS idx_ledger_cliente_created
    ON ledger_entries(cliente_id, created_at DESC);

-- Ledger: filtrado por visita para deshacer.
CREATE INDEX IF NOT EXISTS idx_ledger_visita
    ON ledger_entries(visita_id);

-- Visitas: últimas acciones de una operadora para la función deshacer.
CREATE INDEX IF NOT EXISTS idx_visitas_operadora_created
    ON visitas(created_by, created_at DESC);
