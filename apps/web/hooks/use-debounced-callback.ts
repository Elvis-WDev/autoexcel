'use client';

import { useEffect, useRef } from 'react';

/**
 * Retrasa una llamada hasta que deje de pedirse durante `ms`.
 *
 * Para la busqueda libre de las tablas: escribir "comercial" son nueve
 * pulsaciones y una sola consulta. Los selectores acotados **no** se retrasan
 * —elegir una opcion es una decision, no una duda—, que es lo que pide
 * `data-tables.md`.
 *
 * La referencia guardada evita que un cambio de la funcion reinicie el reloj a
 * media escritura.
 */
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  ms = 300,
): (...args: A) => void {
  const ultima = useRef(fn);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    ultima.current = fn;
  }, [fn]);

  useEffect(
    () => () => {
      if (reloj.current) clearTimeout(reloj.current);
    },
    [],
  );

  return (...args: A) => {
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => ultima.current(...args), ms);
  };
}
