import { Visita, LedgerEntry, ServicioSnapshot, PremioSnapshot } from './entities';
import { MontoPuntos } from './value-objects';
import { SaldoInsuficiente } from './errors';
import { LedgerRepository } from './ports';

/**
 * Operación de dominio: registrar una visita y otorgar puntos.
 *
 * Invariantes aplicadas:
 * - Una visita agrupa >= 1 servicio (Visita.crear).
 * - Cada entrada earn copia el monto snapshotteado del servicio (inmutable).
 * - La visita y sus entradas se persisten atómicamente.
 */
export async function registrarVisita(
  repositorio: LedgerRepository,
  props: {
    visitaId: string;
    clienteId: string;
    servicios: ServicioSnapshot[];
    nota?: string;
    createdBy: string;
  }
): Promise<Visita> {
  const visita = Visita.crear({
    id: props.visitaId,
    clienteId: props.clienteId,
    servicios: props.servicios,
    nota: props.nota,
    createdBy: props.createdBy,
  });

  const entradas = visita.generarEntradasEarn();
  return repositorio.registrarVisita(visita, entradas);
}

/**
 * Operación de dominio: canjear un premio.
 *
 * Invariantes aplicadas:
 * - Se snapshottea el costo del premio.
 * - Se computa el saldo actual.
 * - Si saldo < costo, se rechaza con SaldoInsuficiente.
 * - Se inserta una entrada redeem con monto negativo.
 */
export async function canjearPremio(
  repositorio: LedgerRepository,
  props: {
    clienteId: string;
    premio: PremioSnapshot;
    createdBy: string;
  }
): Promise<void> {
  const saldo = await repositorio.obtenerSaldo(props.clienteId);

  if (saldo < props.premio.costoPuntos.valor) {
    throw new SaldoInsuficiente(saldo, props.premio.costoPuntos.valor);
  }

  const entrada: LedgerEntry = {
    clienteId: props.clienteId,
    tipo: 'redeem',
    montoPuntos: props.premio.costoPuntos.negativo(),
    premioId: props.premio.premioId,
    nota: `Canje de premio: ${props.premio.nombre}`,
    createdBy: props.createdBy,
  };

  await repositorio.canjearPremio(entrada);
}

/**
 * Operación de dominio: deshacer la última acción no revertida de una operadora.
 *
 * Invariantes aplicadas:
 * - Solo se deshace la última acción no revertida.
 * - Para una visita: se emite una entrada reversal por cada entrada earn original,
 *   con monto de signo opuesto y referencia a la entrada original.
 * - Para un canje: se emite una única reversal con monto positivo.
 * - La visita queda marcada como revertida.
 */
export async function deshacerUltimaAccion(
  repositorio: LedgerRepository,
  props: {
    operadorId: string;
  }
): Promise<void> {
  const accion = await repositorio.obtenerUltimaAccion(props.operadorId);

  if (!accion) {
    // El repositorio ya devuelve null si no hay nada; dejamos el return para claridad.
    return;
  }

  if (accion.tipo === 'visita') {
    const { visita, entradas } = accion;
    visita.revertir();

    const entradasReversal: LedgerEntry[] = entradas.map((entrada) => ({
      clienteId: entrada.clienteId,
      tipo: 'reversal',
      montoPuntos: entrada.montoPuntos.negativo(),
      servicioId: entrada.servicioId,
      visitaId: entrada.visitaId,
      reversesEntryId: entrada.id,
      nota: `Reversión de visita ${visita.id}`,
      createdBy: props.operadorId,
    }));

    await repositorio.guardarReversion(visita, entradasReversal);
    return;
  }

  // Tipo 'redeem'
  const entradaReversal: LedgerEntry = {
    clienteId: accion.entrada.clienteId,
    tipo: 'reversal',
    montoPuntos: accion.entrada.montoPuntos.negativo(),
    premioId: accion.entrada.premioId,
    reversesEntryId: accion.entrada.id,
    nota: 'Reversión de canje',
    createdBy: props.operadorId,
  };

  await repositorio.guardarReversion(null, [entradaReversal]);
}

/**
 * Función pura de dominio: historial de servicios como proyección de lectura.
 * Excluye entradas revertidas (aquel cuya visita tiene revertidaAt o que tienen
 * una entrada reversal asociada).
 *
 * En el adaptador esto se traduce a una query SQL; aquí dejamos la semántica
 * documentada para que la proyección respete el invariante.
 */
export function proyectarHistorialServicios(
  entradas: LedgerEntry[],
  opts?: {
    servicioId?: string;
    desde?: Date;
    hasta?: Date;
  }
): LedgerEntry[] {
  const reversadas = new Set(
    entradas
      .filter((e) => e.tipo === 'reversal' && e.reversesEntryId)
      .map((e) => e.reversesEntryId!)
  );

  return entradas.filter((entrada) => {
    if (entrada.tipo !== 'earn') return false;
    if (reversadas.has(entrada.id ?? '')) return false;
    if (opts?.servicioId && entrada.servicioId !== opts.servicioId) return false;
    if (opts?.desde && entrada.createdAt && entrada.createdAt < opts.desde) return false;
    if (opts?.hasta && entrada.createdAt && entrada.createdAt > opts.hasta) return false;
    return true;
  });
}

/**
 * Función pura de dominio: progreso hacia un premio.
 */
export function calcularProgreso(
  saldo: number,
  costoPremio: MontoPuntos
): { saldo: number; costo: number; faltante: number; completado: boolean; porcentaje: number } {
  const costo = costoPremio.valor;
  const faltante = Math.max(0, costo - saldo);
  const completado = saldo >= costo;
  const porcentaje = costo === 0 ? 100 : Math.min(100, Math.round((saldo / costo) * 100));

  return { saldo, costo, faltante, completado, porcentaje };
}
