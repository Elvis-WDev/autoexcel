'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useHydrated } from '@/hooks/use-hydrated';

const OPCIONES = [
  { valor: 'light', etiqueta: 'Claro', Icono: Sun },
  { valor: 'dark', etiqueta: 'Oscuro', Icono: Moon },
  { valor: 'system', etiqueta: 'El del sistema', Icono: Monitor },
] as const;

/**
 * Tres opciones y no un interruptor de dos.
 *
 * "El del sistema" no es un adorno: mientras nadie elija, la preferencia del
 * sistema manda, y hace falta una forma de volver a ella despues de haber
 * elegido.
 *
 * Hasta que el componente monta no se sabe que tema resolvio el navegador, asi
 * que se reserva el hueco con un boton deshabilitado del mismo tamano. Pintar
 * un icono antes de saberlo produce un parpadeo al hidratar.
 */
export function ThemeToggle(): React.ReactElement {
  const { theme, setTheme } = useTheme();
  const hidratado = useHydrated();

  if (!hidratado) {
    return <Button className="size-11" disabled size="icon" variant="ghost" aria-hidden />;
  }

  const actual = OPCIONES.find((o) => o.valor === theme) ?? OPCIONES[2];

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button className="size-11" size="icon" variant="ghost">
              <actual.Icono aria-hidden className="size-4" />
              <span className="sr-only">Cambiar el tema</span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Cambiar el tema</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end">
        {OPCIONES.map(({ valor, etiqueta, Icono }) => (
          <DropdownMenuItem key={valor} onSelect={() => setTheme(valor)}>
            <Icono aria-hidden className="size-4" />
            {etiqueta}
            {theme === valor ? <span className="sr-only"> (activo)</span> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
