import { Visita, LedgerEntry } from './entities';

/**
 * Puerto de salida: persistencia del ledger y operaciones atómicas.
 * El dominio lo declara; la implementación concreta vive en adaptadores.
 */
export interface LedgerRepository {
  /**
   * Crea la visita y sus entradas earn en una sola transacción atómica.
   */
  registrarVisita(visita: Visita, entradas: LedgerEntry[]): Promise<Visita>;

  /**
   * Crea una entrada redeem atómicamente.
   */
  canjearPremio(entrada: LedgerEntry): Promise<void>;

  /**
   * Devuelve la suma de monto_puntos para una clienta.
   * El saldo nunca se materializa ni cachea; se computa en cada lectura.
   */
  obtenerSaldo(clienteId: string): Promise<number>;

  /**
   * Devuelve todas las entradas de una visita, en orden cronológico.
   */
  obtenerEntradasDeVisita(visitaId: string): Promise<LedgerEntry[]>;

  /**
   * Devuelve la última acción no revertida de una operadora:
   * - una visita con sus entradas earn, o
   * - un canje individual.
   *
   * Si no hay acción reversible, devuelve null.
   */
  obtenerUltimaAccion(operadorId: string): Promise<
    | { tipo: 'visita'; visita: Visita; entradas: LedgerEntry[] }
    | { tipo: 'redeem'; entrada: LedgerEntry }
    | null
  >;

  /**
   * Persiste las entradas reversal y, en caso de visita, marca revertida_at.
   */
  guardarReversion(
    visita: Visita | null,
    entradasReversal: LedgerEntry[]
  ): Promise<void>;
}

/**
 * Puerto de salida: sistema externo de calendario/turnos.
 * En la fase 1 es solo un stub; más adelante puede adaptar Google Calendar.
 */
export interface CalendarPort {
  registrarTurnoManual(props: {
    clienteId: string;
    fecha: Date;
    nota?: string;
  }): Promise<void>;
}

/**
 * Puerto de salida: sistema externo de notificaciones.
 * En la fase 1 es solo un stub; más adelante puede adaptar WhatsApp.
 */
export interface NotificationPort {
  enviarMensaje(props: {
    destinatario: string;
    mensaje: string;
  }): Promise<void>;
}
