/**
 * Valida el destino al que volver despues de entrar.
 *
 * Sin esta comprobacion, `?destino=https://otro-sitio` convertiria la pantalla
 * de sesion en un redirector abierto: un correo de phishing podria enlazar al
 * dominio legitimo y acabar echando a la persona en otro. Solo se aceptan rutas
 * internas, y `//` se rechaza porque el navegador lo lee como protocolo
 * relativo.
 */
export function esDestinoSeguro(destino: string | null): string | null {
  if (!destino) return null;
  if (!destino.startsWith('/')) return null;
  if (destino.startsWith('//')) return null;
  if (destino.startsWith('/entrar')) return null;
  return destino;
}
