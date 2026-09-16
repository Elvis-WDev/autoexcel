'use client';

import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mensajeDeError, referenciaDeSoporte } from '@/lib/api/mensajes';
import { cn } from '@/lib/utils';

/**
 * Un fallo recuperable, dentro de la superficie que fallo.
 *
 * No sustituye la pagina entera: si falla una tabla, el resto de la pantalla
 * sigue siendo util. Y no ensena nunca la excepcion: el texto sale de
 * `mensajeDeError`, que ya decide que es seguro mostrar.
 */
export interface ErrorStateProps {
  error: unknown;
  /** Reintentar solo cuando repetir sea seguro. */
  onReintentar?: () => void;
  className?: string;
}

export function ErrorState({
  error,
  onReintentar,
  className,
}: ErrorStateProps): React.ReactElement {
  const referencia = referenciaDeSoporte(error);

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
      role="alert"
    >
      <AlertTriangle aria-hidden className="text-muted-foreground/60 size-8" />
      <div className="space-y-1">
        <p className="text-sm font-medium">{mensajeDeError(error)}</p>
        {referencia ? (
          <p className="text-muted-foreground text-xs">Referencia: {referencia}</p>
        ) : null}
      </div>
      {onReintentar ? (
        <Button onClick={onReintentar} size="sm" variant="outline">
          <RotateCw aria-hidden className="size-4" />
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}
