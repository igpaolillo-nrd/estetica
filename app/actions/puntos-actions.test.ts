import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Cableado de las Server Actions de puntos con repositorios en memoria.
 * Lo que se prueba acá es la action (validación, snapshot, mapeo de errores,
 * que `nota` no salga), no la persistencia: eso lo cubren los tests de dominio
 * y de integración SQL.
 */

const estado = vi.hoisted(() => ({
  operadorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as string | null,
  servicios: [] as { id: string; nombre: string; puntos_default: number; activo: boolean }[],
  premios: [] as { id: string; nombre: string; costo_puntos: number; activo: boolean }[],
  clientes: [] as { id: string; nombre: string; telefono: string; dni: string | null }[],
  visitas: [] as { visita: any; entradas: any[] }[],
  entradas: [] as any[],
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('./contexto', async () => {
  const { SesionRequerida } = await import('./resultado');
  return {
    contextoOperadora: async () => {
      if (!estado.operadorId) throw new SesionRequerida();
      return { db: {}, operadorId: estado.operadorId };
    },
  };
});

vi.mock('@/adapters/driven/catalogo-repository', () => ({
  CatalogoRepository: class {
    async listarServicios() {
      return estado.servicios.filter((s) => s.activo);
    }
    async obtenerPremio(id: string) {
      return estado.premios.find((p) => p.id === id) ?? null;
    }
    async obtenerCliente(id: string) {
      return estado.clientes.find((c) => c.id === id) ?? null;
    }
  },
}));

vi.mock('@/adapters/driven/ledger-repository', () => ({
  SupabaseLedgerRepository: class {
    async registrarVisita(visita: any, entradas: any[]) {
      const conId = entradas.map((e, i) => ({ ...e, id: `${visita.id}-${i}` }));
      estado.visitas.push({ visita, entradas: conId });
      estado.entradas.push(...conId);
      return visita;
    }
    async canjearPremio(entrada: any) {
      estado.entradas.push({ ...entrada, id: `canje-${estado.entradas.length}`, createdAt: new Date() });
    }
    async obtenerSaldo(clienteId: string) {
      return estado.entradas
        .filter((e) => e.clienteId === clienteId)
        .reduce((t, e) => t + e.montoPuntos.valor, 0);
    }
    async obtenerUltimaAccion() {
      const v = [...estado.visitas].reverse().find((x) => !x.visita.estaRevertida());
      return v ? { tipo: 'visita', visita: v.visita, entradas: v.entradas } : null;
    }
    async guardarReversion(_visita: any, reversales: any[]) {
      estado.entradas.push(...reversales);
    }
  },
}));

import {
  registrarVisitaAction,
  canjearPremioAction,
  deshacerUltimaAccionAction,
  obtenerFichaClientaAction,
} from './puntos-actions';

const CLIENTA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const S1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01';
const S2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccc02';
const S_INACTIVO = 'cccccccc-cccc-4ccc-8ccc-cccccccccc03';
const PREMIO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function form(campos: [string, string][]) {
  const f = new FormData();
  for (const [k, v] of campos) f.append(k, v);
  return f;
}

beforeEach(() => {
  estado.operadorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  estado.servicios = [
    { id: S1, nombre: 'Limpieza', puntos_default: 10, activo: true },
    { id: S2, nombre: 'Masaje', puntos_default: 25, activo: true },
    { id: S_INACTIVO, nombre: 'Viejo', puntos_default: 99, activo: false },
  ];
  estado.premios = [{ id: PREMIO, nombre: 'Mascarilla', costo_puntos: 30, activo: true }];
  estado.clientes = [{ id: CLIENTA, nombre: 'Rosa', telefono: '1155550000', dni: null }];
  estado.visitas = [];
  estado.entradas = [];
});

describe('Server Actions de puntos', () => {
  it('registrar visita snapshotea puntos del catálogo y devuelve saldo, sin nota', async () => {
    const r = await registrarVisitaAction(
      form([
        ['cliente_id', CLIENTA],
        ['servicio_id', S1],
        ['servicio_id', S2],
        ['nota', 'alergia a X'],
      ])
    );
    expect(r).toEqual({
      ok: true,
      data: { visitaId: expect.any(String), puntosSumados: 35, saldo: 35 },
    });
    expect(JSON.stringify(r)).not.toContain('alergia');
  });

  it('rechaza visita sin servicios o con servicio inactivo', async () => {
    const sin = await registrarVisitaAction(form([['cliente_id', CLIENTA]]));
    expect(sin).toEqual({ ok: false, error: 'Elegí al menos un servicio.' });

    const inactivo = await registrarVisitaAction(
      form([['cliente_id', CLIENTA], ['servicio_id', S_INACTIVO]])
    );
    expect(inactivo.ok).toBe(false);
    expect(estado.entradas).toHaveLength(0);
  });

  it('canje con saldo insuficiente devuelve cuánto falta y no persiste', async () => {
    await registrarVisitaAction(form([['cliente_id', CLIENTA], ['servicio_id', S1]]));
    const r = await canjearPremioAction(form([['cliente_id', CLIENTA], ['premio_id', PREMIO]]));
    expect(r).toEqual({
      ok: false,
      error: 'Le faltan 20 puntos (tiene 10, el premio cuesta 30).',
    });
    expect(estado.entradas).toHaveLength(1);
  });

  it('canje con saldo suficiente descuenta el costo', async () => {
    await registrarVisitaAction(
      form([['cliente_id', CLIENTA], ['servicio_id', S1], ['servicio_id', S2]])
    );
    const r = await canjearPremioAction(form([['cliente_id', CLIENTA], ['premio_id', PREMIO]]));
    expect(r).toEqual({ ok: true, data: { premio: 'Mascarilla', costo: 30, saldo: 5 } });
  });

  it('deshacer revierte la última visita y devuelve qué se deshizo', async () => {
    await registrarVisitaAction(form([['cliente_id', CLIENTA], ['servicio_id', S2]]));
    const r = await deshacerUltimaAccionAction();
    expect(r).toEqual({
      ok: true,
      data: expect.objectContaining({
        tipo: 'visita',
        clienteId: CLIENTA,
        clienteNombre: 'Rosa',
        puntos: 25,
        saldo: 0,
      }),
    });

    const nada = await deshacerUltimaAccionAction();
    expect(nada).toEqual({ ok: true, data: null });
  });

  it('ficha devuelve datos básicos y saldo; sin sesión responde error corto', async () => {
    const r = await obtenerFichaClientaAction(CLIENTA);
    expect(r).toEqual({
      ok: true,
      data: { id: CLIENTA, nombre: 'Rosa', telefono: '1155550000', dni: null, saldo: 0 },
    });

    estado.operadorId = null;
    expect(await obtenerFichaClientaAction(CLIENTA)).toEqual({
      ok: false,
      error: 'Tenés que iniciar sesión de nuevo.',
    });
  });

  it('id inválido no llega a la base', async () => {
    const r = await obtenerFichaClientaAction("1' OR 1=1");
    expect(r).toEqual({ ok: false, error: 'Falta o es inválido: clienta.' });
  });
});
