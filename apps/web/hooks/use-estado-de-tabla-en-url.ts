'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import type { OrdenDeTabla } from '@/components/app/table/types';

/**
 * Busqueda, orden, pagina y tamano en la URL.
 *
 * Como `use-estado-en-url`, pero con orden: los modulos generados si ordenan por
 * columna y ese orden merece un enlace compartible.
 */
export interface EstadoDeTabla {
  busqueda: string;
  orden: OrdenDeTabla | null;
  pagina: number;
  tamano: number;
}

const TAMANO_POR_DEFECTO = 25;

export function useEstadoDeTablaEnUrl(): {
  estado: EstadoDeTabla;
  setBusqueda: (valor: string) => void;
  setOrden: (valor: OrdenDeTabla | null) => void;
  setPagina: (valor: number) => void;
  setTamano: (valor: number) => void;
  limpiar: () => void;
} {
  const router = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();

  const estado = useMemo<EstadoDeTabla>(() => {
    const pagina = Number(parametros.get('pagina'));
    const tamano = Number(parametros.get('filas'));
    const campo = parametros.get('orden');
    const direccion = parametros.get('dir');

    return {
      busqueda: parametros.get('q') ?? '',
      orden: campo ? { campo, direccion: direccion === 'desc' ? 'desc' : 'asc' } : null,
      pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : 1,
      tamano: Number.isInteger(tamano) && tamano > 0 ? tamano : TAMANO_POR_DEFECTO,
    };
  }, [parametros]);

  const escribir = useCallback(
    (cambios: Partial<EstadoDeTabla>) => {
      const siguiente = { ...estado, ...cambios };
      const query = new URLSearchParams();

      if (siguiente.busqueda) query.set('q', siguiente.busqueda);
      if (siguiente.orden) {
        query.set('orden', siguiente.orden.campo);
        query.set('dir', siguiente.orden.direccion);
      }
      if (siguiente.pagina !== 1) query.set('pagina', String(siguiente.pagina));
      if (siguiente.tamano !== TAMANO_POR_DEFECTO) query.set('filas', String(siguiente.tamano));

      const cadena = query.toString();
      router.replace(cadena ? `${ruta}?${cadena}` : ruta, { scroll: false });
    },
    [estado, router, ruta],
  );

  return {
    estado,
    // Filtrar u ordenar vuelve a la primera pagina: quedarse en la siete de un
    // resultado de dos muestra una tabla vacia sin motivo.
    setBusqueda: useCallback((busqueda: string) => escribir({ busqueda, pagina: 1 }), [escribir]),
    setOrden: useCallback(
      (orden: OrdenDeTabla | null) => escribir({ orden, pagina: 1 }),
      [escribir],
    ),
    setPagina: useCallback((pagina: number) => escribir({ pagina }), [escribir]),
    setTamano: useCallback((tamano: number) => escribir({ tamano, pagina: 1 }), [escribir]),
    limpiar: useCallback(
      () => escribir({ busqueda: '', orden: null, pagina: 1, tamano: TAMANO_POR_DEFECTO }),
      [escribir],
    ),
  };
}
