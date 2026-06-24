import { NotificationPort } from '@/domain/ports';

/**
 * Stub del puerto de notificaciones.
 *
 * En la fase 1 no se integra WhatsApp. Este adaptador cumple la interfaz
 * del hexágono y loguea la intención para facilitar futuras pruebas.
 */
export class NotificationStub implements NotificationPort {
  async enviarMensaje(props: {
    destinatario: string;
    mensaje: string;
  }): Promise<void> {
    console.log('[NotificationStub] enviarMensaje', props);
  }
}
