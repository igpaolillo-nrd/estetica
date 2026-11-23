/** Formatos compartidos de la UI de mostrador. */

export function puntos(n: number): string {
  return `${n} ${Math.abs(n) === 1 ? 'punto' : 'puntos'}`;
}

/** "hoy 14:05", "ayer 18:30" o "12/11 10:15", en hora de Argentina. */
export function cuando(iso: string | null): string {
  if (!iso) return '';
  const fecha = new Date(iso);
  const zona = 'America/Argentina/Buenos_Aires';
  const hora = fecha.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: zona,
  });
  const dia = (d: Date) => d.toLocaleDateString('es-AR', { timeZone: zona });
  const hoy = new Date();
  const ayer = new Date(hoy.getTime() - 24 * 60 * 60 * 1000);
  if (dia(fecha) === dia(hoy)) return `hoy ${hora}`;
  if (dia(fecha) === dia(ayer)) return `ayer ${hora}`;
  const corta = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: zona });
  return `${corta} ${hora}`;
}
