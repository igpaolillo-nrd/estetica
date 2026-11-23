'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { iniciarSesionAction, type EstadoLogin } from './actions';

const inicial: EstadoLogin = { error: null };

const campo: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '14px 12px',
  fontSize: 18,
  border: '1px solid #999',
  borderRadius: 8,
  marginTop: 6,
  boxSizing: 'border-box',
};

function BotonEntrar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        width: '100%',
        padding: 16,
        fontSize: 20,
        borderRadius: 8,
        border: 'none',
        background: '#222',
        color: '#fff',
        marginTop: 8,
      }}
    >
      {pending ? 'Entrando…' : 'Entrar'}
    </button>
  );
}

export function FormularioLogin() {
  const [estado, accion] = useFormState(iniciarSesionAction, inicial);

  return (
    <form action={accion} style={{ display: 'grid', gap: 16 }}>
      <label style={{ fontSize: 18 }}>
        Email
        <input name="email" type="email" autoComplete="username" required style={campo} />
      </label>
      <label style={{ fontSize: 18 }}>
        Contraseña
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          style={campo}
        />
      </label>
      {estado.error && (
        <p role="alert" style={{ color: '#b00020', fontSize: 18, margin: 0 }}>
          {estado.error}
        </p>
      )}
      <BotonEntrar />
    </form>
  );
}
