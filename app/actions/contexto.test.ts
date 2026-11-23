import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * contextoOperadora(): resuelve la sesión por request o tira SesionRequerida.
 * El cliente Supabase se reemplaza por un doble; lo que importa es que se cree
 * uno por llamada y que solo un usuario validado habilite el contexto.
 */

const crear = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/server', () => ({ crearClienteServidor: crear }));

import { contextoOperadora } from './contexto';
import { SesionRequerida } from './resultado';

function clienteCon(respuesta: { data: { user: { id: string } | null }; error: unknown }) {
  return { auth: { getUser: vi.fn().mockResolvedValue(respuesta) } };
}

const OPERADORA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('contextoOperadora', () => {
  beforeEach(() => crear.mockReset());

  it('con usuario autenticado devuelve el cliente del request y su id', async () => {
    const cliente = clienteCon({ data: { user: { id: OPERADORA } }, error: null });
    crear.mockReturnValue(cliente);

    const ctx = await contextoOperadora();

    expect(ctx.operadorId).toBe(OPERADORA);
    expect(ctx.db).toBe(cliente);
    expect(cliente.auth.getUser).toHaveBeenCalledOnce();
  });

  it('sin usuario tira SesionRequerida', async () => {
    crear.mockReturnValue(clienteCon({ data: { user: null }, error: null }));
    await expect(contextoOperadora()).rejects.toBeInstanceOf(SesionRequerida);
  });

  it('si Auth rechaza el token tira SesionRequerida', async () => {
    crear.mockReturnValue(
      clienteCon({ data: { user: null }, error: new Error('invalid JWT') }),
    );
    await expect(contextoOperadora()).rejects.toBeInstanceOf(SesionRequerida);
  });

  it('crea un cliente nuevo en cada llamada (sin sesión compartida entre requests)', async () => {
    crear.mockImplementation(() =>
      clienteCon({ data: { user: { id: OPERADORA } }, error: null }),
    );
    const a = await contextoOperadora();
    const b = await contextoOperadora();
    expect(crear).toHaveBeenCalledTimes(2);
    expect(a.db).not.toBe(b.db);
  });
});
