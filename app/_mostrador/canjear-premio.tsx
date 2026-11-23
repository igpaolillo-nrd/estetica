'use client';

import { useState, useTransition } from 'react';
import { canjearPremioAction } from '../actions/puntos-actions';
import type { Resultado } from '../actions/resultado';
import { puntos } from './formato';

export type Premio = { id: string; nombre: string; costo_puntos: number };
type Hecho = { premio: string; costo: number; saldo: number };

/**
 * Elegir un premio activo y confirmar. Los que no alcanzan se ven igual, con
 * cuántos puntos faltan, pero no se pueden elegir. Si el saldo cambió entre
 * tanto, el servidor rechaza y se muestra su mensaje ("Le faltan N puntos…").
 */
export function CanjearPremio({
  clienteId,
  saldo,
  premios,
  onCancelar,
  onHecho,
}: {
  clienteId: string;
  saldo: number;
  premios: Resultado<Premio[]>;
  onCancelar: () => void;
  onHecho: (r: Hecho) => void;
}) {
  const [elegido, setElegido] = useState<Premio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();

  if (!premios.ok || premios.data.length === 0) {
    return (
      <div className="pila">
        <p className="mensaje error" role="alert">
          {premios.ok ? 'No hay premios activos cargados.' : premios.error}
        </p>
        <button type="button" className="boton secundario" onClick={onCancelar}>
          Volver
        </button>
      </div>
    );
  }

  const confirmar = (premio: Premio) =>
    iniciar(async () => {
      setError(null);
      const datos = new FormData();
      datos.set('cliente_id', clienteId);
      datos.set('premio_id', premio.id);
      const r = await canjearPremioAction(datos);
      if (r.ok) onHecho(r.data);
      else setError(r.error);
    });

  if (elegido) {
    return (
      <div className="pila">
        <h2>Canjear «{elegido.nombre}»</h2>
        <div className="tarjeta cuenta">
          <span>Tiene</span>
          <span>{puntos(saldo)}</span>
          <span>Cuesta</span>
          <span>−{puntos(elegido.costo_puntos)}</span>
          <span className="total">Le quedan</span>
          <span className="total">{puntos(saldo - elegido.costo_puntos)}</span>
        </div>
        {error && (
          <p className="mensaje error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="boton" onClick={() => confirmar(elegido)} disabled={guardando}>
          {guardando ? 'Canjeando…' : 'Sí, canjear'}
        </button>
        <button
          type="button"
          className="boton secundario"
          onClick={() => {
            setElegido(null);
            setError(null);
          }}
          disabled={guardando}
        >
          Elegir otro premio
        </button>
      </div>
    );
  }

  const lista = [...premios.data].sort((a, b) => a.costo_puntos - b.costo_puntos);
  const ninguno = lista.every((p) => p.costo_puntos > saldo);

  return (
    <div className="pila">
      <h2>Elegí el premio</h2>
      {ninguno && (
        <p className="mensaje aviso">Con {puntos(saldo)} todavía no le alcanza para ningún premio.</p>
      )}

      {lista.map((p) => {
        const falta = p.costo_puntos - saldo;
        return (
          <button
            key={p.id}
            type="button"
            className="opcion"
            onClick={() => setElegido(p)}
            disabled={falta > 0}
          >
            <span>
              <span className="nombre">{p.nombre}</span>
              {falta > 0 && (
                <>
                  <br />
                  <span className="detalle">Le faltan {puntos(falta)}</span>
                </>
              )}
            </span>
            <span className="puntos">{p.costo_puntos}</span>
          </button>
        );
      })}

      <button type="button" className="boton secundario" onClick={onCancelar}>
        Volver
      </button>
    </div>
  );
}
