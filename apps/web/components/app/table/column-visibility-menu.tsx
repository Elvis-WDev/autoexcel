'use client';

import { Columns3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface ColumnaConmutable {
  id: string;
  etiqueta: string;
  visible: boolean;
  onCambiar: (visible: boolean) => void;
}

/**
 * Elegir que columnas se ven.
 *
 * Se lista por su **etiqueta de negocio**, nunca por el identificador de la
 * columna: `fecha_creacion` no es un nombre que nadie deba leer.
 *
 * La identidad del registro y la columna de acciones no aparecen aqui: sin
 * ellas la tabla deja de servir, y `data-tables.md` prohibe que la visibilidad
 * pueda esconderlas.
 */
export function ColumnVisibilityMenu({
  columnas,
}: {
  columnas: ColumnaConmutable[];
}): React.ReactElement | null {
  if (columnas.length === 0) return null;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button className="h-9" size="sm" variant="outline">
              <Columns3 aria-hidden className="size-4" />
              <span className="hidden sm:inline">Columnas</span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Elegir las columnas visibles</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Columnas</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columnas.map((columna) => (
          <DropdownMenuCheckboxItem
            checked={columna.visible}
            key={columna.id}
            onCheckedChange={columna.onCambiar}
            onSelect={(e) => e.preventDefault()}
          >
            {columna.etiqueta}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
