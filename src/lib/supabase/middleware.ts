/**
 * Refresco de sesión en el middleware (patrón oficial de @supabase/ssr).
 *
 * Los Server Components no pueden escribir cookies: si el token se renovara
 * ahí, el refresh token rotado se perdería y la sesión terminaría cayéndose.
 * El middleware corre antes que todo y sí puede escribirlas.
 *
 * Además manda a /login a quien no tenga sesión (salvo que ya esté ahí).
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { Database } from './database.types';
import { supabaseEnv } from './env';

export async function actualizarSesion(request: NextRequest): Promise<NextResponse> {
  const { url, anonKey } = supabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Nada entre crear el cliente y getUser(): es lo que refresca el token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    const destino = request.nextUrl.clone();
    destino.pathname = '/login';
    destino.search = '';
    return NextResponse.redirect(destino);
  }

  return response;
}
