/**
 * Los errores de Better Auth, en lenguaje de negocio.
 *
 * Es la excepcion a la regla de no traducir: los mensajes de la API de negocio
 * ya vienen escritos en español, pero Better Auth es una libreria y contesta en
 * ingles con sus propios codigos. Aqui es donde toca traducir, y solo aqui.
 *
 * `INVALID_EMAIL_OR_PASSWORD` dice las dos cosas a la vez a proposito: decir
 * cual de las dos falla confirmaria a quien lo intenta que ese correo existe.
 */
const MENSAJES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'El correo o la contrasena no son correctos.',
  USER_NOT_FOUND: 'El correo o la contrasena no son correctos.',
  INVALID_PASSWORD: 'El correo o la contrasena no son correctos.',
  EMAIL_NOT_VERIFIED: 'Tu cuenta todavia no esta verificada.',
  EMAIL_PASSWORD_SIGN_UP_DISABLED: 'El registro esta cerrado. Pide una cuenta a quien administre.',
  TOO_MANY_REQUESTS: 'Demasiados intentos seguidos. Espera un momento.',
};

export function mensajeDeAutenticacion(code: string | undefined, status: number): string {
  if (code && MENSAJES[code]) return MENSAJES[code];
  if (status === 401 || status === 403) return 'El correo o la contrasena no son correctos.';
  if (status === 429) return 'Demasiados intentos seguidos. Espera un momento.';
  return 'No pudimos iniciar sesion. Intentalo de nuevo.';
}
