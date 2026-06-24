import { CalendarPort } from '@/domain/ports';

/**
 * Stub del puerto de calendario.
 *
 * En la fase 1 no se integra Google Calendar. Este adaptador cumple la interfaz
 * del hexágono y loguea la intención para facilitar futuras pruebas.
 */
export class CalendarStub implements CalendarPort {
  async registrarTurnoManual(props: {
    clienteId: string;
    fecha: Date;
    nota?: string;
  }): Promise<void> {
    console.log('[CalendarStub] registrarTurnoManual', props);
  }
}
