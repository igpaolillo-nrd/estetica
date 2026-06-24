import { SupabaseClient } from '@supabase/supabase-js';
import { Database, Json } from '@/lib/supabase/database.types';
import { LedgerRepository } from '@/domain/ports';
import { Visita, LedgerEntry, LedgerTipo } from '@/domain/entities';
import { MontoPuntos } from '@/domain/value-objects';

/**
 * Implementación Supabase del repositorio del ledger.
 *
 * - Las escrituras atómicas se delegan a funciones RPC de Postgres.
 * - El dominio calcula las entradas; las RPCs solo insertan lo que reciben.
 * - Las lecturas (saldo, historial, última acción) usan SQL directo o RPCs de consulta.
 */
export class SupabaseLedgerRepository implements LedgerRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async registrarVisita(
    visita: Visita,
    entradas: LedgerEntry[]
  ): Promise<Visita> {
    const { error } = await this.db.rpc('guardar_visita_y_entradas', {
      p_visita_id: visita.id,
      p_cliente_id: visita.clienteId,
      p_nota: visita.nota ?? null,
      p_created_by: visita.createdBy,
      p_entradas: entradas.map((e) => this.entradaToJson(e)),
    });

    if (error) {
      throw new Error(`Error al registrar visita: ${error.message}`);
    }

    return visita;
  }

  async canjearPremio(entrada: LedgerEntry): Promise<void> {
    const { error } = await this.db.rpc('guardar_canje', {
      p_entrada: this.entradaToJson(entrada),
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
    const { data, error } = await this.db.rpc('obtener_ultima_accion', {
      p_operador_id: operadorId,
    });

    if (error) {
      throw new Error(`Error al obtener última acción: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    const payload = data as {
      tipo: 'visita' | 'redeem';
      visita?: {
        id: string;
        cliente_id: string;
        nota: string | null;
        created_by: string;
        created_at: string;
        revertida_at: string | null;
      };
      entradas?: Array<{
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
      }>;
      entrada?: {
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
      };
    };

    if (payload.tipo === 'visita' && payload.visita && payload.entradas) {
      const entradas = payload.entradas.map((e) => this.toLedgerEntry(e));
      const visita = Visita.crear({
        id: payload.visita.id,
        clienteId: payload.visita.cliente_id,
        servicios: entradas.map((e) => ({
          servicioId: e.servicioId!,
          montoPuntos: e.montoPuntos,
        })),
        nota: payload.visita.nota ?? undefined,
        createdBy: payload.visita.created_by,
        createdAt: new Date(payload.visita.created_at),
      });
      return { tipo: 'visita', visita, entradas };
    }

    if (payload.tipo === 'redeem' && payload.entrada) {
      return { tipo: 'redeem', entrada: this.toLedgerEntry(payload.entrada) };
    }

    return null;
  }

  async guardarReversion(
    visita: Visita | null,
    entradasReversal: LedgerEntry[]
  ): Promise<void> {
    if (visita) {
      const { error } = await this.db.rpc('guardar_reversion_visita', {
        p_visita_id: visita.id,
        p_operador_id: visita.createdBy,
        p_entradas: entradasReversal.map((e) => this.entradaToJson(e)),
      });
      if (error) {
        throw new Error(`Error al revertir visita: ${error.message}`);
      }
      return;
    }

    const entradaReversal = entradasReversal[0];
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

  private entradaToJson(entrada: LedgerEntry): Record<string, Json> {
    return {
      id: entrada.id ?? null,
      cliente_id: entrada.clienteId,
      tipo: entrada.tipo,
      monto_puntos: entrada.montoPuntos.valor,
      servicio_id: entrada.servicioId ?? null,
      premio_id: entrada.premioId ?? null,
      visita_id: entrada.visitaId ?? null,
      reverses_entry_id: entrada.reversesEntryId ?? null,
      nota: entrada.nota ?? null,
      created_by: entrada.createdBy,
    };
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
