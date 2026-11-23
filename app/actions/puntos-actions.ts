'use server';

/**
 * Server Actions de Next.js como adaptadores de entrada (driving adapters) del
 * ledger de puntos: ficha/saldo, visita, canje y deshacer.
 *
 * Reglas:
 * - El cálculo y las invariantes los decide el dominio (`@/domain/operations`).
 * - La persistencia atómica la hace SupabaseLedgerRepository (RPCs).
 * - `nota` (Ley 25.326) solo entra (registrar visita). Ninguna action la
 *   devuelve, la loguea, la pone en una URL ni en un mensaje de error.
 * - Toda action devuelve `Resultado<T>`; los errores salen como texto corto
 *   para la operadora.
 */

import { revalidatePath } from 'next/cache';
import { SupabaseLedgerRepository } from '@/adapters/driven/ledger-repository';
import { CatalogoRepository } from '@/adapters/driven/catalogo-repository';
import {
  registrarVisita,
  canjearPremio,
  deshacerUltimaAccion,
  calcularProgreso,
} from '@/domain/operations';
import { MontoPuntos } from '@/domain/value-objects';
import { ServicioSnapshot } from '@/domain/entities';
import { LedgerRepository } from '@/domain/ports';
import { contextoOperadora, ContextoOperadora } from './contexto';
import { Resultado, ok, fallo, uuid, textoOpcional, EntradaInvalida } from './resultado';

const NOTA_MAX = 500;
const SERVICIOS_MAX = 20;

function repos(ctx: ContextoOperadora) {
  return {
    ledger: new SupabaseLedgerRepository(ctx.db),
    catalogo: new CatalogoRepository(ctx.db),
  };
}

function revalidarClienta(clienteId: string) {
  revalidatePath(`/clientas/${clienteId}`);
}

// --- Lecturas ---

export async function obtenerSaldoAction(clienteId: string): Promise<Resultado<number>> {
  'use server';
  try {
    const id = uuid(clienteId, 'clienta');
    const ctx = await contextoOperadora();
    return ok(await repos(ctx).ledger.obtenerSaldo(id));
  } catch (e) {
    return fallo(e, 'obtenerSaldo');
  }
}

export type FichaClienta = {
  id: string;
  nombre: string;
  telefono: string;
  dni: string | null;
  saldo: number;
};

/**
 * Ficha de mostrador: datos básicos + saldo (SUM en SQL). Sin historial ni notas.
 */
export async function obtenerFichaClientaAction(
  clienteId: string
): Promise<Resultado<FichaClienta>> {
  'use server';
  try {
    const id = uuid(clienteId, 'clienta');
    const ctx = await contextoOperadora();
    const { ledger, catalogo } = repos(ctx);
    const [clienta, saldo] = await Promise.all([
      catalogo.obtenerCliente(id),
      ledger.obtenerSaldo(id),
    ]);
    if (!clienta) throw new EntradaInvalida('No encontramos a esa clienta.');
    return ok({
      id: clienta.id,
      nombre: clienta.nombre,
      telefono: clienta.telefono,
      dni: clienta.dni,
      saldo,
    });
  } catch (e) {
    return fallo(e, 'obtenerFichaClienta');
  }
}

export async function progresoHaciaPremioAction(
  clienteId: string,
  premioId: string
): Promise<Resultado<ReturnType<typeof calcularProgreso>>> {
  'use server';
  try {
    const cId = uuid(clienteId, 'clienta');
    const pId = uuid(premioId, 'premio');
    const ctx = await contextoOperadora();
    const { ledger, catalogo } = repos(ctx);
    const [saldo, premio] = await Promise.all([
      ledger.obtenerSaldo(cId),
      catalogo.obtenerPremio(pId),
    ]);
    if (!premio || !premio.activo) throw new EntradaInvalida('Ese premio no está disponible.');
    return ok(calcularProgreso(saldo, MontoPuntos.crear(premio.costo_puntos)));
  } catch (e) {
    return fallo(e, 'progresoHaciaPremio');
  }
}

// --- Escrituras ---

/**
 * Registra una visita con >= 1 servicio y suma sus puntos.
 * Campos del form: `cliente_id`, `servicio_id` (repetible, uno por servicio),
 * `nota` (opcional, sensible).
 *
 * Los puntos se snapshotean del catálogo activo en este momento.
 */
export async function registrarVisitaAction(
  formData: FormData
): Promise<Resultado<{ visitaId: string; puntosSumados: number; saldo: number }>> {
  'use server';
  try {
    const clienteId = uuid(formData.get('cliente_id'), 'clienta');
    const servicioIds = formData.getAll('servicio_id').map((v) => uuid(v, 'servicio'));
    if (servicioIds.length === 0) throw new EntradaInvalida('Elegí al menos un servicio.');
    if (servicioIds.length > SERVICIOS_MAX) throw new EntradaInvalida('Demasiados servicios.');
    const nota = textoOpcional(formData.get('nota'), NOTA_MAX);

    const ctx = await contextoOperadora();
    const { ledger, catalogo } = repos(ctx);

    const activos = new Map((await catalogo.listarServicios()).map((s) => [s.id, s]));
    const servicios: ServicioSnapshot[] = servicioIds.map((id) => {
      const servicio = activos.get(id);
      if (!servicio) throw new EntradaInvalida('Uno de los servicios ya no está disponible.');
      return { servicioId: id, montoPuntos: MontoPuntos.crear(servicio.puntos_default) };
    });

    const visita = await registrarVisita(ledger, {
      visitaId: crypto.randomUUID(),
      clienteId,
      servicios,
      nota,
      createdBy: ctx.operadorId,
    });

    const saldo = await ledger.obtenerSaldo(clienteId);
    revalidarClienta(clienteId);
    return ok({
      visitaId: visita.id,
      puntosSumados: servicios.reduce((t, s) => t + s.montoPuntos.valor, 0),
      saldo,
    });
  } catch (e) {
    return fallo(e, 'registrarVisita');
  }
}

/**
 * Canjea un premio. El dominio rechaza si el saldo no alcanza.
 * Campos del form: `cliente_id`, `premio_id`.
 */
export async function canjearPremioAction(
  formData: FormData
): Promise<Resultado<{ premio: string; costo: number; saldo: number }>> {
  'use server';
  try {
    const clienteId = uuid(formData.get('cliente_id'), 'clienta');
    const premioId = uuid(formData.get('premio_id'), 'premio');

    const ctx = await contextoOperadora();
    const { ledger, catalogo } = repos(ctx);

    const premio = await catalogo.obtenerPremio(premioId);
    if (!premio || !premio.activo) throw new EntradaInvalida('Ese premio no está disponible.');

    await canjearPremio(ledger, {
      clienteId,
      premio: { premioId, costoPuntos: MontoPuntos.crear(premio.costo_puntos) },
      createdBy: ctx.operadorId,
    });

    const saldo = await ledger.obtenerSaldo(clienteId);
    revalidarClienta(clienteId);
    return ok({ premio: premio.nombre, costo: premio.costo_puntos, saldo });
  } catch (e) {
    return fallo(e, 'canjearPremio');
  }
}

// --- Deshacer ---

type UltimaAccion = Awaited<ReturnType<LedgerRepository['obtenerUltimaAccion']>>;

export type ResumenAccion = {
  tipo: 'visita' | 'canje';
  clienteId: string;
  clienteNombre: string | null;
  /** Puntos que movió la acción original (+ visita, − canje). */
  puntos: number;
  fecha: string | null;
};

async function resumir(
  accion: NonNullable<UltimaAccion>,
  catalogo: CatalogoRepository
): Promise<ResumenAccion> {
  const base =
    accion.tipo === 'visita'
      ? {
          tipo: 'visita' as const,
          clienteId: accion.visita.clienteId,
          puntos: accion.entradas.reduce((t, e) => t + e.montoPuntos.valor, 0),
          fecha: accion.visita.createdAt.toISOString(),
        }
      : {
          tipo: 'canje' as const,
          clienteId: accion.entrada.clienteId,
          puntos: accion.entrada.montoPuntos.valor,
          fecha: accion.entrada.createdAt?.toISOString() ?? null,
        };
  const clienta = await catalogo.obtenerCliente(base.clienteId);
  return { ...base, clienteNombre: clienta?.nombre ?? null };
}

/**
 * Vista previa de lo que desharía el botón "Deshacer", para confirmar antes.
 * `null` si no hay nada para deshacer.
 */
export async function verUltimaAccionAction(): Promise<Resultado<ResumenAccion | null>> {
  'use server';
  try {
    const ctx = await contextoOperadora();
    const { ledger, catalogo } = repos(ctx);
    const accion = await ledger.obtenerUltimaAccion(ctx.operadorId);
    return ok(accion ? await resumir(accion, catalogo) : null);
  } catch (e) {
    return fallo(e, 'verUltimaAccion');
  }
}

/**
 * Deshace la última acción no revertida de la operadora con reversa
 * compensatoria (el dominio emite las entradas `reversal`). El saldo puede
 * quedar negativo si la clienta ya gastó esos puntos: es válido por diseño.
 *
 * Devuelve qué se deshizo y el saldo nuevo, o `null` si no había nada.
 * Cada llamada deshace UNA acción; llamarla de nuevo deshace la anterior.
 */
export async function deshacerUltimaAccionAction(): Promise<
  Resultado<(ResumenAccion & { saldo: number }) | null>
> {
  'use server';
  try {
    const ctx = await contextoOperadora();
    const { ledger, catalogo } = repos(ctx);

    // Captura la acción que lee el dominio para informar qué se deshizo sin
    // una segunda lectura (y sin cambiar la firma de deshacerUltimaAccion).
    let deshecha: UltimaAccion = null;
    const repoConCaptura: LedgerRepository = Object.create(ledger, {
      obtenerUltimaAccion: {
        value: async (operadorId: string) => {
          deshecha = await ledger.obtenerUltimaAccion(operadorId);
          return deshecha;
        },
      },
    });

    await deshacerUltimaAccion(repoConCaptura, { operadorId: ctx.operadorId });

    const accion = deshecha as UltimaAccion;
    if (!accion) return ok(null);

    const resumen = await resumir(accion, catalogo);
    const saldo = await ledger.obtenerSaldo(resumen.clienteId);
    revalidarClienta(resumen.clienteId);
    return ok({ ...resumen, saldo });
  } catch (e) {
    return fallo(e, 'deshacerUltimaAccion');
  }
}
