/**
 * Resultado uniforme de las Server Actions y traducción de errores a mensajes
 * cortos para la operadora.
 *
 * Ley 25.326: ningún mensaje ni log incluye datos de entrada (en particular
 * `nota`). Al log va solo el nombre/mensaje del error técnico, nunca el input.
 *
 * Sin 'use server': es un módulo interno, no un endpoint invocable.
 */

import {
  DomainError,
  SaldoInsuficiente,
  VisitaVacia,
  VisitaYaRevertida,
  MontoInvalido,
} from '@/domain/errors';

export type Resultado<T> = { ok: true; data: T } | { ok: false; error: string };

/** No hay operadora autenticada. */
export class SesionRequerida extends Error {
  constructor() {
    super('Sesión requerida');
    this.name = 'SesionRequerida';
  }
}

/**
 * Dato de entrada inválido. Su mensaje lo escribimos nosotros y se muestra tal
 * cual: nunca debe interpolar lo que tipeó la operadora.
 */
export class EntradaInvalida extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'EntradaInvalida';
  }
}

export function ok<T>(data: T): Resultado<T> {
  return { ok: true, data };
}

export function fallo(e: unknown, contexto: string): { ok: false; error: string } {
  if (e instanceof EntradaInvalida) return { ok: false, error: e.message };
  if (e instanceof SesionRequerida) {
    return { ok: false, error: 'Tenés que iniciar sesión de nuevo.' };
  }
  if (e instanceof SaldoInsuficiente) {
    return {
      ok: false,
      error: `Le faltan ${e.costo - e.saldo} puntos (tiene ${e.saldo}, el premio cuesta ${e.costo}).`,
    };
  }
  if (e instanceof VisitaVacia) {
    return { ok: false, error: 'Elegí al menos un servicio.' };
  }
  if (e instanceof VisitaYaRevertida) {
    return { ok: false, error: 'Esa visita ya estaba deshecha.' };
  }
  if (e instanceof MontoInvalido || e instanceof DomainError) {
    return { ok: false, error: 'No se pudo completar la operación.' };
  }

  // Error técnico (red, Postgres, RLS). Los mensajes del adaptador traen
  // `error.message` de PostgREST, que no incluye valores de fila.
  console.error(`[${contexto}]`, e instanceof Error ? e.message : 'error desconocido');
  return { ok: false, error: 'No se pudo completar. Probá de nuevo.' };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuid(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !UUID_RE.test(valor)) {
    throw new EntradaInvalida(`Falta o es inválido: ${campo}.`);
  }
  return valor;
}

export function textoOpcional(valor: FormDataEntryValue | null, max: number): string | undefined {
  if (typeof valor !== 'string') return undefined;
  const limpio = valor.trim();
  if (!limpio) return undefined;
  if (limpio.length > max) {
    throw new EntradaInvalida(`El texto supera ${max} caracteres.`);
  }
  return limpio;
}
