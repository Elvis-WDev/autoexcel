/**
 * Limite de intentos de acceso, **por cuenta**.
 *
 * Better Auth ya trae un limite estricto para `/sign-in` —tres intentos cada
 * diez segundos— pero lo aplica por direccion IP, y aqui la IP no existe: medido
 * contra el despliegue real, Next reenvia `x-forwarded-host` pero no
 * `x-forwarded-for`, y el socket que ve la API es siempre el de Next. Eso deja
 * dos fallos opuestos:
 *
 *   - Sin cabecera, Better Auth cae a un unico contador compartido por ruta: tres
 *     intentos cada diez segundos **para toda la aplicacion**. Tres personas
 *     entrando a la vez y la tercera se queda fuera.
 *   - Con cabecera falsificada, un solo valor pasa su filtro y se acepta como
 *     direccion del cliente. Cambiandolo en cada peticion, contador nuevo cada
 *     vez y fuerza bruta sin limite.
 *
 * La cuenta si se conoce siempre: viene en el cuerpo. Contar por ella resuelve
 * las dos caras a la vez —quien ataca una cuenta se topa con el limite venga de
 * donde venga, y nadie puede dejar fuera a los demas— y es la defensa que de
 * verdad importa, porque la fuerza bruta se dirige a **una** cuenta.
 *
 * Limitacion conocida, la misma que el limitador de la API: los contadores
 * viven en el proceso. Al reiniciar se pierden, y con varias instancias cada una
 * llevaria los suyos. Una cuota compartida necesitaria Redis y un ADR.
 */
interface Ventana {
  intentos: number;
  expiraEn: number;
}

const ventanas = new Map<string, Ventana>();

/** Cada cuanto se barren las ventanas caducadas. */
const BARRIDO_MS = 60_000;
let ultimoBarrido = Date.now();

function barrer(ahora: number): void {
  if (ahora - ultimoBarrido < BARRIDO_MS) return;
  ultimoBarrido = ahora;

  for (const [clave, ventana] of ventanas) {
    if (ventana.expiraEn <= ahora) ventanas.delete(clave);
  }
}

/** Vacia los contadores. Existe para que los tests no se contaminen entre si. */
export function reiniciarIntentosDeAcceso(): void {
  ventanas.clear();
}

export interface LimiteDeAcceso {
  intentos: number;
  ventanaMs: number;
}

/**
 * Resultado de un intento.
 *
 * Se devuelve en vez de lanzarse para que este modulo no sepa nada de Better
 * Auth ni de HTTP: quien lo llama decide como rechazar. Ademas lo hace probable
 * sin levantar nada.
 */
export type ResultadoDeIntento = { permitido: true } | { permitido: false; reintentarEn: number };

/**
 * Registra un intento y decide si se permite.
 *
 * La clave es el correo normalizado: `Ana@Example.com` y `ana@example.com` son
 * la misma cuenta, y sin normalizar bastaria alternar mayusculas para estrenar
 * contador.
 *
 * **No distingue si la cuenta existe.** Quien lo llama no debe hacerlo tampoco:
 * un limite que solo se aplicara a correos reales confirmaria cuales lo son.
 */
export function registrarIntentoDeAcceso(
  correo: string,
  limite: LimiteDeAcceso,
): ResultadoDeIntento {
  const ahora = Date.now();
  barrer(ahora);

  const clave = correo.trim().toLowerCase();
  const actual = ventanas.get(clave);

  if (!actual || actual.expiraEn <= ahora) {
    ventanas.set(clave, { intentos: 1, expiraEn: ahora + limite.ventanaMs });
    return { permitido: true };
  }

  if (actual.intentos >= limite.intentos) {
    return { permitido: false, reintentarEn: Math.ceil((actual.expiraEn - ahora) / 1000) };
  }

  actual.intentos += 1;
  return { permitido: true };
}
