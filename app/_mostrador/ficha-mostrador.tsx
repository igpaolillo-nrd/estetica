'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { FichaClienta } from '../actions/puntos-actions';
import type { Resultado } from '../actions/resultado';
import { RegistrarVisita, type Servicio } from './registrar-visita';
import { CanjearPremio, type Premio } from './canjear-premio';
import { puntos } from './formato';

type Modo = 'inicio' | 'visita' | 'canje';

export function FichaMostrador({
  ficha,
  servicios,
  premios,
}: {
  ficha: FichaClienta;
  servicios: Resultado<Servicio[]>;
  premios: Resultado<Premio[]>;
}) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>('inicio');
  const [aviso, setAviso] = useState<string | null>(null);
  const [saldo, setSaldo] = useState(ficha.saldo);
  const saldoMostrado = useRef(ficha.saldo);

  // El saldo del servidor cambió por algo que no hizo esta pantalla (p. ej.
  // "Deshacer"): se toma el nuevo y se borra el aviso, que ya no vale.
  useEffect(() => {
    if (ficha.saldo !== saldoMostrado.current) {
      saldoMostrado.current = ficha.saldo;
      setSaldo(ficha.saldo);
      setAviso(null);
    }
  }, [ficha.saldo]);

  const terminar = (nuevoSaldo: number, mensaje: string) => {
    saldoMostrado.current = nuevoSaldo;
    setSaldo(nuevoSaldo);
    setAviso(mensaje);
    setModo('inicio');
    router.refresh();
  };

  return (
    <div className="pila">
      <section className="tarjeta">
        <h1>{ficha.nombre}</h1>
        <p className="suave" style={{ margin: '4px 0 0' }}>
          Tel. {ficha.telefono}
          {ficha.dni ? ` · DNI ${ficha.dni}` : ''}
        </p>
        <div className="saldo">
          <span className="numero">{saldo}</span>
          <span className="etiqueta">{Math.abs(saldo) === 1 ? 'punto' : 'puntos'} disponibles</span>
        </div>
      </section>

      {modo === 'inicio' && (
        <>
          {aviso && (
            <p className="mensaje ok" role="status">
              {aviso}
            </p>
          )}
          <button type="button" className="boton" onClick={() => setModo('visita')}>
            Registrar visita
          </button>
          <button type="button" className="boton secundario" onClick={() => setModo('canje')}>
            Canjear premio
          </button>
          <Link href="/" className="boton secundario">
            Buscar otra clienta
          </Link>
        </>
      )}

      {modo === 'visita' && (
        <RegistrarVisita
          clienteId={ficha.id}
          saldo={saldo}
          servicios={servicios}
          onCancelar={() => setModo('inicio')}
          onHecho={(r) => terminar(r.saldo, `Visita registrada: +${puntos(r.puntosSumados)}.`)}
        />
      )}

      {modo === 'canje' && (
        <CanjearPremio
          clienteId={ficha.id}
          saldo={saldo}
          premios={premios}
          onCancelar={() => setModo('inicio')}
          onHecho={(r) => terminar(r.saldo, `Canjeó «${r.premio}» por ${puntos(r.costo)}.`)}
        />
      )}
    </div>
  );
}
