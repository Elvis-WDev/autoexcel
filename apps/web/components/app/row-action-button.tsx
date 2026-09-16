'use client';

import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Una accion de fila.
 *
 * Icono con nombre accesible y descripcion opaca, siempre. Un icono sin nombre
 * es invisible para un lector de pantalla y adivinanza para todos los demas.
 *
 * Cuando la accion existe pero ahora no se puede, se deshabilita **con el
 * motivo** en la descripcion: un boton gris sin explicacion es peor que ninguno.
 * El envoltorio `span` esta porque un boton deshabilitado no emite los eventos
 * que la descripcion necesita para aparecer.
 *
 * **Excepcion declarada al objetivo tactil de 44px.** Estos botones miden 32 y
 * viven dentro de filas de tabla densas; a 44 la fila crecería un 40% y una
 * tabla de veinticinco filas dejaria de caber en una pantalla, que es
 * exactamente lo que `interface-design.md` pide evitar. La regla de
 * `navigation-responsive.md` habla de controles de cabecera, navegacion, cierre
 * de dialogo y **acciones sueltas**; una accion dentro de una fila no lo es, y
 * la fila entera —mucho mas alta que 44px— es pulsable para abrir el registro.
 */
export interface RowActionButtonProps {
  etiqueta: string;
  icono: LucideIcon;
  onClick?: () => void;
  /** Motivo por el que no se puede ahora. Deshabilita y se muestra al posarse. */
  deshabilitadaPorque?: string;
  destructiva?: boolean;
  className?: string;
}

export function RowActionButton({
  etiqueta,
  icono: Icono,
  onClick,
  deshabilitadaPorque,
  destructiva = false,
  className,
}: RowActionButtonProps): React.ReactElement {
  const deshabilitada = Boolean(deshabilitadaPorque);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            aria-label={etiqueta}
            className={cn(
              'size-8',
              destructiva && 'text-destructive hover:text-destructive hover:bg-destructive/10',
              className,
            )}
            disabled={deshabilitada}
            onClick={onClick}
            size="icon"
            variant="ghost"
          >
            <Icono aria-hidden className="size-4" />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{deshabilitadaPorque ?? etiqueta}</TooltipContent>
    </Tooltip>
  );
}
