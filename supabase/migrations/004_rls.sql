-- Migración 004: Row Level Security
-- Acceso anónimo no permitido. Toda lectura/escritura requiere usuario autenticado.

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE premios ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

-- Políticas para usuarios autenticados (supuesto actual: operadora única, sin roles).
CREATE POLICY "authenticated_select_clientes" ON clientes
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_clientes" ON clientes
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_clientes" ON clientes
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_select_servicios" ON servicios
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_servicios" ON servicios
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_servicios" ON servicios
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_select_premios" ON premios
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_premios" ON premios
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_premios" ON premios
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_select_visitas" ON visitas
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_visitas" ON visitas
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_visitas" ON visitas
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_select_ledger" ON ledger_entries
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_ledger" ON ledger_entries
    FOR INSERT TO authenticated WITH CHECK (true);
-- El ledger nunca se actualiza ni borra desde la aplicación; la política de UPDATE
-- solo existe para operaciones administrativas controladas y queda restringida.
CREATE POLICY "authenticated_no_delete_ledger" ON ledger_entries
    FOR DELETE TO authenticated USING (false);
