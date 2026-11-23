import { FormularioLogin } from './formulario-login';

export const metadata = { title: 'Entrar' };

export default function LoginPage() {
  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: '48px 16px' }}>
      <h1 style={{ fontSize: 28, marginBottom: 24 }}>Entrar</h1>
      <FormularioLogin />
    </main>
  );
}
