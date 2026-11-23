# Avances

## 2026-11-23 — Server Actions de mostrador

**Hecho (verificado: `npm run typecheck` y `npm test` en verde, 28/28, contra Postgres 16 local con 001–008)**
- `app/actions/puntos-actions.ts`: ficha (datos básicos + saldo SUM, sin notas), saldo, progreso a premio, registrar visita (≥1 servicio, puntos snapshoteados del catálogo activo), canjear premio, vista previa de "deshacer" y deshacer última acción (reversa compensatoria del dominio).
- `app/actions/catalogo-actions.ts`: buscar clientas (RPC `buscar_clientas`, mín. 2 caracteres), alta rápida (nombre + teléfono normalizado a dígitos, DNI opcional), listar servicios/premios activos.
- `app/actions/contexto.ts` (único punto de sesión) y `app/actions/resultado.ts` (`Resultado<T>`, mensajes cortos, validación de UUID; nunca loguea input).
- Bug real corregido: `obtener_ultima_accion` nunca devolvía una visita (`record IS NOT NULL` en PL/pgSQL exige todos los campos no nulos y `revertida_at` siempre es NULL). Deshacer visitas fallaba. Migración `008_fix_obtener_ultima_accion.sql` + test de integración que fallaba antes y pasa después.
- Test de cableado de actions con repos en memoria (`app/actions/puntos-actions.test.ts`), incluye que `nota` no salga en la respuesta.
- `src/domain/` sin imports de Supabase/Next.

**Decisiones**
- Todas las actions de mostrador devuelven `Resultado<T>` (antes: stubs que tiraban o devolvían datos crudos).
- Sin dependencia nueva: `@supabase/ssr` queda para cuando haya login; el cambio se limita a `contexto.ts`.
- Deshacer devuelve qué se deshizo y el saldo nuevo, sin cambiar la firma del dominio.

**Qué sigue**
- Aplicar `008` en Supabase.
- Login de la operadora + `@supabase/ssr` en `contexto.ts` (hoy toda action responde "sesión requerida").
- UI mobile-first: buscar → ficha → visita/canje → deshacer con confirmación.

**Bloqueos / pendientes de decisión**
- Ley 25.326: el dominio copia la `nota` de la visita a cada `ledger_entries.nota` (append-only con trigger). Una nota sensible no se puede rectificar ni suprimir. Hay que decidir antes de habilitar notas en la UI.
