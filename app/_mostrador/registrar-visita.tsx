'use client';

import { useState, useTransition } from 'react';
import { registrarVisitaAction } from '../actions/puntos-actions';
import type { Resultado } from '../actions/resultado';
import { puntos } from './formato';

export type Servicio = { id: string; nombre: string; puntos_default: number };
type Hecho = { visitaId: string; puntosSumados: number; saldo: number };

/**
 * Elegir uno o más servicios (toque para marcar/desmarcar), ver cuánto suma y
 * confirmar. Sin campo de nota: no se pide ni se muestra (Ley 25.326).
 */
export function RegistrarVisita({
  clienteId,
  saldo,
  servicios,
  onCancelar,
  onHecho,
}: {
  clienteId: string;
  saldo: number;
  servicios: Resultado<Servicio[]>;
  onCancelar: () => void;
  onHecho: (r: Hecho) => void;
}) {
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();

  if (!servicios.ok || servicios.data.length === 0) {
    return (
      <div className="pila">
        <p className="mensaje error" role="alert">
          {servicios.ok ? 'No hay servicios activos cargados.' : servicios.error}
        </p>
        <button type="button" className="boton secundario" onClick={onCancelar}>
          Volver
        </button>
      </div>
    );
  }

  const lista = servicios.data;
  const suma = lista.filter((s) => elegidos.has(s.id)).reduce((t, s) => t + s.puntos_default, 0);

  const alternar = (id: string) => {
    setError(null);
    setElegidos((previo) => {
      const nuevo = new Set(previo);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  };

  const confirmar = () =>
    iniciar(async () => {
      setError(null);
      const datos = new FormData();
      datos.set('cliente_id', clienteId);
      elegidos.forEach((id) => datos.append('servicio_id', id));
      const r = await registrarVisitaAction(datos);
      if (r.ok) onHecho(r.data);
      else setError(r.error);
    });

  return (
    <div className="pila">
      <h2>¿Qué se hizo hoy?</h2>
      <p className="suave" style={{ margin: 0 }}>
        Tocá uno o más servicios.
      </p>

      {lista.map((s) => {
        const marcado = elegidos.has(s.id);
        return (
          <button
            key={s.id}
            type="button"
            className="opcion"
            aria-pressed={marcado}
            onClick={() => alternar(s.id)}
            disabled={guardando}
          >
            <span className="marca" aria-hidden="true">
              {marcado ? '✓' : ''}
            </span>
            <span className="nombre" style={{ flex: 1 }}>
              {s.nombre}
            </span>
            <span className="puntos">+{s.puntos_default}</span>
          </button>
        );
      })}

      <div className="tarjeta cuenta" aria-live="polite">
        <span>Suma</span>
        <span>+{puntos(suma)}</span>
        <span className="total">Queda con</span>
        <span className="total">{puntos(saldo + suma)}</span>
      </div>

      {error && (
        <p className="mensaje error" role="alert">
          {error}
        </p>
      )}

      <button type="button" className="boton" onClick={confirmar} disabled={guardando || elegidos.size === 0}>
        {guardando
          ? 'Guardando…'
          : elegidos.size === 0
            ? 'Elegí al menos un servicio'
            : `Confirmar visita (+${suma})`}
      </button>
      <button type="button" className="boton secundario" onClick={onCancelar} disabled={guardando}>
        Volver
      </button>
    </div>
  );
}
