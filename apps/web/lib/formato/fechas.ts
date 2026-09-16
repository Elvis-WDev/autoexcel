import { format, formatDistanceToNow, isThisYear } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Cuando paso algo, como lo diria una persona.
 *
 * "hace 2 horas" se lee de un vistazo; "16/09/2026 04:38" hay que compararlo
 * mentalmente con el reloj. Lo reciente va en relativo y lo viejo en absoluto,
 * que es el punto en que el relativo deja de ayudar ("hace 8 meses" no situa
 * nada).
 */
export function haceCuanto(iso: string): string {
  const momento = new Date(iso);
  if (Number.isNaN(momento.getTime())) return '—';

  const dias = (Date.now() - momento.getTime()) / 86_400_000;
  if (dias > 30)
    return format(momento, isThisYear(momento) ? "d 'de' MMMM" : 'd MMM yyyy', { locale: es });

  return formatDistanceToNow(momento, { addSuffix: true, locale: es });
}

/** La fecha completa, para la descripcion emergente. */
export function fechaCompleta(iso: string): string {
  const momento = new Date(iso);
  if (Number.isNaN(momento.getTime())) return '';
  return format(momento, "d 'de' MMMM 'de' yyyy, HH:mm", { locale: es });
}
