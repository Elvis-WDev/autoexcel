import { NextResponse, type NextRequest } from 'next/server';

/**
 * Guardia de rutas.
 *
 * **Esto no es autorizacion.** Mira si existe la cookie de sesion, nada mas: no
 * la valida, no puede. Sirve para una sola cosa, y es evitar que alguien sin
 * sesion vea el armazon del panel parpadear antes de que una peticion falle.
 *
 * La autoridad sigue siendo el backend, que comprueba la sesion y la propiedad
 * en cada endpoint. Una cookie caducada pasa por aqui y se topa con un `401`
 * mas adelante, que es exactamente lo que tiene que ocurrir.
 */

// En produccion, con cookies seguras, Better Auth le pone el prefijo `__Secure-`.
const COOKIES_DE_SESION = ['better-auth.session_token', '__Secure-better-auth.session_token'];

export function middleware(request: NextRequest): NextResponse {
  const tieneSesion = COOKIES_DE_SESION.some((nombre) => request.cookies.has(nombre));
  if (tieneSesion) return NextResponse.next();

  const destino = new URL('/entrar', request.url);
  // Para volver donde se iba, una vez dentro.
  destino.searchParams.set('destino', request.nextUrl.pathname + request.nextUrl.search);

  return NextResponse.redirect(destino);
}

export const config = {
  /**
   * Solo paginas. **`/api/*` queda fuera entero**, y no es un detalle: una
   * llamada sin sesion tiene que recibir el `401` con el sobre de error del
   * backend, porque es lo que el interceptor de TanStack Query reconoce para
   * llevar a la pantalla de sesion. Si el guardia la interceptara, la respuesta
   * seria un redirect a HTML, `fetch` lo seguiria sin rechistar, y el
   * interceptor no veria nunca un `401`.
   *
   * Fuera tambien la propia pantalla de sesion —o no habria forma de iniciarla—,
   * la sonda, y **`_next` entero**.
   *
   * Lo de `_next` no es una optimizacion: excluir solo `_next/static` y
   * `_next/image` dejaba dentro del guardia el resto de rutas internas de Next
   * —recarga en caliente, cargas utiles del router— que se pedian **sin cookie
   * de sesion** y recibian un redirect a HTML. El resultado era que React no
   * llegaba a hidratar y la pagina se quedaba muerta, sin un solo error visible.
   *
   * Lo encontro la primera prueba de navegador. Ninguna de jsdom podia: alli no
   * hay middleware.
   */
  matcher: ['/((?!entrar|api|health|_next|favicon.ico).*)'],
};
