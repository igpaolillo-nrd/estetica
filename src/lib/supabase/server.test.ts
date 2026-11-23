import { describe, it, expect, beforeEach, vi } from 'vitest';

/** El helper lee y escribe las cookies del request actual. */

const h = vi.hoisted(() => ({
  store: {
    getAll: vi.fn(() => [{ name: 'sb-token', value: 'x' }]),
    set: vi.fn(),
  },
  opciones: null as any,
}));

vi.mock('next/headers', () => ({ cookies: () => h.store }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, opciones: any) => {
    h.opciones = opciones;
    return { auth: {} };
  },
}));

import { crearClienteServidor } from './server';

describe('crearClienteServidor', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    h.store.set.mockReset();
  });

  it('lee y escribe cookies del request', () => {
    crearClienteServidor();
    expect(h.opciones.cookies.getAll()).toEqual([{ name: 'sb-token', value: 'x' }]);
    h.opciones.cookies.setAll([{ name: 'sb-token', value: 'y', options: { path: '/' } }]);
    expect(h.store.set).toHaveBeenCalledWith('sb-token', 'y', { path: '/' });
  });

  it('en un Server Component (cookies de solo lectura) no rompe', () => {
    h.store.set.mockImplementation(() => {
      throw new Error('Cookies can only be modified in a Server Action');
    });
    crearClienteServidor();
    expect(() =>
      h.opciones.cookies.setAll([{ name: 'sb-token', value: 'y', options: {} }]),
    ).not.toThrow();
  });

  it('sin variables de entorno falla explícito', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(() => crearClienteServidor()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
