import { Check } from 'lucide-react';
import { HITOS, hitoActual } from '@/lib/proyectos/pasos';
import { cn } from '@/lib/utils';

/**
 * Donde estas y cuanto queda.
 *
 * Seis hitos y no los doce estados: "revisando campos" y "revisando relaciones"
 * son el mismo hito para quien mira esto. Un indicador con doce casillas no
 * informa, abruma.
 *
 * No es navegacion: los hitos no se pulsan. Volver atras es una transicion de
 * estado que valida el backend, y se hace con el boton "Atras", no saltando por
 * una barra de progreso.
 */
export function IndicadorDePasos({ status }: { status: string }): React.ReactElement {
  const actual = hitoActual(status);

  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
      {HITOS.map((hito, indice) => {
        const hecho = indice < actual;
        const aqui = indice === actual;

        return (
          <li className="flex items-center gap-1" key={hito.clave}>
            <span
              aria-current={aqui ? 'step' : undefined}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2 py-1',
                aqui && 'bg-accent text-accent-foreground font-medium',
                hecho && 'text-muted-foreground',
                !aqui && !hecho && 'text-muted-foreground/60',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center rounded-full text-[10px]',
                  (hecho || aqui) && 'bg-primary text-primary-foreground',
                  !aqui && !hecho && 'border',
                )}
              >
                {hecho ? <Check className="size-3" /> : indice + 1}
              </span>
              {hito.etiqueta}
              {/* El estado del paso, para quien no distingue el color. */}
              {hecho ? <span className="sr-only">(completado)</span> : null}
            </span>

            {indice < HITOS.length - 1 ? (
              <span aria-hidden className="text-muted-foreground/40">
                /
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
