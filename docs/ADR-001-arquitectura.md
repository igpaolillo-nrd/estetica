# ADR-001: Arquitectura del sistema de fidelización por puntos

## Estado
Aprobado para Fase 1 (MVP).

## Contexto
Sistema de fidelización por puntos para un centro de estética en Argentina. Operadora única (la dueña), uso desde el celular con la clienta enfrente, en segundos, sin manual. Clientela mayoritariamente de edad avanzada y poca tecnología. Es un MVP con vida esperada menor a 3 meses antes de la primera validación real. La vara de éxito es que la operadora lo siga usando a las 8 semanas, no que la demo funcione.

## Decisión
Usar **arquitectura Hexagonal (Ports & Adapters)** con un núcleo de dominio rico **solo en el ledger de puntos**, y CRUD pragmático para el resto.

Stack: Next.js (App Router) + Supabase (Postgres), TypeScript.

## Justificación

1. **Complejidad del dominio: intermedia.**
   El ledger de puntos tiene invariantes no triviales: append-only, snapshot inmutable, reversión compensatoria y rechazo por saldo insuficiente. Estas reglas merecen aislamiento y testeo en aislamiento. Pero es **un solo agregado** con pocos invariantes, no un dominio con múltiples bounded contexts. No justifica Clean Architecture de cuatro capas ni DDD completo.

2. **Integraciones con terceros.**
   El sistema diferirá integraciones con Google Calendar (turnos) y WhatsApp (notificaciones). Hexagonal hace explícitas esas fronteras mediante puertos, con adaptadores intercambiables. Hoy se declaran e implementan como stubs.

3. **MVP + Next.js App Router.**
   El framework es opinado. Respetamos sus convenciones antes de imponer capas globales. Los Server Actions / route handlers actúan como adaptadores de entrada (driving adapters), sin un wrapper ceremonial sobre casos de uso.

4. **Velocidad de iteración.**
   Catálogos (servicios, premios) y búsqueda de clientas no pagan el costo de DTOs y casos de uso formales. Se resuelven con CRUD y queries directas, manteniendo separación de responsabilidades y bajo acoplamiento sin liturgia.

## Límites del hexágono

**Dentro del hexágono (dominio puro, sin imports de Supabase/Next):**
- Agregado `Visita` e invariantes del ledger.
- Puertos: interfaces de repositorio del ledger y puertos externos (`CalendarPort`, `NotificationPort`).
- Operaciones de dominio: registrar visita, canjear premio, deshacer última acción.

**Afuera del hexágono (adaptadores):**
- Driven adapters: implementación Supabase de los repositorios; stubs de Calendar y WhatsApp.
- Driving adapters: Server Actions / route handlers de Next.js que invocan el dominio.

**Pragmático (no fuerza al hexágono):**
- CRUD de servicios, premios y clientas.
- Búsqueda de clientas por nombre.
- Proyecciones de lectura sobre el ledger.

## Cuándo evolucionar la arquitectura

Las siguientes señales justificarían subir a Monolito Modular o DDD + Clean Architecture. **No antes.**

1. Aparece un segundo bounded context con lógica propia (ej. gestión de turnos con reglas reales, programa de referidos, facturación).
2. El ledger deja de ser un solo agregado y necesita coordinar invariantes entre agregados.
3. Más de un operador con roles y permisos distintos (rompe el supuesto de operador único).
4. Los catálogos desarrollan reglas de negocio propias no triviales.

Mientras ninguna de estas señales aparezca, se mantiene el hexágono chico. Subir de nivel sin estas señales es sobre-ingeniería.

## Consecuencias

- **Positivas:**
  - El ledger está aislado, testeable y protegido por invariantes explícitas.
  - Las integraciones futuras tienen un seam claro.
  - El resto del código es liviano y rápido de iterar.

- **Negativas / riesgos:**
  - Queda a cargo del equipo respetar el límite del hexágono; no hay un framework que lo impida.
  - Si el producto crece más rápido de lo esperado, puede haber deuda de arquitectura que requiera refactor.

## Alternativas consideradas

- **Clean Architecture de 4 capas:** descartada. Aumenta la ceremonia sin aportar valor proporcional para un MVP con un solo agregado.
- **Arquitectura totalmente plana (todo CRUD):** descartada. El ledger tiene invariantes que merecen aislamiento; sin hexágono, las reglas se dispersarían en la DB y en la UI.

## Notas de privacidad

La columna `nota` puede contener datos sensibles (Ley 25.326, Argentina). RLS restringe el acceso a usuarios autenticados. La columna **nunca** debe exponerse en superficie de cara a la clienta, URLs, logs ni mensajes de error. Esto reduce exposición pero no constituye compliance completo.

## Supuesto de operador único y políticas RLS

Las políticas actuales usan `TO authenticated USING (true)` / `WITH CHECK (true)` para SELECT, INSERT y UPDATE en todas las tablas. Esto significa que **cualquier usuario autenticado puede leer y escribir cualquier fila**. Es una decisión consciente bajo el supuesto de **operadora única**: hay un solo usuario del sistema (la dueña) y no hay distinción de roles ni permisos por propietario.

**Deuda / trigger de cambio:** el día que aparezca más de un operador con roles distintos, estas políticas dejan de ser adecuadas. En particular, la columna `nota` (datos sensibles, Ley 25.326) no debería ser legible por cualquier operador, y los catálogos podrían requerir permisos de administración separados. Ese escenario coincide con el trigger de evolución arquitectónica ya registrado: "Más de un operador con roles y permisos distintos".

**Soft-delete y DELETE físico:** las tablas `clientes`, `servicios`, `premios` y `visitas` no tienen política `FOR DELETE`. Como RLS niega por defecto cualquier operación sin política explícita, un `DELETE` físico sobre esas tablas queda rechazado. El único `DELETE` explícito es en `ledger_entries`, con `USING (false)`, reforzando el invariante append-only. El borrado lógico se hace siempre vía `UPDATE ... SET activo = false` (servicios/premios) o `UPDATE ... SET revertida_at = ...` (visitas).

## Correcciones de la Fase 1.5

Tras revisión se detectaron y remediaron los siguientes problemas:

1. **Dominio como única fuente de verdad.**
   Las RPCs de Postgres (`guardar_visita_y_entradas`, `guardar_reversion_visita`) recalculaban entradas en PL/pgSQL, duplicando reglas del dominio. Se refactorizaron para que reciban un JSONB de entradas ya calculadas por TypeScript y solo inserten atómicamente. El adaptador `SupabaseLedgerRepository` ahora pasa las entradas reales generadas por `Visita.generarEntradasEarn()` y `deshacerUltimaAccion()`.

2. **Atomicidad unificada.**
   `canjearPremio` pasó a usar una RPC atómica (`guardar_canje`) al igual que visita y reversión. La validación de `SaldoInsuficiente` sigue ocurriendo en el dominio antes de llamar a la RPC; la función SQL no decide, solo escribe.

3. **Consulta de última acción encapsulada.**
   La query inválida de `obtenerUltimaAccion` con subconsulta en el query builder fue reemplazada por la RPC `obtener_ultima_accion`, que devuelve la última visita o canje no revertido de una operadora como JSON. Es más robusta y testeable.

4. **Snapshot sin datos de presentación.**
   `ServicioSnapshot` y `PremioSnapshot` incluían `nombre`, un campo del catálogo que el ledger no persiste. Esto obligaba al hack `nombre: ''` al reconstruir una `Visita`. Se eliminó `nombre` de ambos snapshots; el dominio no necesita nombres para aplicar invariantes. Los nombres se resuelven por join contra el catálogo en la capa de presentación.

5. **Verificación automatizada.**
   Se agregó Vitest y tests de dominio puro sin base de datos. `npx tsc --noEmit` compila sin errores y los tests pasan.
