'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * Elegir un registro relacionado.
 *
 * La regla de `forms-and-workflows.md` que esto implementa: **nunca se le pide
 * a nadie que escriba una clave ajena**. Se elige "Comercial Andes" y se envia
 * su identificador; el UUID no aparece en pantalla en ningun momento.
 *
 * La busqueda va contra el servidor porque la lista puede tener miles de
 * registros. El propio `Command` no filtra nada —`shouldFilter={false}`—: si
 * filtrara tambien en el cliente, escondería resultados que el servidor si
 * encontro.
 */
export interface OpcionDeRegistro {
  id: string;
  label: string;
}

export interface EntityPickerComboboxProps {
  label: string;
  /** Identificador elegido, o `null`. */
  value: string | null;
  onChange: (id: string | null) => void;
  /** Etiqueta del elegido, para poder pintarlo sin volver a buscarlo. */
  etiquetaActual?: string | null;
  /** Busca en el servidor. La cadena vacia debe devolver las primeras opciones. */
  buscar: (texto: string, signal?: AbortSignal) => Promise<OpcionDeRegistro[]>;
  /** Para separar la cache de un modulo de la de otro. */
  claveDeCache: readonly unknown[];
  required?: boolean;
  disabled?: boolean;
  error?: string;
  placeholder?: string;
}

export function EntityPickerCombobox({
  label,
  value,
  onChange,
  etiquetaActual,
  buscar,
  claveDeCache,
  required = false,
  disabled = false,
  error,
  placeholder = 'Elegir...',
}: EntityPickerComboboxProps): React.ReactElement {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');

  const opciones = useQuery({
    queryKey: [...claveDeCache, 'opciones', texto],
    queryFn: ({ signal }) => buscar(texto, signal),
    // No se consulta hasta abrir: una pantalla con seis relaciones lanzaria
    // seis peticiones que quiza nadie llegue a necesitar.
    enabled: abierto,
    staleTime: 30_000,
  });

  const elegida = opciones.data?.find((o) => o.id === value);
  const textoDelBoton = elegida?.label ?? etiquetaActual ?? (value ? '...' : placeholder);

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

      <Popover onOpenChange={setAbierto} open={abierto}>
        <PopoverTrigger asChild>
          <Button
            aria-describedby={error ? `${id}-error` : undefined}
            aria-expanded={abierto}
            aria-invalid={error ? true : undefined}
            className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground')}
            disabled={disabled}
            id={id}
            role="combobox"
            type="button"
            variant="outline"
          >
            <span className="truncate">{textoDelBoton}</span>
            <ChevronsUpDown aria-hidden className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
          <Command shouldFilter={false}>
            <CommandInput onValueChange={setTexto} placeholder="Buscar..." value={texto} />
            <CommandList>
              {opciones.isFetching ? (
                <div className="text-muted-foreground flex items-center gap-2 px-3 py-6 text-sm">
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                  Buscando...
                </div>
              ) : opciones.isError ? (
                <div className="text-muted-foreground px-3 py-6 text-sm">
                  No pudimos cargar las opciones.
                </div>
              ) : (
                <>
                  <CommandEmpty>Ningun resultado.</CommandEmpty>
                  <CommandGroup>
                    {!required && value ? (
                      <CommandItem
                        onSelect={() => {
                          onChange(null);
                          setAbierto(false);
                        }}
                        value="__ninguno__"
                      >
                        <span className="text-muted-foreground">Sin asignar</span>
                      </CommandItem>
                    ) : null}

                    {(opciones.data ?? []).map((opcion) => (
                      <CommandItem
                        key={opcion.id}
                        onSelect={() => {
                          onChange(opcion.id);
                          setAbierto(false);
                        }}
                        value={opcion.id}
                      >
                        <Check
                          aria-hidden
                          className={cn(
                            'size-4',
                            opcion.id === value ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <span className="truncate">{opcion.label}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {error ? (
        <p className="text-destructive text-sm" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
