import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * La unica forma de pintar un estado en toda la aplicacion.
 *
 * Dos reglas de `data-tables.md` viven aqui y no en quien lo usa:
 *
 *   - **El color nunca va solo.** Siempre hay un icono o un punto ademas del
 *     color, porque una de cada doce personas no distingue rojo de verde.
 *   - **La altura es fija.** Un badge que crece o encoge cambia la altura de la
 *     fila, y una tabla que salta al recargar es una tabla que no se puede leer.
 *
 * El modulo traduce sus valores de dominio a un `tono`; el tono decide el color.
 * Asi un mismo estado no cambia de color entre pantallas.
 */
export type TonoDeEstado = 'neutro' | 'progreso' | 'exito' | 'aviso' | 'error';

const TONOS: Record<TonoDeEstado, string> = {
  neutro: 'bg-muted text-muted-foreground border-transparent',
  progreso: 'bg-info/10 text-info border-info/20',
  exito: 'bg-success/10 text-success border-success/20',
  aviso: 'bg-warning/10 text-warning-foreground border-warning/30',
  error: 'bg-destructive/10 text-destructive border-destructive/20',
};

export interface StatusBadgeProps {
  children: React.ReactNode;
  tono?: TonoDeEstado;
  /** Icono opcional. Sin el se pinta un punto, nunca solo color. */
  icono?: LucideIcon;
  /** Anima el punto: para estados que estan ocurriendo ahora mismo. */
  enCurso?: boolean;
  className?: string;
}

export function StatusBadge({
  children,
  tono = 'neutro',
  icono: Icono,
  enCurso = false,
  className,
}: StatusBadgeProps): React.ReactElement {
  return (
    <Badge
      className={cn('h-6 gap-1.5 rounded-md border px-2 font-normal', TONOS[tono], className)}
      variant="outline"
    >
      {Icono ? (
        <Icono aria-hidden className="size-3.5 shrink-0" />
      ) : (
        <span
          aria-hidden
          className={cn('size-1.5 shrink-0 rounded-full bg-current', enCurso && 'animate-pulse')}
        />
      )}
      <span className="truncate">{children}</span>
    </Badge>
  );
}
