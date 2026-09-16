'use client';

import { useEffect, useRef } from 'react';

/**
 * Devuelve el foco a donde estaba antes de abrir una capa.
 *
 * Radix lo hace solo cuando la capa se abre desde su propio `Trigger`. Nuestros
 * dialogos son **controlados** —se abren cambiando una prop, desde una accion de
 * fila o un atajo—, asi que ahi no hay disparador que recuerde nada y el foco
 * acaba en `body`.
 *
 * Para quien navega con raton eso no se nota. Para quien navega con teclado
 * significa volver al principio de la pagina cada vez que cierra un dialogo, y
 * `forms-and-workflows.md` lo exige explicitamente en el contrato del modal.
 *
 * Devuelve la funcion de restauracion para poder engancharla a
 * `onCloseAutoFocus`, que es donde Radix cede el control.
 */
export function useFocusRestore(abierto: boolean): () => void {
  const previo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (abierto) {
      const activo = document.activeElement;
      previo.current = activo instanceof HTMLElement ? activo : null;
    }
  }, [abierto]);

  return () => {
    const destino = previo.current;
    if (!destino?.isConnected) return;
    destino.focus();
  };
}
