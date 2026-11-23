# Avances

## 2026-11-23 — UI mobile-first de mostrador

**Hecho (verificado: `npm run typecheck`, `npm run lint`, `next build` OK; `npm test` 41/41 contra Postgres local con 001–008; recorrido completo en Chromium como iPhone 13 contra un Supabase simulado sobre Postgres local: buscar → alta → visita → canje → deshacer canje → deshacer visita, saldos correctos)**
- Base: `main` no traía el login (el merge de PR #3 solo agregó `server-actions-mostrador.patch` en la raíz). Se aplicó `login-operadora.patch` sobre esta rama.
- `/` : buscador por nombre, teléfono o DNI (espera 300 ms, descarta respuestas viejas) y alta rápida (nombre + teléfono, DNI opcional; lo tipeado precarga el campo). Al guardar abre la ficha.
- `/clientas/[id]`: nombre, teléfono, DNI y saldo grande (SUM en SQL). Registrar visita (tocar ≥ 1 servicio, ve suma y saldo resultante, confirma) y canjear premio (los que no alcanzan se ven con "Le faltan N puntos" y no se pueden elegir; confirmación con tiene/cuesta/le quedan; error del servidor se muestra tal cual).
- Deshacer en el encabezado de todas las pantallas: vista previa con nombre de la clienta, hora y efecto en puntos → "Sí, deshacer" → qué se deshizo y saldo nuevo.
- Sin campo `nota` en ninguna pantalla. CSS plano en `app/globals.css` (botones ≥ 56 px, letra 18–20 px). Componentes en `app/_mostrador/`.
- `npm run lint` no estaba configurado (pedía setup interactivo): se agregó `.eslintrc.json` (`next/core-web-vitals`) con `eslint@8` y `eslint-config-next@14` como devDependencies.

**Decisiones**
- Ficha como ruta propia (coincide con el `revalidatePath('/clientas/:id')` de las actions y el botón Atrás del celular vuelve al buscador).
- Visita y canje dentro de la ficha, sin pantallas extra.

**Qué sigue**
- Prueba real con Supabase de la dueña: aplicar 001–008, crear la usuaria en Auth, cargar env, cargar servicios y premios (el CRUD de catálogo sigue stub).
- Probar en el celular real de la operadora (tamaño de letra del sistema, teclado numérico).

**Bloqueos / espera**
- Ninguno técnico. Sigue abierta la decisión de `nota` (Ley 25.326).

## 2026-11-23 — Login de la operadora y sesión por request

**Hecho (verificado: `npm run typecheck`, `npm test` 39/39 contra Postgres local con 001–008, `next build` OK; smoke con `next start`: `/` sin sesión → 307 a `/login`)**
- `@supabase/ssr` instalado. `src/lib/supabase/server.ts`: cliente por request con `cookies()` de `next/headers`; sin cliente a nivel de módulo. Se borró `client.ts` (cliente compartido).
- `app/actions/contexto.ts`: valida la sesión con `getUser()` por request; sin usuario → `SesionRequerida`. Ninguna otra action cambió.
- `middleware.ts` + `src/lib/supabase/middleware.ts`: refresca el token en cada request (los Server Components no pueden escribir cookies) y manda a `/login` a quien no tenga sesión.
- `/login` (email + contraseña, Server Action), `cerrarSesionAction`, `app/layout.tsx` y `app/page.tsx` (mostrador: placeholder protegido con botón Salir).
- Tests: `contexto.test.ts` (resuelve/rechaza, cliente nuevo por llamada), `server.test.ts` (cookies, Server Component de solo lectura, env faltante), `login/actions.test.ts` (redirige; no loguea ni devuelve email/contraseña).

**Decisiones**
- Login por Server Action, sin cliente Supabase en el navegador.
- Middleware incluido: sin él, la rotación del refresh token en Server Components termina cerrando la sesión.

**Qué sigue**
- Crear la usuaria de la operadora en Supabase Auth (signup deshabilitado) y cargar `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Probar login real contra Supabase (no verificado: no hay proyecto Supabase en este entorno).
- UI mobile-first de mostrador sobre `app/page.tsx`.

**Bloqueos / espera**
- Sigue abierta la decisión de `nota` (Ley 25.326), ver entrada anterior.

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
