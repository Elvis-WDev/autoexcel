import { z } from 'zod';
import { NOMBRES_DE_PROVEEDOR } from '../infrastructure/inference/providers/tipos.js';
import { MODELO_ANTHROPIC } from '../infrastructure/inference/providers/anthropic.js';
import { MODELO_OPENAI } from '../infrastructure/inference/providers/openai.js';
import { MODELO_GEMINI } from '../infrastructure/inference/providers/gemini.js';

/**
 * Una clave que puede no estar.
 *
 * `CLAVE=` en un `.env` es lo mismo que no escribir la linea: una cadena vacia
 * se trata como ausente, o media configuracion a medio rellenar arrancaria
 * fingiendo estar completa.
 */
const claveOpcional = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

/**
 * Configuracion del proceso, validada al arranque.
 *
 * Regla de F0: si falta o es invalida una variable, el proceso no arranca. Es
 * preferible un fallo ruidoso en el segundo cero a un fallo silencioso a mitad
 * de una importacion.
 */

const postgresUrl = z
  .string()
  .min(1)
  .refine(
    (value) => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === 'postgres:' || protocol === 'postgresql:';
      } catch {
        return false;
      }
    },
    { message: 'debe ser una URL postgres:// o postgresql:// valida' },
  );

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    /** Rol duenno. Emite DDL: Prisma sobre `public`, materializador sobre `proj_*`. */
    DATABASE_URL: postgresUrl,
    /** Rol de solo DML. Lo usa el CRUD generico de las aplicaciones generadas. */
    DATABASE_URL_RUNTIME: postgresUrl,

    /**
     * Secreto de Better Auth: firma cookies y tokens de sesion. Un cambio
     * invalida todas las sesiones abiertas.
     */
    AUTH_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres'),
    /** URL publica del API. Better Auth la usa para construir enlaces y cookies. */
    AUTH_BASE_URL: z.string().min(1).default('http://localhost:4000'),
    /** Origenes que pueden enviar credenciales, separados por coma. */
    AUTH_TRUSTED_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0),
      ),

    /**
     * Requerida desde F3. En produccion es obligatoria ya.
     * Una cadena vacia se trata como ausente: `CLAVE=` en un `.env` es lo mismo
     * que no escribir la linea.
     */
    ANTHROPIC_API_KEY: claveOpcional,
    OPENAI_API_KEY: claveOpcional,
    GEMINI_API_KEY: claveOpcional,

    /**
     * Que motor se prueba primero.
     *
     * Si falla, se intentan los demas que tengan clave antes de caer al camino
     * determinista de RE-04. Elegir uno sin clave no es un error de arranque:
     * simplemente no entra en la lista, y se usan los que si la tengan.
     */
    INFERENCE_PROVIDER: z.enum(NOMBRES_DE_PROVEEDOR).default('anthropic'),

    /** Los nombres de modelo caducan; por eso se pueden cambiar sin recompilar. */
    ANTHROPIC_MODEL: z.string().min(1).default(MODELO_ANTHROPIC),
    OPENAI_MODEL: z.string().min(1).default(MODELO_OPENAI),
    GEMINI_MODEL: z.string().min(1).default(MODELO_GEMINI),

    /** Directorio de los xlsx subidos. Nunca se sirve estaticamente. */
    STORAGE_DIR: z.string().min(1).default('./storage'),
    /** Limite de tamanno del archivo subido (RF-01). */
    MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(20 * 1024 * 1024),
    /**
     * Topes de lectura. Acotan el coste de un archivo hostil: un xlsx es un ZIP,
     * y unos pocos kilobytes comprimidos pueden expandirse a millones de celdas.
     */
    MAX_SHEET_ROWS: z.coerce.number().int().positive().default(200_000),
    MAX_SHEETS: z.coerce.number().int().positive().max(200).default(50),
    /**
     * Cuotas por persona (F8, seguimiento del ADR 0001).
     *
     * Cada proyecto crea un schema de PostgreSQL, y el numero de schemas por
     * base de datos no es infinito. Sin cuota, una sola cuenta puede agotar el
     * recurso para todas las demas.
     */
    /**
     * Proxies de confianza, en notacion CIDR y separados por comas.
     *
     * Vacio por defecto, y es lo correcto: sin esto la API **no cree** ninguna
     * cabecera `x-forwarded-for` que le llegue, porque la escribe quien envia la
     * peticion. Se rellena al desplegar detras de un balanceador real, que es
     * cuando hay alguien de quien fiarse.
     */
    AUTH_TRUSTED_PROXIES: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    /** Intentos de acceso permitidos por cuenta dentro de la ventana. */
    AUTH_LOGIN_ATTEMPTS: z.coerce.number().int().positive().max(100).default(5),
    /** Duracion de esa ventana, en minutos. */
    AUTH_LOGIN_WINDOW_MINUTES: z.coerce.number().int().positive().max(1440).default(15),
    MAX_PROJECTS_PER_USER: z.coerce.number().int().positive().max(1000).default(50),
    /** Analisis por hora y por persona: es el endpoint que cuesta dinero. */
    MAX_ANALYSES_PER_HOUR: z.coerce.number().int().positive().default(20),
    /** Subidas por hora y por persona. */
    MAX_UPLOADS_PER_HOUR: z.coerce.number().int().positive().default(60),

    /** Techo del archivo YA descomprimido: la defensa real contra el zip bomb. */
    MAX_UNCOMPRESSED_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(300 * 1024 * 1024),
    MAX_SHEET_COLUMNS: z.coerce.number().int().positive().max(2000).default(256),
  })
  .superRefine((env, ctx) => {
    const sinNingunaClave = !env.ANTHROPIC_API_KEY && !env.OPENAI_API_KEY && !env.GEMINI_API_KEY;

    // Antes se exigia la de Anthropic. Ahora vale cualquiera de las tres: lo
    // que no puede pasar en produccion es quedarse sin inferencia entera.
    if (env.NODE_ENV === 'production' && sinNingunaClave) {
      ctx.addIssue({
        code: 'custom',
        path: ['ANTHROPIC_API_KEY'],
        message:
          'hace falta al menos una clave de inferencia (ANTHROPIC_API_KEY, OPENAI_API_KEY o GEMINI_API_KEY) cuando NODE_ENV=production',
      });
    }
    if (env.DATABASE_URL === env.DATABASE_URL_RUNTIME) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL_RUNTIME'],
        message:
          'debe usar un rol distinto de DATABASE_URL: el runtime no puede tener permisos de DDL (ADR 0001)',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Configuracion invalida:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'EnvValidationError';
  }
}

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      }),
    );
  }

  return result.data;
}
