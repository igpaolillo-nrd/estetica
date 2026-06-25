# AGENTS.md — Estética Fidelización

## Contexto

MVP de sistema de fidelización por puntos para un centro de estética (PyME, Argentina). Operadora única: la dueña usa el celular con la clienta enfrente, en segundos, sin manual. Clientela mayoritariamente de edad avanzada y poca tecnología.

- **Vara de éxito:** que la operadora lo siga usando a las 8 semanas, no que la demo funcione.
- **Criterio:** pragmatismo sobre ceremonia. Menos es más.

## Stack y comandos esenciales

- **Stack:** Next.js 14 (App Router) + Supabase (Postgres) + TypeScript.
- `npm install` — instalar dependencias.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run test` — `vitest run` (dominio puro + integración SQL).
- `npm run dev` / `npm run build` — Next.js.
- `npm run lint` — `next lint`.

## Arquitectura

- **Hexagonal con núcleo chico:** solo el ledger de puntos y sus invariantes viven en el hexágono. Todo lo demás es CRUD pragmático.
- `src/domain/` — dominio puro. **CERO imports de Supabase/Next.** Contiene `Visita`, `LedgerEntry`, value objects, operaciones (`registrarVisita`, `canjearPremio`, `deshacerUltimaAccion`) y puertos (`LedgerRepository`, `CalendarPort`, `NotificationPort`).
- `src/adapters/driven/` — implementaciones Supabase (`SupabaseLedgerRepository`, `CatalogoRepository`) y stubs externos (`CalendarStub`, `NotificationStub`).
- `app/actions/` — Server Actions stubs de Next.js. Son el seam de entrada; **NO construir UI/presentación aquí** salvo indicación explícita.
- Catálogos, búsqueda de clientas y lecturas pragmáticas **NO pasan por el hexágono**: queries directas, sin casos de uso ni DTOs ceremoniales.

## Invariantes del dominio

1. **Ledger append-only:** nunca UPDATE ni DELETE sobre `ledger_entries`. Deshacer = entrada `reversal` compensatoria.
2. **Snapshot inmutable:** `ledger_entries.monto_puntos` copia el valor del servicio/premio en el momento de la transacción. Editar el catálogo no afecta entradas pasadas.
3. **Saldo computado:** `SUM(monto_puntos)` por cliente en cada lectura. NO materializar, NO cachear.
4. **Soft-delete:** servicios/premios vía `activo = false`; visitas vía `revertida_at`. DELETE físico está negado por RLS.
5. **Visita ≥ 1 servicio.** Undo revierte la visita entera, no servicios sueltos.

## Tests

- **Dominio puro:** `src/domain/*.test.ts`. Corren sin base de datos.
- **Integración SQL:** `src/adapters/driven/ledger-repository.integration.test.ts`. Requiere Postgres local con base `estetica_test`.

Para levantar Postgres local en macOS:

```bash
brew install postgresql@15
brew services start postgresql@15
createdb estetica_test
for f in supabase/migrations/*.sql; do psql -d estetica_test -v ON_ERROR_STOP=1 -f "$f"; done
```

Variables opcionales para los tests de integración: `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`.

## Migraciones y SQL

- `supabase/migrations/001_extensions.sql` — extensiones `uuid-ossp`, `unaccent`, `pg_trgm`.
- `supabase/migrations/002_schema.sql` — tablas y enum.
- `supabase/migrations/003_indexes.sql` — índices; incluye `f_unaccent(text)` (wrapper IMMUTABLE) para el índice GIN.
- `supabase/migrations/004_rls.sql` — RLS; crea el rol `authenticated` si no existe para compatibilidad local/Supabase.
- `supabase/migrations/005_append_only_trigger.sql` — trigger que bloquea UPDATE/DELETE sobre `ledger_entries`.
- `supabase/migrations/006_rpc_functions.sql` — RPCs atómicas. **El dominio calcula las entradas; las RPCs solo insertan.**

Aplicar siempre en orden. Verificar contra base real antes de declarar listo.

## RLS y supuesto de operador único

- Las políticas actuales usan `TO authenticated USING (true)` / `WITH CHECK (true)`. Esto permite a cualquier usuario autenticado leer/escribir cualquier fila.
- Es correcto **bajo el supuesto de operadora única**. Cuando haya más de un operador con roles distintos, estas políticas dejan de servir y hay que evolucionar la arquitectura.
- No hay políticas `FOR DELETE` en ninguna tabla. El DELETE físico es rechazado por RLS por defecto. `ledger_entries` también tiene un trigger append-only como defensa en profundidad.
- La columna `nota` es sensible (Ley 25.326, Argentina). Nunca exponerla en UI de cara a la clienta, URLs, logs ni mensajes de error.

## Límites explícitos

- NO Clean Architecture de 4 capas.
- NO UI/presentación en esta fase.
- NO identificación por QR, motor de reservas, WhatsApp API, peso=punto, cashback, event sourcing, CQRS, brokers.
- NO modificar `docs/DISENO.md` salvo indicación explícita del usuario.

## Evolución

Ver `docs/ADR-001-arquitectura.md` para las señales que justificarían subir de Hexagonal a Monolito Modular o DDD+Clean.
