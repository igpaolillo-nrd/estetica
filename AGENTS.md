# Proyecto: Sistema de fidelización por puntos — Fase 1 (arquitectura + modelo de datos + núcleo de dominio)

## Contexto y objetivo
Sistema de fidelización por puntos para un centro de estética (PyME, Argentina). Operadora única (la dueña), lo usa en celular con la clienta enfrente, en segundos, sin manual. Clientela mayoritariamente de edad avanzada y poca tecnología.

Es un MVP (menos de 3 meses de vida). El criterio que manda es "la versión más chica que resuelva algo real". La vara de éxito es que la operadora lo siga usando a las 8 semanas, no que la demo funcione. Por lo tanto: pragmatismo sobre ceremonia. NO sobre-ingenierizar.

## DECISIÓN DE ARQUITECTURA (entregable obligatorio: ADR)
Antes de escribir código, generá un archivo `docs/ADR-001-arquitectura.md` que justifique brevemente la elección arquitectónica según estos criterios, y registre las señales que dispararían una evolución futura.

Arquitectura elegida: **Hexagonal (Ports & Adapters)**, con un núcleo de dominio rico SOLO en el ledger de puntos, y CRUD pragmático para el resto.

Justificación (validá y expandí en el ADR):
- Complejidad del dominio: INTERMEDIA. El ledger tiene invariantes no triviales (append-only, snapshot inmutable, reversión compensatoria, rechazo por saldo insuficiente) que merecen aislamiento y testeo en aislamiento. Pero es UN agregado con pocos invariantes, no un dominio con múltiples bounded contexts: no justifica Clean Architecture de cuatro capas.
- Integraciones con terceros (Google Calendar, WhatsApp): la señal clásica de Hexagonal. Van detrás de puertos, con adaptadores intercambiables.
- Etapa MVP + Next.js App Router (framework opinado): respetá sus convenciones antes de imponer capas globales. Server Actions / route handlers son los adaptadores de entrada (driving adapters), no un wrapper ceremonial sobre casos de uso.
- Velocidad de iteración alta: el catálogo y la búsqueda no pagan el costo de DTOs y casos de uso formales.

NO uses DDD + Clean Architecture de cuatro capas. NO impongas la misma ceremonia a todo. El hexágono es chico (ledger + puertos externos); todo lo demás es lo más liviano que funcione.

## Alcance de ESTE entregable
Tres cosas: (1) el ADR, (2) el modelo de datos, (3) el núcleo de dominio del ledger + las fronteras (puertos, repositorios). NO construyas UI/presentación todavía (segundo prompt). Sí dejá declarado el seam de Next.js (Server Actions) como adaptador de entrada, con stubs que muestren dónde se invoca el dominio.

## Stack
Next.js (App Router) + Supabase (Postgres). TypeScript. Migraciones SQL versionadas. Supabase Auth para login. RLS activo.

## Estructura: el hexágono y lo de afuera

DENTRO del hexágono (dominio puro, CERO imports de Supabase/Next):
- El agregado del ledger y sus invariantes.
- Los PUERTOS: interfaces de repositorio del ledger, y puertos de sistemas externos (`CalendarPort`, `NotificationPort`).
- Las operaciones de dominio que aplican invariantes (registrar visita, canjear, deshacer).

AFUERA del hexágono (adaptadores):
- Driven adapters (salida): implementación Supabase de los repositorios; stubs de Calendar y WhatsApp.
- Driving adapters (entrada): Server Actions / route handlers de Next.js que invocan el dominio. Stub en esta fase.

PRAGMÁTICO (no fuerces al hexágono): catálogos (servicios, premios) y búsqueda de clientas. Son CRUD y queries. Repositorio directo invocado desde Server Actions, sin casos de uso ceremoniales ni DTOs de ida y vuelta. Aplicá separación de responsabilidades y bajo acoplamiento, sin liturgia.

## Modelo de dominio

Núcleo rico (en el hexágono):
- `Visita` (raíz de agregado): agrupa una o más líneas de servicio realizadas en un mismo acto. Al confirmarse, EMITE las entradas de ledger correspondientes (una entrada `earn` por servicio). El undo opera sobre la visita entera.
- El ledger (`ledger_entries`): append-only, única fuente de verdad de puntos e historial. El historial de servicios es una PROYECCIÓN de lectura sobre el ledger, NO una tabla aparte.

Entidades simples (CRUD, fuera del núcleo rico):
- `Servicio`: id, nombre, puntos_default (entero ≥ 0), activo. Editable. El valor en puntos es regla de negocio, pero el manejo es CRUD simple.
- `Premio`: id, nombre, costo_puntos (entero ≥ 0), activo.
- `Cliente`: id, nombre, teléfono, dni (opcional). Búsqueda por nombre es la operación más frecuente del sistema.

Value objects donde aporten claridad real (sin inflar): `MontoPuntos` (entero con signo). No crees VOs por cada campo.

### Invariantes de dominio (explícitos en el código del hexágono, no solo en la DB):
1. Append-only: el ledger nunca se actualiza ni se borra. Deshacer = entrada de REVERSAL compensatoria (monto de signo opuesto, con referencia a la entrada original). Nunca un DELETE.
2. Snapshot inmutable: al otorgar puntos, la entrada COPIA puntos_default del servicio como monto absoluto. Editar el catálogo después NO afecta entradas pasadas. La entrada guarda servicio_id (descriptivo, para historial) Y monto_puntos (autoritativo, para el ledger): dos cosas distintas.
3. Canje rechazado si saldo < costo. Excepción tipada (`SaldoInsuficiente`), no un check en la UI.
4. Saldo = SUM(monto_puntos) por cliente, COMPUTADO en cada lectura. NO materializar, NO cachear.
5. Servicios y premios: soft-delete vía flag `activo`. Nunca hard-delete si están referenciados.
6. Monto 0 es válido (servicio registrado sin otorgar puntos: consulta, cortesía).
7. Una Visita agrupa ≥ 1 servicio. Undo revierte la visita ENTERA, no servicios sueltos.

## Esquema de datos (Postgres)
- `clientes`: id uuid PK, nombre text, telefono text, dni text NULL, created_at timestamptz. Búsqueda por nombre tolerante a acentos y parcial: extensiones `unaccent` y `pg_trgm`, índice GIN para ILIKE/similarity sobre nombre. Optimizala: es la operación más frecuente.
- `servicios`: id, nombre, puntos_default int, activo bool default true, timestamps.
- `premios`: id, nombre, costo_puntos int, activo bool default true, timestamps.
- `visitas`: id uuid PK, cliente_id FK, nota text NULL, created_by, created_at, revertida_at timestamptz NULL.
- `ledger_entries`: id uuid PK, cliente_id FK, tipo enum('earn','redeem','reversal'), monto_puntos int (con signo), servicio_id FK NULL, premio_id FK NULL, visita_id FK NULL, reverses_entry_id FK NULL, nota text NULL, created_by, created_at.

Enforcement append-only a nivel DB: trigger que levante excepción ante UPDATE o DELETE sobre `ledger_entries` (defensa en profundidad además del dominio).

RLS: todas las tablas requieren usuario autenticado. Sin acceso anónimo. La columna `nota` puede contener dato sensible (Ley 25.326 argentina): accesible solo autenticado, documentá que NUNCA debe exponerse en superficie de cara a la clienta, URLs, logs ni mensajes de error. Esto reduce exposición, no es compliance completo.

## Operaciones a entregar

Pasan por el dominio (aplican invariantes):
1. `RegistrarVisita(cliente_id, servicio_ids[], nota?)`: en UNA transacción, crea la visita y una entrada `earn` por servicio, snapshoteando puntos_default. Atómico.
2. `CanjearPremio(cliente_id, premio_id)`: snapshot del costo, computa saldo, rechaza si saldo < costo, inserta `redeem` con monto negativo.
3. `DeshacerUltimaAccion(operador)`: identifica la última visita o canje NO revertido del operador; emite reversal compensatorios (uno por entrada original si es visita; marca visita.revertida_at). Acotado a la última acción no revertida.

Lecturas / CRUD pragmático (no fuerces al dominio):
4. `obtenerSaldo(cliente_id)`; `buscarClientesPorNombre(parcial)`; `historialDeServicios(cliente_id, servicio_id?, desde?, hasta?)` como proyección sobre el ledger EXCLUYENDO entradas revertidas; `progresoHaciaPremio(cliente_id, premio_id)`.
5. CRUD de servicios y premios (alta, edición, soft-delete).

## Puertos externos (sin implementar en v1)
`CalendarPort` (turnos) y `NotificationPort` (WhatsApp): declará las interfaces en el hexágono, stubs en adaptadores. NO los implementes. Muestran la frontera sin construir lo diferido.

## Cuándo evolucionar la arquitectura (incluí en el ADR)
Señales que justificarían subir de Hexagonal a Monolito Modular o DDD+Clean, y NO antes de que aparezcan:
- Aparece un segundo bounded context con lógica propia (ej. gestión de turnos con reglas reales, no carga manual; programa de referidos; facturación).
- El ledger deja de ser un solo agregado y necesita coordinar invariantes entre agregados.
- Más de un operador con roles y permisos distintos (rompe el supuesto de operador único).
- La capa de catálogos desarrolla reglas de negocio propias no triviales.
Mientras nada de esto pase, mantené el hexágono chico. Subir de nivel sin estas señales es sobre-ingeniería.

## NO hagas (límites explícitos)
- NO uses DDD + Clean Architecture de cuatro capas. Hexagonal con núcleo chico.
- NO impongas casos de uso formales ni DTOs a catálogos y búsqueda.
- NO construyas identificación por QR (diferido).
- NO construyas motor de reservas ni auto-reserva. Turnos = carga manual en Google Calendar, fuera de este sistema.
- NO integres WhatsApp API.
- NO implementes peso=punto / cashback. Puntos desacoplados del peso, por servicio.
- NO materialices ni cachees el saldo.
- NO uses event sourcing, buses CQRS, message brokers. El snapshot es por COPIA de valor en la columna. Append-only ≠ event sourcing.
- NO construyas UI/presentación (solo el seam stub).

## Entregables
1. `docs/ADR-001-arquitectura.md`: justificación de la elección y señales de evolución.
2. Migraciones SQL versionadas (extensiones, tablas, índices, enum, trigger append-only, RLS).
3. El hexágono: agregado `Visita`, value objects justificados, invariantes, interfaces de puerto (repositorio del ledger + Calendar/Notification).
4. Operaciones de dominio (1-3) con invariantes y excepciones tipadas.
5. Adaptadores: repositorio Supabase del ledger; CRUD de catálogos y búsqueda (pragmático); stubs de puertos externos.
6. Seam de Next.js (Server Actions / route handlers) declarado y vacío.

Antes de codear, si detectás una inconsistencia en el modelo o una invariante mal planteada, marcala y proponé corrección. No la "hagas funcionar" en silencio.