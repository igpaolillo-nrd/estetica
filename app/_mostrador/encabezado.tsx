import Link from 'next/link';
import { cerrarSesionAction } from '../login/actions';
import { Deshacer } from './deshacer';

/** Barra fija del mostrador: volver al buscador, deshacer y salir. */
export function Encabezado() {
  return (
    <header className="encabezado">
      <Link href="/" className="titulo">
        Mostrador
      </Link>
      <Deshacer />
      <form action={cerrarSesionAction}>
        <button type="submit" className="boton secundario chico">
          Salir
        </button>
      </form>
    </header>
  );
}
