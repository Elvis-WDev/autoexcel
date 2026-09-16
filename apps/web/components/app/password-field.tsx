'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface PasswordFieldProps extends Omit<React.ComponentProps<'input'>, 'type' | 'id'> {
  label: string;
  /** Mensaje de error, ya en lenguaje de negocio. */
  error?: string;
}

/**
 * Entrada enmascarada con conmutador de visibilidad.
 *
 * El boton lleva nombre accesible y `aria-pressed`, porque un icono de ojo sin
 * nombre es invisible para un lector de pantalla. El campo se describe por su
 * error cuando lo hay, para que la ayuda tecnica lo anuncie al llegar.
 */
export function PasswordField({
  label,
  error,
  className,
  ...props
}: PasswordFieldProps): React.ReactElement {
  const id = useId();
  const errorId = `${id}-error`;
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          className={cn('pr-10', className)}
          id={id}
          type={visible ? 'text' : 'password'}
          {...props}
        />
        <button
          aria-label={visible ? 'Ocultar la contrasena' : 'Mostrar la contrasena'}
          aria-pressed={visible}
          className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-md"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          type="button"
        >
          {visible ? (
            <EyeOff aria-hidden className="size-4" />
          ) : (
            <Eye aria-hidden className="size-4" />
          )}
        </button>
      </div>
      {error ? (
        <p className="text-destructive text-sm" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
