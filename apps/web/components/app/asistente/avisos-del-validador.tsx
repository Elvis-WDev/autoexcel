'use client';

import { ChevronDown, Info } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Lo que el validador ajusto de la propuesta.
 *
 * RX-06: la persona tiene derecho a saber que se corrigio. Pero plegado, porque
 * tambien tiene derecho a no leerlo: son avisos sobre decisiones que el sistema
 * ya tomo bien, no cosas que haya que arreglar.
 */
export function AvisosDelValidador({ notas }: { notas: string[] }): React.ReactElement | null {
  const [abierto, setAbierto] = useState(false);

  if (notas.length === 0) return null;

  return (
    <div className="bg-muted/50 rounded-lg border">
      <button
        aria-expanded={abierto}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm"
        onClick={() => setAbierto((previo) => !previo)}
        type="button"
      >
        <Info aria-hidden className="text-muted-foreground size-4 shrink-0" />
        {/* `min-w-0`: sin el, un aviso largo sin espacios empujaria el chevron fuera. */}
        <span className="min-w-0 flex-1">
          Ajustamos {notas.length} {notas.length === 1 ? 'cosa' : 'cosas'} de la propuesta
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            'text-muted-foreground size-4 transition-transform',
            abierto && 'rotate-180',
          )}
        />
      </button>

      {abierto ? (
        <ul className="text-muted-foreground space-y-1.5 border-t px-4 py-3 text-sm">
          {notas.map((nota) => (
            <li key={nota}>{nota}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
