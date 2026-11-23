/**
 * Contexto de cada Server Action: cliente Supabase + id de la operadora.
 *
 * Único punto donde las actions resuelven sesión. Crea un cliente por request
 * con las cookies del request (`@/lib/supabase/server`) y valida el usuario
 * contra Supabase Auth con `getUser()` (no confía en la cookie sin verificar).
 * Sin usuario autenticado tira `SesionRequerida`.
 *
 * Sin 'use server': es un módulo interno, no un endpoint invocable.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Database } from '@/lib/supabase/database.types';
import { SesionRequerida } from './resultado';

export interface ContextoOperadora {
  db: SupabaseClient<Database>;
  operadorId: string;
}

export async function contextoOperadora(): Promise<ContextoOperadora> {
  const db = crearClienteServidor();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) {
    throw new SesionRequerida();
  }
  return { db, operadorId: data.user.id };
}
