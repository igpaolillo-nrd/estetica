/**
 * Cliente Supabase por request para Server Actions y Server Components.
 *
 * Cada llamada crea un cliente nuevo atado a las cookies del request actual
 * (`cookies()` de `next/headers`). No hay cliente a nivel de módulo: uno con
 * sesión se compartiría entre requests (y entre usuarios).
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from './database.types';
import { supabaseEnv } from './env';

export function crearClienteServidor() {
  const { url, anonKey } = supabaseEnv();
  const cookieStore = cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Component: no puede escribir cookies. El middleware ya
          // refrescó la sesión en este request, así que se puede ignorar.
        }
      },
    },
  });
}
