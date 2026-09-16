'use client';

import { FileSpreadsheet, Upload, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { tamanoLegible } from '@/lib/formato/tamano';
import { cn } from '@/lib/utils';

/**
 * Elegir un archivo, con su ciclo completo.
 *
 * Parte de un bloque de 21st.dev (`ephraimduncan/file-upload-04`) del que se
 * conserva la disposicion, la mecanica de arrastrar y soltar y el formateo del
 * tamano. Lo demas se reescribio, y merece la pena decir que, porque es el
 * peaje de `component-system.md` cobrado de verdad:
 *
 *   - su barra de progreso era **falsa**, un `setInterval` que sumaba 5 cada
 *     200 ms; aqui el progreso llega por prop desde la subida real;
 *   - traia una tarjeta de demostracion incrustada con un archivo inventado;
 *   - anunciaba un limite fijo de 10 MB; aqui lo dice quien lo usa;
 *   - aceptaba CSV y XLS, que **nuestra API rechaza**: ofrecerlos es provocar
 *     un 415 seguro;
 *   - importaba sus propias copias de `button`, `card` y `progress`;
 *   - informaba del error con un toast, y este error va en linea porque se
 *     corrige aqui mismo.
 *
 * El limite y los formatos se anuncian **antes** de elegir, no despues de un
 * rechazo. La validacion del cliente es cortesia: la autoridad es el backend,
 * que comprueba la firma del archivo y no su extension.
 */
export interface FileFieldProps {
  label: string;
  /** Extensiones visibles, p. ej. `['.xlsx']`. */
  extensiones: string[];
  maxBytes: number;
  value: File | null;
  onChange: (archivo: File | null) => void;
  /** 0-100 mientras sube. `null` si no hay subida en curso. */
  progreso?: number | null;
  error?: string;
  disabled?: boolean;
  /** Aviso persistente, p. ej. que reemplazar rehace el analisis. */
  advertencia?: React.ReactNode;
}

export function FileField({
  label,
  extensiones,
  maxBytes,
  value,
  onChange,
  progreso = null,
  error,
  disabled = false,
  advertencia,
}: FileFieldProps): React.ReactElement {
  const id = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);
  const [rechazo, setRechazo] = useState<string | null>(null);

  const subiendo = progreso !== null;
  const accept = extensiones.join(',');
  const formatos = extensiones.map((e) => e.replace('.', '').toUpperCase()).join(', ');

  function aceptar(archivo: File | undefined): void {
    if (!archivo) return;
    setRechazo(null);

    const extension = `.${archivo.name.split('.').pop()?.toLowerCase() ?? ''}`;
    if (!extensiones.includes(extension)) {
      setRechazo(`Solo aceptamos archivos ${formatos}. El tuyo es ${extension || 'desconocido'}.`);
      return;
    }

    if (archivo.size > maxBytes) {
      setRechazo(
        `Tu archivo pesa ${tamanoLegible(archivo.size)} y el limite son ${tamanoLegible(maxBytes)}.`,
      );
      return;
    }

    onChange(archivo);
  }

  function quitar(): void {
    setRechazo(null);
    onChange(null);
    if (entrada.current) entrada.current.value = '';
  }

  const problema = error ?? rechazo;

  return (
    <div className="space-y-3">
      {!value ? (
        <div
          className={cn(
            'rounded-lg border border-dashed px-6 py-10 text-center transition-colors',
            encima && 'border-primary bg-accent/40',
            problema && 'border-destructive/50',
            disabled && 'opacity-60',
          )}
          onDragLeave={() => setEncima(false)}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setEncima(true);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setEncima(false);
            if (!disabled) aceptar(e.dataTransfer.files[0]);
          }}
        >
          <Upload aria-hidden className="text-muted-foreground/60 mx-auto size-8" />
          <p className="mt-3 text-sm">
            Arrastra tu archivo o{' '}
            <label
              className="text-primary cursor-pointer font-medium hover:underline hover:underline-offset-4"
              htmlFor={id}
            >
              eligelo
              <input
                accept={accept}
                className="sr-only"
                disabled={disabled}
                id={id}
                onChange={(e) => aceptar(e.target.files?.[0])}
                ref={entrada}
                type="file"
              />
            </label>
          </p>
          {/* Antes de elegir, no despues de un rechazo. */}
          <p className="text-muted-foreground mt-1 text-xs">
            Formato {formatos} · hasta {tamanoLegible(maxBytes)}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border p-4">
          <div className="flex items-start gap-3">
            <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-md">
              <FileSpreadsheet aria-hidden className="size-5" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={value.name}>
                {value.name}
              </p>
              <p className="text-muted-foreground text-xs">{tamanoLegible(value.size)}</p>

              {subiendo ? (
                <div className="mt-2.5 flex items-center gap-3">
                  <Progress
                    aria-label={`Subiendo ${value.name}`}
                    className="h-1.5"
                    value={progreso}
                  />
                  <span className="text-muted-foreground w-9 shrink-0 text-right text-xs tabular-nums">
                    {progreso}%
                  </span>
                </div>
              ) : null}
            </div>

            {!subiendo ? (
              <Button
                aria-label={`Quitar ${value.name}`}
                className="size-8 shrink-0"
                disabled={disabled}
                onClick={quitar}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X aria-hidden className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>
      )}

      {advertencia ? <p className="text-muted-foreground text-xs">{advertencia}</p> : null}

      {problema ? (
        <p className="text-destructive text-sm" role="alert">
          {problema}
        </p>
      ) : null}

      <span className="sr-only">{label}</span>
    </div>
  );
}
