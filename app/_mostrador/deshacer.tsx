'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  verUltimaAccionAction,
  deshacerUltimaAccionAction,
  type ResumenAccion,
} from '../actions/puntos-actions';
import { cuando, puntos } from './formato';

type Estado =
  | { paso: 'cerrado' }
  | { paso: 'confirmar'; accion: ResumenAccion }
  | { paso: 'nada' }
  | { paso: 'hecho'; accion: ResumenAccion & { saldo: number } }
  | { paso: 'error'; mensaje: string };

function quien(accion: ResumenAccion): string {
  return accion.clienteNombre ?? 'la clienta';
}

function descripcion(accion: ResumenAccion): string {
  const que = accion.tipo === 'visita' ? 'Visita' : 'Canje de premio';
  return `${que} de ${quien(accion)}${accion.fecha ? `, ${cuando(accion.fecha)}` : ''}.`;
}

function efecto(accion: ResumenAccion): string {
  return accion.tipo === 'visita'
    ? `Se le restan ${puntos(Math.abs(accion.puntos))}.`
    : `Se le devuelven ${puntos(Math.abs(accion.puntos))}.`;
}

/**
 * Deshacer en dos pasos: primero muestra qué se va a deshacer y pide
 * confirmación; recién ahí ejecuta. Deshace la última acción de la operadora,
 * que puede ser de otra clienta: por eso el nombre va siempre a la vista.
 */
export function Deshacer() {
  const router = useRouter();
  const ruta = usePathname();
  const [estado, setEstado] = useState<Estado>({ paso: 'cerrado' });
  const [ocupado, iniciar] = useTransition();

  const cerrar = () => setEstado({ paso: 'cerrado' });

  const consultar = () =>
    iniciar(async () => {
      const r = await verUltimaAccionAction();
      if (!r.ok) setEstado({ paso: 'error', mensaje: r.error });
      else if (!r.data) setEstado({ paso: 'nada' });
      else setEstado({ paso: 'confirmar', accion: r.data });
    });

  const confirmar = () =>
    iniciar(async () => {
      const r = await deshacerUltimaAccionAction();
      if (!r.ok) setEstado({ paso: 'error', mensaje: r.error });
      else if (!r.data) setEstado({ paso: 'nada' });
      else {
        setEstado({ paso: 'hecho', accion: r.data });
        router.refresh();
      }
    });

  return (
    <>
      <button type="button" className="boton secundario chico" onClick={consultar} disabled={ocupado}>
        Deshacer
      </button>

      {estado.paso !== 'cerrado' && (
        <div className="fondo-hoja" onClick={ocupado ? undefined : cerrar}>
          <div
            className="hoja"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-deshacer"
            onClick={(e) => e.stopPropagation()}
          >
            {estado.paso === 'confirmar' && (
              <>
                <h2 id="titulo-deshacer">¿Deshacer esto?</h2>
                <p>{descripcion(estado.accion)}</p>
                <p className="mensaje aviso">{efecto(estado.accion)}</p>
                <button type="button" className="boton peligro" onClick={confirmar} disabled={ocupado}>
                  {ocupado ? 'Deshaciendo…' : 'Sí, deshacer'}
                </button>
                <button type="button" className="boton secundario" onClick={cerrar} disabled={ocupado}>
                  No, dejar como está
                </button>
              </>
            )}

            {estado.paso === 'hecho' && (
              <>
                <h2 id="titulo-deshacer">Listo, se deshizo</h2>
                <p>{descripcion(estado.accion)}</p>
                <p className="mensaje ok">
                  Saldo nuevo de {quien(estado.accion)}: {puntos(estado.accion.saldo)}
                </p>
                {ruta !== `/clientas/${estado.accion.clienteId}` && (
                  <Link href={`/clientas/${estado.accion.clienteId}`} className="boton" onClick={cerrar}>
                    Ver ficha de {quien(estado.accion)}
                  </Link>
                )}
                <button type="button" className="boton secundario" onClick={cerrar}>
                  Cerrar
                </button>
              </>
            )}

            {estado.paso === 'nada' && (
              <>
                <h2 id="titulo-deshacer">No hay nada para deshacer</h2>
                <button type="button" className="boton secundario" onClick={cerrar}>
                  Cerrar
                </button>
              </>
            )}

            {estado.paso === 'error' && (
              <>
                <h2 id="titulo-deshacer">No se pudo deshacer</h2>
                <p className="mensaje error" role="alert">
                  {estado.mensaje}
                </p>
                <button type="button" className="boton secundario" onClick={cerrar}>
                  Cerrar
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
