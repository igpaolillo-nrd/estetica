'use server';

/**
 * Server Actions para catálogos y búsqueda: CRUD pragmático.
 *
 * NO pasan por el hexágono. Son queries y mutaciones directas via CatalogoRepository.
 */

import { revalidatePath } from 'next/cache';
import { CatalogoRepository } from '@/adapters/driven/catalogo-repository';
import { contextoOperadora } from './contexto';
import { Resultado, ok, fallo, EntradaInvalida } from './resultado';

async function catalogoDeOperadora() {
  const { db } = await contextoOperadora();
  return new CatalogoRepository(db);
}

export type ClientaResumen = {
  id: string;
  nombre: string;
  telefono: string;
  dni: string | null;
};

function aResumen(c: ClientaResumen): ClientaResumen {
  return { id: c.id, nombre: c.nombre, telefono: c.telefono, dni: c.dni };
}

export async function listarServiciosAction(): Promise<
  Resultado<{ id: string; nombre: string; puntos_default: number }[]>
> {
  'use server';
  try {
    const servicios = await (await catalogoDeOperadora()).listarServicios();
    return ok(servicios.map((s) => ({ id: s.id, nombre: s.nombre, puntos_default: s.puntos_default })));
  } catch (e) {
    return fallo(e, 'listarServicios');
  }
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
  await (await catalogoDeOperadora()).eliminarServicio(id);
  revalidatePath('/catalogo/servicios');
}

export async function listarPremiosAction(): Promise<
  Resultado<{ id: string; nombre: string; costo_puntos: number }[]>
> {
  'use server';
  try {
    const premios = await (await catalogoDeOperadora()).listarPremios();
    return ok(premios.map((p) => ({ id: p.id, nombre: p.nombre, costo_puntos: p.costo_puntos })));
  } catch (e) {
    return fallo(e, 'listarPremios');
  }
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
  await (await catalogoDeOperadora()).eliminarPremio(id);
  revalidatePath('/catalogo/premios');
}

/**
 * Búsqueda incremental por nombre (sin acentos), teléfono o DNI.
 * Menos de 2 caracteres devuelve vacío para no traer media base por tecla.
 */
export async function buscarClientasAction(
  parcial: string
): Promise<Resultado<ClientaResumen[]>> {
  'use server';
  try {
    const texto = typeof parcial === 'string' ? parcial.trim().slice(0, 60) : '';
    if (texto.length < 2) return ok([]);
    const clientas = await (await catalogoDeOperadora()).buscarClientasPorNombre(texto, 10);
    return ok(clientas.map(aResumen));
  } catch (e) {
    return fallo(e, 'buscarClientas');
  }
}

/** Solo dígitos (y '+' inicial): la búsqueda por teléfono matchea aunque se tipee con espacios o guiones. */
function normalizarTelefono(valor: string): string {
  const t = valor.trim();
  return (t.startsWith('+') ? '+' : '') + t.replace(/\D/g, '');
}

/**
 * Alta rápida en el mostrador: nombre y teléfono obligatorios, DNI opcional.
 * Campos del form: `nombre`, `telefono`, `dni`.
 */
export async function crearClienteAction(
  formData: FormData
): Promise<Resultado<ClientaResumen>> {
  'use server';
  try {
    const nombre = String(formData.get('nombre') ?? '').trim().replace(/\s+/g, ' ');
    if (nombre.length < 2 || nombre.length > 120) {
      throw new EntradaInvalida('Escribí el nombre de la clienta.');
    }

    const telefono = normalizarTelefono(String(formData.get('telefono') ?? ''));
    if (telefono.replace('+', '').length < 6 || telefono.length > 20) {
      throw new EntradaInvalida('Revisá el teléfono.');
    }

    const dniCrudo = String(formData.get('dni') ?? '').replace(/[.\s-]/g, '');
    if (dniCrudo && !/^\d{6,9}$/.test(dniCrudo)) {
      throw new EntradaInvalida('Revisá el DNI (solo números).');
    }

    const clienta = await (await catalogoDeOperadora()).crearCliente({
      nombre,
      telefono,
      dni: dniCrudo || null,
    });
    revalidatePath('/clientas');
    return ok(aResumen(clienta));
  } catch (e) {
    return fallo(e, 'crearCliente');
  }
}
