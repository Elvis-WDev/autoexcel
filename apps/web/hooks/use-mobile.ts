import { useSyncExternalStore } from 'react';

const MOBILE_BREAKPOINT = 768;
const CONSULTA = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

/**
 * Si la ventana esta en el rango movil.
 *
 * Reescrito respecto a lo que instala shadcn, que leia el ancho con un
 * `setState` dentro de un efecto. Eso provoca un renderizado en cascada —React
 * pinta una vez con el valor equivocado y otra con el bueno— y la propia regla
 * `react-hooks/set-state-in-effect` lo rechaza.
 *
 * `useSyncExternalStore` es el primitivo pensado para esto: suscribirse a algo
 * que vive fuera de React. Ademas resuelve el renderizado en servidor sin
 * inventarse un valor, porque tiene una instantanea propia para el.
 */
function suscribir(alCambiar: () => void): () => void {
  const consulta = window.matchMedia(CONSULTA);
  consulta.addEventListener('change', alCambiar);
  return () => consulta.removeEventListener('change', alCambiar);
}

function enCliente(): boolean {
  return window.matchMedia(CONSULTA).matches;
}

/** En el servidor no hay ventana. Se asume escritorio y el cliente corrige. */
function enServidor(): boolean {
  return false;
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(suscribir, enCliente, enServidor);
}
