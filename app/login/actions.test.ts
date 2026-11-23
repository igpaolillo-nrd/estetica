import { describe, it, expect, beforeEach, vi } from 'vitest';

/** Login: redirige al mostrador si entra; nunca loguea ni devuelve credenciales. */

const h = vi.hoisted(() => ({ signIn: vi.fn(), redirect: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: () => ({ auth: { signInWithPassword: h.signIn } }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    h.redirect(url);
    throw new Error('NEXT_REDIRECT');
  },
}));

import { iniciarSesionAction } from './actions';

const EMAIL = 'duena@ejemplo.com';
const PASS = 'secreta-123';

function form(email: string, password: string) {
  const f = new FormData();
  f.set('email', email);
  f.set('password', password);
  return f;
}

describe('iniciarSesionAction', () => {
  beforeEach(() => {
    h.signIn.mockReset();
    h.redirect.mockReset();
  });

  it('con credenciales válidas redirige al mostrador', async () => {
    h.signIn.mockResolvedValue({ error: null });
    await expect(iniciarSesionAction({ error: null }, form(EMAIL, PASS))).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(h.signIn).toHaveBeenCalledWith({ email: EMAIL, password: PASS });
    expect(h.redirect).toHaveBeenCalledWith('/');
  });

  it('con campos vacíos no llama a Auth', async () => {
    const r = await iniciarSesionAction({ error: null }, form('  ', ''));
    expect(r.error).toBe('Completá email y contraseña.');
    expect(h.signIn).not.toHaveBeenCalled();
  });

  it('credenciales incorrectas: mensaje genérico, sin eco del input', async () => {
    h.signIn.mockResolvedValue({ error: { code: 'invalid_credentials', status: 400 } });
    const r = await iniciarSesionAction({ error: null }, form(EMAIL, PASS));
    expect(r.error).toBe('Email o contraseña incorrectos.');
    expect(r.error).not.toContain(EMAIL);
    expect(h.redirect).not.toHaveBeenCalled();
  });

  it('error técnico: no loguea email ni contraseña', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.signIn.mockResolvedValue({ error: { code: 'unexpected_failure', status: 500 } });
    const r = await iniciarSesionAction({ error: null }, form(EMAIL, PASS));
    expect(r.error).toBe('No se pudo iniciar sesión. Probá de nuevo.');
    const logueado = JSON.stringify(log.mock.calls);
    expect(logueado).not.toContain(EMAIL);
    expect(logueado).not.toContain(PASS);
    log.mockRestore();
  });
});
