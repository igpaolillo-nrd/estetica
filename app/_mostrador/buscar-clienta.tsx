'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import {
  buscarClientasAction,
  crearClienteAction,
  type ClientaResumen,
} from '../actions/catalogo-actions';

const ESPERA_MS = 300;

type Busqueda =
  | { estado: 'inicial' }
  | { estado: 'buscando' }
  | { estado: 'listo'; clientas: ClientaResumen[] }
  | { estado: 'error'; mensaje: string };

/** Lo tipeado en la búsqueda precarga el campo que corresponde del alta. */
function precarga(texto: string): { nombre: string; telefono: string; dni: string } {
  const t = texto.trim();
  const digitos = t.replace(/[\s.\-+]/g, '');
  if (/^\d+$/.test(digitos)) {
    return digitos.length >= 9
      ? { nombre: '', telefono: t, dni: '' }
      : { nombre: '', telefono: '', dni: digitos };
  }
  return { nombre: t, telefono: '', dni: '' };
}

/** Buscador por nombre, teléfono o DNI, con alta rápida si no aparece. */
export function BuscarClienta() {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState<Busqueda>({ estado: 'inicial' });
  const [alta, setAlta] = useState<ReturnType<typeof precarga> | null>(null);
  const ultima = useRef(0);

  useEffect(() => {
    const consulta = texto.trim();
    if (consulta.length < 2) {
      setBusqueda({ estado: 'inicial' });
      return;
    }
    setBusqueda({ estado: 'buscando' });
    const id = ++ultima.current;
    const timer = setTimeout(async () => {
      const r = await buscarClientasAction(consulta);
      if (id !== ultima.current) return; // llegó tarde: ya hay otra búsqueda
      setBusqueda(r.ok ? { estado: 'listo', clientas: r.data } : { estado: 'error', mensaje: r.error });
    }, ESPERA_MS);
    return () => clearTimeout(timer);
  }, [texto]);

  if (alta) {
    return (
      <AltaRapida
        inicial={alta}
        onCancelar={() => setAlta(null)}
        onCreada={(c) => router.push(`/clientas/${c.id}`)}
      />
    );
  }

  return (
    <div className="pila">
      <label className="campo">
        Buscar clienta
        <input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Nombre, teléfono o DNI"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          autoFocus
        />
      </label>

      {busqueda.estado === 'buscando' && <p className="suave">Buscando…</p>}

      {busqueda.estado === 'error' && (
        <p className="mensaje error" role="alert">
          {busqueda.mensaje}
        </p>
      )}

      {busqueda.estado === 'listo' &&
        (busqueda.clientas.length === 0 ? (
          <p className="mensaje aviso">No encontramos a nadie con «{texto.trim()}».</p>
        ) : (
          <ul className="pila" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {busqueda.clientas.map((c) => (
              <li key={c.id}>
                <Link href={`/clientas/${c.id}`} className="opcion">
                  <span>
                    <span className="nombre">{c.nombre}</span>
                    <br />
                    <span className="detalle">
                      Tel. {c.telefono}
                      {c.dni ? ` · DNI ${c.dni}` : ''}
                    </span>
                  </span>
                  <span aria-hidden="true">›</span>
                </Link>
              </li>
            ))}
          </ul>
        ))}

      <button
        type="button"
        className={busqueda.estado === 'listo' && busqueda.clientas.length === 0 ? 'boton' : 'boton secundario'}
        onClick={() => setAlta(precarga(texto))}
      >
        + Nueva clienta
      </button>
    </div>
  );
}

function AltaRapida({
  inicial,
  onCancelar,
  onCreada,
}: {
  inicial: ReturnType<typeof precarga>;
  onCancelar: () => void;
  onCreada: (c: ClientaResumen) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();

  const guardar = (formData: FormData) =>
    iniciar(async () => {
      setError(null);
      const r = await crearClienteAction(formData);
      if (r.ok) onCreada(r.data);
      else setError(r.error);
    });

  return (
    <form action={guardar} className="pila">
      <h1>Nueva clienta</h1>
      <label className="campo">
        Nombre y apellido
        <input
          name="nombre"
          defaultValue={inicial.nombre}
          autoComplete="off"
          autoCapitalize="words"
          required
          minLength={2}
          maxLength={120}
          autoFocus={!inicial.nombre}
        />
      </label>
      <label className="campo">
        Teléfono
        <input
          name="telefono"
          type="tel"
          inputMode="tel"
          defaultValue={inicial.telefono}
          autoComplete="off"
          required
          maxLength={20}
          autoFocus={Boolean(inicial.nombre) && !inicial.telefono}
        />
      </label>
      <label className="campo">
        <span>
          DNI <span className="ayuda">(opcional)</span>
        </span>
        <input name="dni" inputMode="numeric" defaultValue={inicial.dni} autoComplete="off" maxLength={12} />
      </label>

      {error && (
        <p className="mensaje error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="boton" disabled={guardando}>
        {guardando ? 'Guardando…' : 'Guardar y abrir ficha'}
      </button>
      <button type="button" className="boton secundario" onClick={onCancelar} disabled={guardando}>
        Volver a buscar
      </button>
    </form>
  );
}
