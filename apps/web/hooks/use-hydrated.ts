import { useSyncExternalStore } from 'react';

/** Nunca cambia: lo que cambia es de que lado se lee. */
const sinSuscripcion = (): (() => void) => () => undefined;

/**
 * `false` en el servidor y en el primer renderizado del cliente, `true` despues.
 *
 * Sirve para lo que solo se sabe en el navegador —el tema resuelto, el tamano de
 * la ventana— sin provocar un desajuste de hidratacion.
 *
 * Es `useSyncExternalStore` y no un `useState` dentro de un efecto porque ese
 * patron encadena un renderizado extra con el valor equivocado, y React lo
 * desaconseja explicitamente.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    sinSuscripcion,
    () => true,
    () => false,
  );
}
