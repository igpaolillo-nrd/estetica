'use server';

/**
 * Server Actions de Next.js como adaptadores de entrada (driving adapters).
 *
 * En esta fase son stubs: declaran la frontera donde la UI invocará al dominio,
 * sin implementar presentación ni flujo completo de autenticación.
 */

import { revalidatePath } from 'next/cache';
import { supabase } from '@/lib/supabase/client';
import { SupabaseLedgerRepository } from '@/adapters/driven/ledger-repository';
import { CalendarStub } from '@/adapters/driven/calendar-stub';
import { NotificationStub } from '@/adapters/driven/notification-stub';
import {
  registrarVisita,
  canjearPremio,
  deshacerUltimaAccion,
  calcularProgreso,
} from '@/domain/operations';
import { MontoPuntos } from '@/domain/value-objects';
import { ServicioSnapshot, PremioSnapshot } from '@/domain/entities';

// NOTA: en producción el cliente de Server Actions debe usar @supabase/ssr
// con el rol autenticado de la operadora, no la anon key.
const ledgerRepo = new SupabaseLedgerRepository(supabase);
const calendar = new CalendarStub();
const notification = new NotificationStub();

export async function registrarVisitaAction(formData: FormData) {
  'use server';

  // 1. Obtener usuario autenticado (operadora).
  // 2. Extraer cliente_id, servicio_ids[] y nota del formData.
  // 3. Snapshotear servicios leyendo puntos_default del catálogo.
  // 4. Invocar operación de dominio:
  //    await registrarVisita(ledgerRepo, { visitaId: crypto.randomUUID(), clienteId, servicios, nota, createdBy });
  // 5. Opcional: calendar.registrarTurnoManual(...) / notification.enviarMensaje(...)
  // 6. revalidatePath('/clientas/[id]');

  throw new Error('Stub: implementar en fase 2');
}

export async function canjearPremioAction(formData: FormData) {
  'use server';

  // 1. Obtener usuario autenticado.
  // 2. Extraer cliente_id y premio_id.
  // 3. Snapshotear premio (costo_puntos).
  // 4. Invocar operación de dominio:
  //    await canjearPremio(ledgerRepo, { clienteId, premio: { premioId, nombre, costoPuntos: MontoPuntos.crear(costo) }, createdBy });
  // 5. revalidatePath('/clientas/[id]');

  throw new Error('Stub: implementar en fase 2');
}

export async function deshacerUltimaAccionAction() {
  'use server';

  // 1. Obtener usuario autenticado (operadora).
  // 2. Invocar operación de dominio:
  //    await deshacerUltimaAccion(ledgerRepo, { operadorId });
  // 3. revalidatePath('/clientas/[id]');

  throw new Error('Stub: implementar en fase 2');
}

export async function obtenerSaldoAction(clienteId: string) {
  'use server';

  // Lectura pragmática: delega directamente en el repositorio.
  return ledgerRepo.obtenerSaldo(clienteId);
}

export async function progresoHaciaPremioAction(
  clienteId: string,
  premioId: string
) {
  'use server';

  // 1. Leer saldo actual.
  // 2. Leer costo_puntos del premio.
  // 3. calcularProgreso(saldo, MontoPuntos.crear(costo)).

  throw new Error('Stub: implementar en fase 2');
}
