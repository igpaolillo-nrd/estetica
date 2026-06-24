import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/lib/supabase/database.types';
import { LedgerRepository } from '@/domain/ports';
import { Visita, LedgerEntry, LedgerTipo } from '@/domain/entities';
import { MontoPuntos } from '@/domain/value-objects';

/**
 * Implementación Supabase del repositorio del ledger.
 *
 * - Las escrituras atómicas (visita + earn, reversión) se delegan a funciones RPC
 *   de Postgres para garantizar transaccionalidad.
 * - Las lecturas (saldo, historial, última acción) usan SQL directo.
 */
export class SupabaseLedgerRepository implements LedgerRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async registrarVisita(
    visita: Visita,
    _entradas: LedgerEntry[]
  ): Promise<Visita> {
    const serviciosJson = visita.servicios.map((s) => ({
      servicio_id: s.servicioId,
      monto_puntos: s.montoPuntos.valor,
    }));

    const { error } = await this.db.rpc('guardar_visita_y_entradas', {
      p_visita_id: visita.id,
      p_cliente_id: visita.clienteId,
      p_nota: visita.nota ?? null,
      p_created_by: visita.createdBy,
      p_servicios: serviciosJson,
    });

    if (error) {
      throw new Error(`Error al registrar visita: ${error.message}`);
    }

    return visita;
  }

  async canjearPremio(entrada: LedgerEntry): Promise<void> {
    const { error } = await this.db.from('ledger_entries').insert({
      cliente_id: entrada.clienteId,
      tipo: entrada.tipo,
      monto_puntos: entrada.montoPuntos.valor,
      premio_id: entrada.premioId ?? null,
      nota: entrada.nota ?? null,
      created_by: entrada.createdBy,
    });

    if (error) {
      throw new Error(`Error al canjear premio: ${error.message}`);
    }
  }

  async obtenerSaldo(clienteId: string): Promise<number> {
    const { data, error } = await this.db
      .from('ledger_entries')
      .select('monto_puntos')
      .eq('cliente_id', clienteId);

    if (error) {
      throw new Error(`Error al obtener saldo: ${error.message}`);
    }

    return (data ?? []).reduce((sum, row) => sum + (row.monto_puntos ?? 0), 0);
  }

  async obtenerEntradasDeVisita(visitaId: string): Promise<LedgerEntry[]> {
    const { data, error } = await this.db
      .from('ledger_entries')
      .select('*')
      .eq('visita_id', visitaId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Error al obtener entradas de visita: ${error.message}`);
    }

    return (data ?? []).map((row) => this.toLedgerEntry(row));
  }

  async obtenerUltimaAccion(
    operadorId: string
  ): Promise<
    | { tipo: 'visita'; visita: Visita; entradas: LedgerEntry[] }
    | { tipo: 'redeem'; entrada: LedgerEntry }
    | null
  > {
    const [visitaResult, canjeResult] = await Promise.all([
      this.db
        .from('visitas')
        .select('*')
        .eq('created_by', operadorId)
        .is('revertida_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      this.db
        .from('ledger_entries')
        .select('*')
        .eq('tipo', 'redeem')
        .eq('created_by', operadorId)
        .not(
          'id',
          'in',
          this.db
            .from('ledger_entries')
            .select('reverses_entry_id')
            .eq('tipo', 'reversal')
            .not('reverses_entry_id', 'is', null)
        )
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (visitaResult.error) {
      throw new Error(`Error al obtener última visita: ${visitaResult.error.message}`);
    }
    if (canjeResult.error) {
      throw new Error(`Error al obtener último canje: ${canjeResult.error.message}`);
    }

    const visitaRow = visitaResult.data;
    const canjeRow = canjeResult.data;

    if (!visitaRow && !canjeRow) {
      return null;
    }

    const fechaVisita = visitaRow ? new Date(visitaRow.created_at) : null;
    const fechaCanje = canjeRow && canjeRow.created_at ? new Date(canjeRow.created_at) : null;

    const esVisitaMasReciente =
      fechaVisita &&
      (!fechaCanje || fechaVisita.getTime() >= fechaCanje.getTime());

    if (esVisitaMasReciente && visitaRow) {
      const entradas = await this.obtenerEntradasDeVisita(visitaRow.id);
      const visita = Visita.crear({
        id: visitaRow.id,
        clienteId: visitaRow.cliente_id,
        servicios: entradas.map((e) => ({
          servicioId: e.servicioId!,
          nombre: '', // no se almacena en ledger; se puede enriquecer si es necesario
          montoPuntos: e.montoPuntos,
        })),
        nota: visitaRow.nota ?? undefined,
        createdBy: visitaRow.created_by,
        createdAt: new Date(visitaRow.created_at),
      });
      return { tipo: 'visita', visita, entradas };
    }

    if (canjeRow) {
      return { tipo: 'redeem', entrada: this.toLedgerEntry(canjeRow) };
    }

    return null;
  }

  async guardarReversion(
    visita: Visita | null,
    _entradasReversal: LedgerEntry[]
  ): Promise<void> {
    if (visita) {
      const { error } = await this.db.rpc('guardar_reversion_visita', {
        p_visita_id: visita.id,
        p_operador_id: visita.createdBy,
      });
      if (error) {
        throw new Error(`Error al revertir visita: ${error.message}`);
      }
      return;
    }

    // Para canje, usamos la primera entrada reversal para obtener reverses_entry_id.
    // El dominio ya generó la entrada con la referencia correcta.
    const entradaReversal = _entradasReversal[0];
    if (!entradaReversal?.reversesEntryId) {
      throw new Error('Entrada reversal sin referencia al canje original');
    }

    const { error } = await this.db.rpc('guardar_reversion_canje', {
      p_entry_id: entradaReversal.reversesEntryId,
      p_operador_id: entradaReversal.createdBy,
    });

    if (error) {
      throw new Error(`Error al revertir canje: ${error.message}`);
    }
  }

  private toLedgerEntry(row: {
    id: string;
    cliente_id: string;
    tipo: LedgerTipo;
    monto_puntos: number;
    servicio_id: string | null;
    premio_id: string | null;
    visita_id: string | null;
    reverses_entry_id: string | null;
    nota: string | null;
    created_by: string;
    created_at: string;
  }): LedgerEntry {
    return {
      id: row.id,
      clienteId: row.cliente_id,
      tipo: row.tipo,
      montoPuntos: MontoPuntos.crear(row.monto_puntos),
      servicioId: row.servicio_id ?? undefined,
      premioId: row.premio_id ?? undefined,
      visitaId: row.visita_id ?? undefined,
      reversesEntryId: row.reverses_entry_id ?? undefined,
      nota: row.nota ?? undefined,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
    };
  }
}
