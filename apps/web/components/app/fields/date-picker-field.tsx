'use client';

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, X } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { aFechaTexto, deFechaTexto } from '@/lib/fechas/calendario';
import { cn } from '@/lib/utils';

/**
 * Fecha de calendario.
 *
 * Entra y sale como texto `YYYY-MM-DD`, que es lo que el backend guarda y
 * devuelve. La conversion pasa por `lib/fechas/calendario`, que trabaja con las
 * partes locales del `Date` y no con su instante: ver el comentario de ese
 * archivo, porque el fallo que evita ya ocurrio una vez en este proyecto.
 */
export interface DatePickerFieldProps {
  label: string;
  value: string | null;
  onChange: (valor: string | null) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  descripcion?: string;
}

export function DatePickerField({
  label,
  value,
  onChange,
  required = false,
  disabled = false,
  error,
  descripcion,
}: DatePickerFieldProps): React.ReactElement {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const seleccionada = deFechaTexto(value);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden className="text-muted-foreground">
            {' *'}
          </span>
        ) : null}
      </Label>

      <div className="flex gap-1">
        <Popover onOpenChange={setAbierto} open={abierto}>
          <PopoverTrigger asChild>
            <Button
              aria-describedby={error ? `${id}-error` : undefined}
              aria-invalid={error ? true : undefined}
              className={cn(
                'flex-1 justify-start font-normal',
                !seleccionada && 'text-muted-foreground',
              )}
              disabled={disabled}
              id={id}
              type="button"
              variant="outline"
            >
              <CalendarIcon aria-hidden className="size-4" />
              {seleccionada ? format(seleccionada, 'd MMM yyyy', { locale: es }) : 'Elegir fecha'}
            </Button>
          </PopoverTrigger>

          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              autoFocus
              locale={es}
              mode="single"
              onSelect={(fecha) => {
                onChange(fecha ? aFechaTexto(fecha) : null);
                setAbierto(false);
              }}
              selected={seleccionada}
            />
          </PopoverContent>
        </Popover>

        {seleccionada && !required ? (
          <Button
            aria-label={`Quitar la fecha de ${label}`}
            className="size-9 shrink-0"
            disabled={disabled}
            onClick={() => onChange(null)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X aria-hidden className="size-4" />
          </Button>
        ) : null}
      </div>

      {descripcion && !error ? (
        <p className="text-muted-foreground text-xs">{descripcion}</p>
      ) : null}
      {error ? (
        <p className="text-destructive text-sm" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
