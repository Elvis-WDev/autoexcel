'use client';

import { useId } from 'react';
import { DatePickerField } from './date-picker-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Fecha y hora.
 *
 * A diferencia de una fecha de calendario, esto **si** es un instante, asi que
 * viaja en ISO 8601 con zona y el `Date` es la representacion correcta.
 *
 * Se parte en dos controles —dia y hora— en vez de un selector combinado
 * porque son dos decisiones distintas y el teclado las resuelve mejor por
 * separado. La hora se escribe; el dia se elige.
 */
export interface DateTimePickerFieldProps {
  label: string;
  value: string | null;
  onChange: (valor: string | null) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string;
}

/** ISO -> partes locales, para pintarlas en los dos controles. */
function partes(iso: string | null): { fecha: string | null; hora: string } {
  if (!iso) return { fecha: null, hora: '' };

  const momento = new Date(iso);
  if (Number.isNaN(momento.getTime())) return { fecha: null, hora: '' };

  const p = (n: number) => String(n).padStart(2, '0');
  return {
    fecha: `${momento.getFullYear()}-${p(momento.getMonth() + 1)}-${p(momento.getDate())}`,
    hora: `${p(momento.getHours())}:${p(momento.getMinutes())}`,
  };
}

export function DateTimePickerField({
  label,
  value,
  onChange,
  required = false,
  disabled = false,
  error,
}: DateTimePickerFieldProps): React.ReactElement {
  const id = useId();
  const { fecha, hora } = partes(value);

  /** Recompone el instante. Sin dia no hay instante que componer. */
  function componer(nuevaFecha: string | null, nuevaHora: string): void {
    if (!nuevaFecha) return onChange(null);

    const [anio, mes, dia] = nuevaFecha.split('-').map(Number);
    const [h, m] = (nuevaHora || '00:00').split(':').map(Number);

    // Construido en local y convertido a ISO: aqui la zona si importa y se
    // conserva a proposito.
    const momento = new Date(anio ?? 0, (mes ?? 1) - 1, dia ?? 1, h ?? 0, m ?? 0);
    onChange(momento.toISOString());
  }

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <DatePickerField
          error={error}
          disabled={disabled}
          label={label}
          onChange={(nueva) => componer(nueva, hora)}
          required={required}
          value={fecha}
        />

        <div className="space-y-2">
          <Label htmlFor={id}>Hora</Label>
          <Input
            className="w-full sm:w-32"
            disabled={disabled || !fecha}
            id={id}
            onChange={(e) => componer(fecha, e.target.value)}
            step={60}
            type="time"
            value={hora}
          />
        </div>
      </div>
      {!fecha ? <p className="text-muted-foreground text-xs">Elige primero el dia.</p> : null}
    </div>
  );
}
