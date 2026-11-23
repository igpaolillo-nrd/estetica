import Link from 'next/link';
import { obtenerFichaClientaAction } from '../../actions/puntos-actions';
import { listarServiciosAction, listarPremiosAction } from '../../actions/catalogo-actions';
import { Encabezado } from '../../_mostrador/encabezado';
import { FichaMostrador } from '../../_mostrador/ficha-mostrador';

/**
 * Ficha de mostrador: datos básicos y saldo (SUM en SQL), y desde acá visita o
 * canje. Sin notas ni historial (Ley 25.326 / alcance MVP).
 */
export default async function FichaPage({ params }: { params: { id: string } }) {
  const [ficha, servicios, premios] = await Promise.all([
    obtenerFichaClientaAction(params.id),
    listarServiciosAction(),
    listarPremiosAction(),
  ]);

  return (
    <main>
      <Encabezado />
      {ficha.ok ? (
        <FichaMostrador ficha={ficha.data} servicios={servicios} premios={premios} />
      ) : (
        <div className="pila">
          <p className="mensaje error" role="alert">
            {ficha.error}
          </p>
          <Link href="/" className="boton">
            Volver a buscar
          </Link>
        </div>
      )}
    </main>
  );
}
