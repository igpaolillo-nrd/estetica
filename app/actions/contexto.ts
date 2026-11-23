/**
 * Contexto de cada Server Action: cliente Supabase + id de la operadora.
 *
 * Único punto donde las actions resuelven sesión. Hoy usa el cliente compartido
 * de `@/lib/supabase/client` (anon key, sin cookies): en el servidor no hay
 * sesión, así que toda action responde "sesión requerida" hasta que exista el
 * login. Cuando se agregue, este archivo pasa a crear un cliente por request
 * con `@supabase/ssr` + `cookies()` de `next/headers` (un cliente con sesión a
 * nivel de módulo se compartiría entre requests). Nada más cambia.
 *
 * Sin 'use server': es un módulo interno, no un endpoint invocable.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { Database } from '@/lib/supabase/database.types';
import { SesionRequerida } from './resultado';

export interface ContextoOperadora {
  db: SupabaseClient<Database>;
  operadorId: string;
}

export async function contextoOperadora(): Promise<ContextoOperadora> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new SesionRequerida();
  }
  return { db: supabase, operadorId: data.user.id };
}
