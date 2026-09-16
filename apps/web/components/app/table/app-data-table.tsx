'use client';

import {
  columnVisibilityFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState, type MotivoVacio } from '@/components/app/empty-state';
import { ErrorState } from '@/components/app/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { TablePagination } from './table-pagination';
import { TableToolbar, type TableToolbarProps } from './table-toolbar';
import type { OrdenDeTabla } from './types';

/**
 * El contrato de columna del proyecto.
 *
 * Deliberadamente **no** es el `ColumnDef` de TanStack: su generico arrastra el
 * tipo de las *features* a cada modulo que declare una columna, y eso ataria
 * todas las pantallas a la version de la libreria. TanStack vive detras de este
 * componente, que es lo que pide `frontend.md`, y se traduce aqui dentro.
 */
export interface ColumnaDeTabla<T extends object> {
  /** Tambien es el campo por el que se pide el orden al servidor. */
  id: string;
  etiqueta: string;
  celda: (fila: T) => React.ReactNode;
  ordenable?: boolean;
  /** Las columnas fijas no se pueden ocultar: sin ellas la tabla no sirve. */
  fija?: boolean;
  alineacion?: 'izquierda' | 'derecha' | 'centro';
  ancho?: string;
}

const ALINEACION = {
  izquierda: 'text-left',
  derecha: 'text-right tabular-nums',
  centro: 'text-center',
} as const;

const FEATURES = tableFeatures({ columnVisibilityFeature, rowSortingFeature });

export interface AppDataTableProps<T extends object> extends Omit<TableToolbarProps, 'columnas'> {
  columnas: ColumnaDeTabla<T>[];
  filas: T[];
  getRowId: (fila: T) => string;

  /** Total del servidor, no de la pagina. */
  total: number;
  pagina: number;
  tamano: number;
  onPaginaChange: (pagina: number) => void;
  onTamanoChange: (tamano: number) => void;

  orden: OrdenDeTabla | null;
  onOrdenChange: (orden: OrdenDeTabla | null) => void;

  cargando?: boolean;
  error?: unknown;
  onReintentar?: () => void;

  vacio: { motivo?: MotivoVacio; titulo: string; descripcion?: string; accion?: React.ReactNode };
  acciones?: React.ReactNode;
  /** Se pinta al final de cada fila. Columna estrecha y estable. */
  accionesDeFila?: (fila: T) => React.ReactNode;
  onFilaClick?: (fila: T) => void;
}

/**
 * La unica tabla de la aplicacion.
 *
 * Busqueda, filtros, orden, columnas, paginacion, estados y acciones, siempre
 * en el mismo sitio y con el mismo comportamiento. El modulo aporta columnas
 * tipadas, datos y las acciones validas; la mecanica es de aqui.
 *
 * Todo lo pesado ocurre en el servidor —busca, ordena y pagina la API—, asi que
 * la tabla nunca recorta ni reordena en el cliente: pintaria algo distinto de
 * lo que dice el pie.
 */
export function AppDataTable<T extends object>({
  columnas,
  filas,
  getRowId,
  total,
  pagina,
  tamano,
  onPaginaChange,
  onTamanoChange,
  orden,
  onOrdenChange,
  cargando = false,
  error,
  onReintentar,
  vacio,
  acciones,
  accionesDeFila,
  onFilaClick,
  ...toolbar
}: AppDataTableProps<T>): React.ReactElement {
  const [ocultas, setOcultas] = useState<Record<string, boolean>>({});

  const columnDefs = useMemo(
    () =>
      columnas.map((columna) => ({
        id: columna.id,
        header: columna.etiqueta,
        enableHiding: columna.fija !== true,
        enableSorting: columna.ordenable === true,
      })),
    [columnas],
  );

  // `T & Record<string, unknown>`: TanStack exige que la fila sea indexable.
  // Se resuelve aqui dentro para no arrastrar su restriccion a cada modulo.
  const table = useTable<typeof FEATURES, T & Record<string, unknown>>({
    features: FEATURES,
    columns: columnDefs,
    data: filas as (T & Record<string, unknown>)[],
    getRowId,
    // El servidor ya devolvio la pagina ordenada.
    manualSorting: true,
    state: {
      columnVisibility: ocultas,
      sorting: orden ? [{ id: orden.campo, desc: orden.direccion === 'desc' }] : [],
    },
    onColumnVisibilityChange: setOcultas,
  });

  const visibles = useMemo(
    () => columnas.filter((c) => ocultas[c.id] !== false),
    [columnas, ocultas],
  );

  const conmutables = useMemo(
    () =>
      columnas
        .filter((c) => c.fija !== true)
        .map((c) => ({
          id: c.id,
          etiqueta: c.etiqueta,
          visible: ocultas[c.id] !== false,
          onCambiar: (visible: boolean) => setOcultas((previo) => ({ ...previo, [c.id]: visible })),
        })),
    [columnas, ocultas],
  );

  /** Ascendente -> descendente -> sin orden. Tres estados, no dos. */
  function alternarOrden(id: string): void {
    if (!orden || orden.campo !== id) return onOrdenChange({ campo: id, direccion: 'asc' });
    if (orden.direccion === 'asc') return onOrdenChange({ campo: id, direccion: 'desc' });
    return onOrdenChange(null);
  }

  const columnasTotales = visibles.length + (accionesDeFila ? 1 : 0);

  return (
    <div className="rounded-lg border">
      <TableToolbar {...toolbar} acciones={acciones} columnas={conmutables} />

      <div className="overflow-x-auto border-t">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {visibles.map((columna) => {
                const activa = orden?.campo === columna.id;
                const Icono = !activa
                  ? ChevronsUpDown
                  : orden.direccion === 'asc'
                    ? ArrowUp
                    : ArrowDown;

                return (
                  <TableHead
                    className={cn(ALINEACION[columna.alineacion ?? 'izquierda'], 'h-10')}
                    key={columna.id}
                    style={columna.ancho ? { width: columna.ancho } : undefined}
                  >
                    {/*
                      Las etiquetas vienen del Excel de otra persona y el backend
                      admite 120 caracteres. Sin tope, una sola cabecera larga
                      estira su columna y expulsa al resto de la pantalla.
                    */}
                    {columna.ordenable ? (
                      <button
                        aria-label={`Ordenar por ${columna.etiqueta}`}
                        className="hover:text-foreground -mx-1 inline-flex max-w-[14rem] items-center gap-1.5 rounded-sm px-1"
                        onClick={() => alternarOrden(columna.id)}
                        title={columna.etiqueta}
                        type="button"
                      >
                        <span className="truncate">{columna.etiqueta}</span>
                        <Icono
                          aria-hidden
                          className={cn('size-3.5 shrink-0', !activa && 'opacity-40')}
                        />
                      </button>
                    ) : (
                      <span className="block max-w-[14rem] truncate" title={columna.etiqueta}>
                        {columna.etiqueta}
                      </span>
                    )}
                  </TableHead>
                );
              })}
              {accionesDeFila ? (
                <TableHead className="w-px whitespace-nowrap">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>

          <TableBody>
            {/* El marco de la tabla se queda en los tres estados: sin saltos. */}
            {cargando ? (
              Array.from({ length: Math.min(tamano, 8) }, (_, i) => (
                <TableRow key={`esqueleto-${i}`}>
                  {Array.from({ length: columnasTotales }, (_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : error ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columnasTotales}>
                  <ErrorState error={error} onReintentar={onReintentar} />
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columnasTotales}>
                  <EmptyState
                    accion={vacio.accion}
                    descripcion={vacio.descripcion}
                    motivo={vacio.motivo ?? 'sin-datos'}
                    titulo={vacio.titulo}
                  />
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((fila) => (
                <TableRow
                  className={cn(onFilaClick && 'cursor-pointer')}
                  key={fila.id}
                  onClick={onFilaClick ? () => onFilaClick(fila.original) : undefined}
                >
                  {visibles.map((columna) => (
                    <TableCell
                      className={ALINEACION[columna.alineacion ?? 'izquierda']}
                      key={columna.id}
                    >
                      {columna.celda(fila.original)}
                    </TableCell>
                  ))}
                  {accionesDeFila ? (
                    <TableCell
                      className="w-px whitespace-nowrap"
                      // Las acciones no deben disparar la apertura de la fila.
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1">
                        {accionesDeFila(fila.original)}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <TablePagination
        ocupada={cargando}
        onPaginaChange={onPaginaChange}
        onTamanoChange={onTamanoChange}
        pagina={pagina}
        tamano={tamano}
        total={total}
      />
    </div>
  );
}
