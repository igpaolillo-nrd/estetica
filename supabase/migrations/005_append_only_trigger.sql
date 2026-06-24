-- Migración 005: defensa en profundidad del ledger append-only
-- El dominio ya garantiza que no se emitan UPDATE/DELETE, pero este trigger
-- protege la tabla a nivel de base de datos contra cualquier operación accidental
-- o maliciosa.

CREATE OR REPLACE FUNCTION prohibir_modificacion_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RAISE EXCEPTION 'ledger_entries es append-only: no se permite UPDATE ni DELETE';
END;
$$;

CREATE TRIGGER trg_ledger_no_update
    BEFORE UPDATE ON ledger_entries
    FOR EACH ROW
    EXECUTE FUNCTION prohibir_modificacion_ledger();

CREATE TRIGGER trg_ledger_no_delete
    BEFORE DELETE ON ledger_entries
    FOR EACH ROW
    EXECUTE FUNCTION prohibir_modificacion_ledger();
