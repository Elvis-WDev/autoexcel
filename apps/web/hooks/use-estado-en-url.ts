'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

/**
 * Busqueda, pagina y tamano viven en la URL.
 *
 * Para que un enlace se pueda compartir y para que el boton de atras del
 * navegador haga lo que se espera. `data-tables.md` lo pide para lo que merezca
 * un enlace profundo, y una lista filtrada lo merece.
 *
 * Se usa `replace` y no `push`: teclear en la caja de busqueda no debe apilar
 * una entrada de historial por letra.
 */
export interface EstadoDeLista {
  busqueda: string;
  pagina: number;
  tamano: number;
}

const POR_DEFECTO: EstadoDeLista = { busqueda: '', pagina: 1, tamano: 25 };

export function useEstadoEnUrl(): {
  estado: EstadoDeLista;
  setBusqueda: (valor: string) => void;
  setPagina: (valor: number) => void;
  setTamano: (valor: number) => void;
  limpiar: () => void;
} {
  const router = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();

  const estado = useMemo<EstadoDeLista>(() => {
    const pagina = Number(parametros.get('pagina'));
    const tamano = Number(parametros.get('filas'));

    return {
      busqueda: parametros.get('q') ?? POR_DEFECTO.busqueda,
      pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : POR_DEFECTO.pagina,
      tamano: Number.isInteger(tamano) && tamano > 0 ? tamano : POR_DEFECTO.tamano,
    };
  }, [parametros]);

  const escribir = useCallback(
    (cambios: Partial<EstadoDeLista>) => {
      const siguiente = { ...estado, ...cambios };
      const query = new URLSearchParams();

      // Solo lo que se aparta de lo normal entra en la URL: asi una lista sin
      // filtrar tiene una direccion limpia.
      if (siguiente.busqueda) query.set('q', siguiente.busqueda);
      if (siguiente.pagina !== POR_DEFECTO.pagina) query.set('pagina', String(siguiente.pagina));
      if (siguiente.tamano !== POR_DEFECTO.tamano) query.set('filas', String(siguiente.tamano));

      const cadena = query.toString();
      router.replace(cadena ? `${ruta}?${cadena}` : ruta, { scroll: false });
    },
    [estado, router, ruta],
  );

  return {
    estado,
    // Filtrar o cambiar el tamano vuelve a la primera pagina: quedarse en la
    // siete de un resultado de dos paginas muestra una tabla vacia sin motivo.
    setBusqueda: useCallback((busqueda: string) => escribir({ busqueda, pagina: 1 }), [escribir]),
    setPagina: useCallback((pagina: number) => escribir({ pagina }), [escribir]),
    setTamano: useCallback((tamano: number) => escribir({ tamano, pagina: 1 }), [escribir]),
    limpiar: useCallback(() => escribir({ ...POR_DEFECTO }), [escribir]),
  };
}
