import { FileQuestion, FilterX, Inbox, Lock, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * El vacio, que no es uno solo.
 *
 * `feedback-and-states.md` obliga a distinguir cuatro situaciones, porque cada
 * una tiene una salida distinta y confundirlas deja a la persona atascada:
 *
 *   - `sin-datos`      todavia no existe nada  -> ofrecer crearlo
 *   - `sin-resultados` los filtros no casan    -> ofrecer limpiarlos
 *   - `sin-permiso`    existe, pero no es suya -> no ofrecer nada
 *   - `falta-requisito` hay que hacer algo antes -> llevar a ese algo
 *
 * "No hay resultados" en los cuatro casos seria mentir en tres.
 */
export type MotivoVacio = 'sin-datos' | 'sin-resultados' | 'sin-permiso' | 'falta-requisito';

const ICONOS: Record<MotivoVacio, LucideIcon> = {
  'sin-datos': Inbox,
  'sin-resultados': FilterX,
  'sin-permiso': Lock,
  'falta-requisito': FileQuestion,
};

export interface EmptyStateProps {
  motivo: MotivoVacio;
  titulo: string;
  descripcion?: string;
  /** La accion que resuelve *este* vacio. Ninguna para `sin-permiso`. */
  accion?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  motivo,
  titulo,
  descripcion,
  accion,
  className,
}: EmptyStateProps): React.ReactElement {
  const Icono = ICONOS[motivo];

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
      data-motivo={motivo}
    >
      <Icono aria-hidden className="text-muted-foreground/60 size-8" />
      <div className="space-y-1">
        <p className="text-sm font-medium">{titulo}</p>
        {descripcion ? (
          <p className="text-muted-foreground mx-auto max-w-sm text-sm">{descripcion}</p>
        ) : null}
      </div>
      {accion ? <div className="mt-1">{accion}</div> : null}
    </div>
  );
}
