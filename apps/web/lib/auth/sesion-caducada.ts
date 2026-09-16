/**
 * Que hacer cuando el backend dice que no hay sesion.
 *
 * Una recarga completa y no una navegacion del router, a proposito: al perder
 * la sesion hay que tirar **todo** el estado en memoria —cache de consultas,
 * formularios a medias, listas cargadas— y una recarga lo garantiza sin tener
 * que acordarse de limpiar cada cosa.
 *
 * El cerrojo evita la avalancha: si una pantalla lanza cinco consultas y las
 * cinco reciben `401`, solo la primera redirige.
 */
let redirigiendo = false;

export function alPerderLaSesion(): void {
  if (redirigiendo) return;
  if (typeof window === 'undefined') return;
  // Ya estamos donde habria que ir.
  if (window.location.pathname.startsWith('/entrar')) return;

  redirigiendo = true;

  const destino = window.location.pathname + window.location.search;

  // Next prefiere `router.push` para navegar dentro de la aplicacion, y tiene
  // razon en el caso normal. Este no lo es: perder la sesion es justo cuando
  // interesa que el proceso empiece de cero, y una navegacion del router
  // conservaria la cache de consultas y el estado de los formularios de quien
  // acaba de quedarse fuera.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/entrar?destino=${encodeURIComponent(destino)}`);
}

/** Existe para los tests: sin esto, el cerrojo se quedaria echado entre casos. */
export function reiniciarCerrojoDeSesion(): void {
  redirigiendo = false;
}
