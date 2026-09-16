import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * El limite de intentos de acceso, contra Better Auth de verdad.
 *
 * Esto no puede probarse con dobles: el fallo que corrige vive en la interaccion
 * entre tres piezas —el proxy de Next, el manejador de Better Auth y su
 * resolucion de direcciones— y ninguna de las tres esta en la suite de unidad.
 *
 * Lo que se corrigio, medido antes de corregirlo:
 *
 *   - Next reenvia `x-forwarded-host` pero **no** `x-forwarded-for`, y el socket
 *     que ve la API es siempre el de Next. Better Auth caia entonces a un unico
 *     contador compartido: tres intentos cada diez segundos para toda la
 *     aplicacion, y cualquiera podia dejar a los demas sin poder entrar.
 *   - Una cabecera `x-forwarded-for` falsificada pasaba intacta y se aceptaba
 *     como direccion del cliente. Cambiandola en cada peticion, contador nuevo
 *     cada vez: fuerza bruta sin limite.
 *
 * Se usan correos que no existen a proposito. El limite no distingue —un limite
 * que solo se aplicara a cuentas reales confirmaria cuales lo son— y asi estas
 * pruebas no dejan bloqueada la cuenta que usa la aceptacion.
 */

/** El valor por defecto de `AUTH_LOGIN_ATTEMPTS`. */
const INTENTOS_PERMITIDOS = 5;

interface Respuesta {
  estado: number;
  codigo: string | null;
}

test.describe('Limite de intentos de acceso', () => {
  async function intentar(
    peticion: APIRequestContext,
    correo: string,
    cabeceras: Record<string, string> = {},
  ): Promise<Respuesta> {
    const respuesta = await peticion.post('/api/auth/sign-in/email', {
      data: { email: correo, password: 'contrasena-que-no-es' },
      headers: { origin: 'http://127.0.0.1:3100', ...cabeceras },
      failOnStatusCode: false,
    });

    const cuerpo = (await respuesta.json().catch(() => ({}))) as { code?: string };
    return { estado: respuesta.status(), codigo: cuerpo.code ?? null };
  }

  test('corta tras agotar los intentos de una cuenta', async ({ request }) => {
    const correo = `limite-${Date.now()}@example.test`;

    for (let i = 1; i <= INTENTOS_PERMITIDOS; i += 1) {
      const respuesta = await intentar(request, correo);
      expect(respuesta.estado, `el intento ${i} deberia seguir permitido`).toBe(401);
    }

    const bloqueado = await intentar(request, correo);
    expect(bloqueado.estado).toBe(429);
    expect(bloqueado.codigo).toBe('TOO_MANY_REQUESTS');
  });

  /**
   * **La prueba que justifica la fase.** Sin ella, C0 no se puede dar por
   * cerrado mirando el codigo: el bypass era invisible en la lectura.
   */
  test('falsificar X-Forwarded-For no lo esquiva', async ({ request }) => {
    const correo = `forjado-${Date.now()}@example.test`;

    for (let i = 1; i <= INTENTOS_PERMITIDOS; i += 1) {
      const respuesta = await intentar(request, correo, { 'x-forwarded-for': `10.0.0.${i}` });
      expect(respuesta.estado, `el intento ${i} deberia seguir permitido`).toBe(401);
    }

    // Direccion nueva, cuenta la misma: antes esto estrenaba contador.
    const bloqueado = await intentar(request, correo, { 'x-forwarded-for': '198.51.100.7' });
    expect(bloqueado.estado).toBe(429);
  });

  /** Nadie puede dejar fuera a los demas: era la otra cara del mismo fallo. */
  test('agotar una cuenta no bloquea a otra', async ({ request }) => {
    const victima = `victima-${Date.now()}@example.test`;
    const ajena = `ajena-${Date.now()}@example.test`;

    for (let i = 0; i <= INTENTOS_PERMITIDOS; i += 1) await intentar(request, victima);
    expect((await intentar(request, victima)).estado).toBe(429);

    expect((await intentar(request, ajena)).estado).toBe(401);
  });
});
