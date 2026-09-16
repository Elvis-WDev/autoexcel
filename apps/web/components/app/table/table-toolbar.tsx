'use client';

import { Search, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';
import { ColumnVisibilityMenu, type ColumnaConmutable } from './column-visibility-menu';

/**
 * La barra de la tabla, en un orden que no cambia entre modulos.
 *
 * Busqueda a la izquierda, filtros junto a ella, columnas y acciones a la
 * derecha. Los filtros van **pegados a la tabla que filtran** y no en una
 * tarjeta decorativa aparte, que es el error que `data-tables.md` senala.
 *
 * La busqueda se retrasa aqui y no en cada modulo: asi ninguno se olvida.
 * `Limpiar` solo existe cuando hay algo que limpiar.
 */
export interface TableToolbarProps {
  busqueda: string;
  onBusquedaChange: (valor: string) => void;
  placeholder?: string;
  /** Selectores acotados del modulo. Sin retraso: son decisiones. */
  filtros?: React.ReactNode;
  /** `true` si algun filtro del modulo esta activo. */
  filtrosActivos?: boolean;
  onLimpiarFiltros?: () => void;
  columnas?: ColumnaConmutable[];
  acciones?: React.ReactNode;
}

export function TableToolbar({
  busqueda,
  onBusquedaChange,
  placeholder = 'Buscar...',
  filtros,
  filtrosActivos = false,
  onLimpiarFiltros,
  columnas = [],
  acciones,
}: TableToolbarProps): React.ReactElement {
  // Lo escrito se pinta al instante; la consulta espera.
  const [texto, setTexto] = useState(busqueda);
  const avisar = useDebouncedCallback(onBusquedaChange, 300);

  /**
   * Si la busqueda cambia desde fuera —volver atras en el navegador, limpiar
   * los filtros— la caja tiene que seguirla.
   *
   * Ajustado durante el renderizado, no en un efecto: con un efecto la caja
   * mostraria un instante el texto anterior.
   */
  const [busquedaPrevia, setBusquedaPrevia] = useState(busqueda);
  if (busqueda !== busquedaPrevia) {
    setBusquedaPrevia(busqueda);
    setTexto(busqueda);
  }

  const hayQueLimpiar = filtrosActivos || busqueda.length > 0;

  function escribir(valor: string): void {
    setTexto(valor);
    avisar(valor);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3">
      <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
        <Search
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        />
        <Input
          aria-label={placeholder}
          className="h-9 pl-8"
          onChange={(e) => escribir(e.target.value)}
          placeholder={placeholder}
          type="search"
          value={texto}
        />
      </div>

      {filtros}

      {hayQueLimpiar && onLimpiarFiltros ? (
        <Button className="h-9" onClick={onLimpiarFiltros} size="sm" variant="ghost">
          <X aria-hidden className="size-4" />
          Limpiar filtros
        </Button>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        <ColumnVisibilityMenu columnas={columnas} />
        {acciones}
      </div>
    </div>
  );
}
