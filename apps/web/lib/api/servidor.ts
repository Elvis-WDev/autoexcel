import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ApiError } from './errors';

/**
 * Llamadas a la API desde un componente de servidor.
 *
 * Aqui no vale el cliente del navegador: no hay un origen relativo al que
 * apuntar ni una cookie que el navegador adjunte solo. Se llama directamente a
 * la API y se reenvia la cookie de sesion de quien pidio la pagina.
 *
 * Sirve para lo que tiene que decidirse **antes** de pintar —el despachador de
 * pasos, los guardias de ruta—, donde hacerlo en el cliente produciria un
 * parpadeo de la pantalla equivocada.
 */
const ORIGEN = process.env.API_ORIGIN ?? 'http://127.0.0.1:4000';

export async function pedirAlServidor<T>(ruta: string): Promise<T> {
  const galletas = await cookies();

  const respuesta = await fetch(`${ORIGEN}${ruta}`, {
    headers: { cookie: galletas.toString(), Accept: 'application/json' },
    // El estado de un proyecto cambia solo, por un trabajo en segundo plano:
    // cachearlo mostraria un paso que ya no es el actual.
    cache: 'no-store',
  });

  const cuerpo: unknown = await respuesta.json().catch(() => null);

  if (!respuesta.ok) throw ApiError.fromEnvelope(cuerpo, respuesta.status);
  if (typeof cuerpo !== 'object' || cuerpo === null || !('data' in cuerpo)) {
    throw ApiError.opaque(respuesta.status);
  }

  return (cuerpo as { data: T }).data;
}

/**
 * Lo mismo, pero traduciendo los fallos a navegacion.
 *
 * Sin sesion se va a entrar; un proyecto que no existe —o que es de otra
 * persona, que el backend responde igual a proposito— da 404.
 */
export async function pedirODesviar<T>(ruta: string): Promise<T> {
  try {
    return await pedirAlServidor<T>(ruta);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') {
      redirect(`/entrar?destino=${encodeURIComponent(ruta)}`);
    }
    throw error;
  }
}
