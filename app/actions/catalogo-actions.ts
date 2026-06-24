'use server';

/**
 * Server Actions para catálogos y búsqueda: CRUD pragmático.
 *
 * NO pasan por el hexágono. Son queries y mutaciones directas via CatalogoRepository.
 */

import { revalidatePath } from 'next/cache';
import { supabase } from '@/lib/supabase/client';
import { CatalogoRepository } from '@/adapters/driven/catalogo-repository';

const catalogo = new CatalogoRepository(supabase);

export async function listarServiciosAction() {
  'use server';
  return catalogo.listarServicios();
}

export async function crearServicioAction(formData: FormData) {
  'use server';
  // Extraer nombre y puntos_default del formData.
  // await catalogo.crearServicio({ nombre, puntos_default });
  // revalidatePath('/catalogo/servicios');
  throw new Error('Stub: implementar en fase 2');
}

export async function actualizarServicioAction(id: string, formData: FormData) {
  'use server';
  // await catalogo.actualizarServicio(id, { nombre, puntos_default });
  // revalidatePath('/catalogo/servicios');
  throw new Error('Stub: implementar en fase 2');
}

export async function eliminarServicioAction(id: string) {
  'use server';
  await catalogo.eliminarServicio(id);
  revalidatePath('/catalogo/servicios');
}

export async function listarPremiosAction() {
  'use server';
  return catalogo.listarPremios();
}

export async function crearPremioAction(formData: FormData) {
  'use server';
  // await catalogo.crearPremio({ nombre, costo_puntos });
  // revalidatePath('/catalogo/premios');
  throw new Error('Stub: implementar en fase 2');
}

export async function actualizarPremioAction(id: string, formData: FormData) {
  'use server';
  // await catalogo.actualizarPremio(id, { nombre, costo_puntos });
  // revalidatePath('/catalogo/premios');
  throw new Error('Stub: implementar en fase 2');
}

export async function eliminarPremioAction(id: string) {
  'use server';
  await catalogo.eliminarPremio(id);
  revalidatePath('/catalogo/premios');
}

export async function buscarClientasAction(parcial: string) {
  'use server';
  return catalogo.buscarClientasPorNombre(parcial);
}

export async function crearClienteAction(formData: FormData) {
  'use server';
  // await catalogo.crearCliente({ nombre, telefono, dni });
  // revalidatePath('/clientas');
  throw new Error('Stub: implementar en fase 2');
}
