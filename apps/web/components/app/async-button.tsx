'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ButtonProps = React.ComponentProps<typeof Button>;

export interface AsyncButtonProps extends ButtonProps {
  pending?: boolean;
  /** Texto que sustituye al contenido mientras se espera. */
  pendingLabel?: string;
}

/**
 * Boton con estado de espera estable.
 *
 * Dos cosas que no se dejan al que lo llama, porque si se dejan se olvidan: se
 * deshabilita mientras hay una peticion en vuelo —que es la prevencion del
 * doble envio— y **conserva su ancho**, porque un boton que encoge al aparecer
 * el indicador mueve todo lo que tiene al lado.
 */
export function AsyncButton({
  pending = false,
  pendingLabel,
  children,
  disabled,
  className,
  ...props
}: AsyncButtonProps): React.ReactElement {
  return (
    <Button
      aria-busy={pending}
      className={cn('relative', className)}
      disabled={disabled === true || pending}
      {...props}
    >
      {pending ? (
        <>
          <Loader2 aria-hidden className="size-4 animate-spin" />
          {pendingLabel ?? children}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
