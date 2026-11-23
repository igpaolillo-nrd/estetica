'use server';

/**
 * Login y logout de la operadora con email y contraseña (Supabase Auth).
 *
 * Corre en el servidor: el cliente por request escribe las cookies de sesión.
 * Nunca se loguean ni se devuelven el email ni la contraseña; al log va solo
 * el código del error de Auth.
 */

import { redirect } from 'next/navigation';
import { crearClienteServidor } from '@/lib/supabase/server';

export type EstadoLogin = { error: string | null };

const EMAIL_MAX = 254;
const PASSWORD_MAX = 128;

export async function iniciarSesionAction(
  _previo: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const email = formData.get('email');
  const password = formData.get('password');
  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    !email.trim() ||
    !password ||
    email.length > EMAIL_MAX ||
    password.length > PASSWORD_MAX
  ) {
    return { error: 'Completá email y contraseña.' };
  }

  try {
    const db = crearClienteServidor();
    const { error } = await db.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      if (error.code === 'invalid_credentials' || error.status === 400) {
        return { error: 'Email o contraseña incorrectos.' };
      }
      console.error('[iniciarSesion]', error.code ?? error.status ?? 'auth');
      return { error: 'No se pudo iniciar sesión. Probá de nuevo.' };
    }
  } catch (e) {
    console.error('[iniciarSesion]', e instanceof Error ? e.name : 'error desconocido');
    return { error: 'No se pudo iniciar sesión. Probá de nuevo.' };
  }

  // Fuera del try: redirect() funciona tirando una excepción de Next.
  redirect('/');
}

export async function cerrarSesionAction(): Promise<void> {
  try {
    await crearClienteServidor().auth.signOut();
  } catch (e) {
    console.error('[cerrarSesion]', e instanceof Error ? e.name : 'error desconocido');
  }
  redirect('/login');
}
