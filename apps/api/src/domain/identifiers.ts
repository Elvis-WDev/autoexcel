import { randomBytes } from 'node:crypto';
import { AppError } from './errors.js';

/**
 * Identificadores fisicos de PostgreSQL.
 *
 * Regla del ADR 0001: el texto que escribe la persona usuaria nunca llega al
 * SQL. La etiqueta visible y el identificador son cosas distintas, y el
 * identificador siempre lo genera la maquina y se persiste.
 *
 * F5 anadira aqui `toIdentifier(label)` para tablas y columnas. F1 solo necesita
 * el nombre de schema y el validador, que es la pieza que ambos comparten.
 */

/** Limite de PostgreSQL: NAMEDATALEN - 1. */
export const MAX_IDENTIFIER_LENGTH = 63;

/**
 * Un identificador aceptable: minusculas, digitos y guion bajo, empezando por
 * letra o guion bajo. Deliberadamente mas estrecho que lo que PostgreSQL admite,
 * porque asi nunca hace falta citar ni escapar.
 */
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;

export function isSafeIdentifier(value: string): boolean {
  return SAFE_IDENTIFIER.test(value);
}

/**
 * Ultima linea de defensa antes de componer SQL. Lanza en vez de sanear: un
 * identificador que no pasa este filtro significa que algo se corrompio aguas
 * arriba, y arreglarlo en silencio ocultaria el fallo.
 */
export function assertSafeIdentifier(value: string, what = 'identificador'): string {
  if (isSafeIdentifier(value)) return value;

  throw AppError.internal(
    `El ${what} generado no es valido. La operacion se cancelo por seguridad.`,
    new Error(`Identificador rechazado: ${JSON.stringify(value)}`),
  );
}

/**
 * Nombre del schema del plano de datos de un proyecto.
 *
 * No deriva del nombre del proyecto: 128 bits de aleatoriedad en hexadecimal,
 * con prefijo fijo. Longitud constante de 21 caracteres, muy por debajo del
 * limite, y sin posibilidad de colision con nombres reservados.
 */
export function generateSchemaName(): string {
  return assertSafeIdentifier(`proj_${randomBytes(8).toString('hex')}`, 'nombre de schema');
}

/**
 * Slug legible derivado del nombre del proyecto, para URLs.
 *
 * Esto SI deriva del texto del usuario, y por eso nunca se usa en SQL: solo
 * viaja en la URL y se resuelve contra la base de datos como un valor mas.
 */
export function toSlug(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return slug.length > 0 ? slug : 'proyecto';
}

/**
 * Nombres que el sistema se reserva dentro de cada tabla generada.
 *
 * Las columnas de sistema llevan `__` o son nombres fijos. Si una columna del
 * Excel se llamara "id" o "created at", su identificador chocaria con ellas.
 */
export const RESERVED_COLUMN_NAMES: ReadonlySet<string> = new Set([
  'id',
  'created_at',
  'updated_at',
]);

/**
 * Palabras reservadas de PostgreSQL.
 *
 * Como todo se cita con comillas dobles, usarlas no romperia nada. Aun asi se
 * desambiguan: una tabla llamada `"order"` funciona pero convierte en trampa
 * cualquier consulta escrita a mano despues, y este esquema lo van a mirar
 * personas.
 */
const RESERVED_SQL_WORDS: ReadonlySet<string> = new Set([
  'all',
  'analyse',
  'analyze',
  'and',
  'any',
  'array',
  'as',
  'asc',
  'asymmetric',
  'both',
  'case',
  'cast',
  'check',
  'collate',
  'column',
  'constraint',
  'create',
  'current_catalog',
  'current_date',
  'current_role',
  'current_time',
  'current_timestamp',
  'current_user',
  'default',
  'deferrable',
  'desc',
  'distinct',
  'do',
  'else',
  'end',
  'except',
  'false',
  'fetch',
  'for',
  'foreign',
  'from',
  'grant',
  'group',
  'having',
  'in',
  'initially',
  'intersect',
  'into',
  'lateral',
  'leading',
  'limit',
  'localtime',
  'localtimestamp',
  'not',
  'null',
  'offset',
  'on',
  'only',
  'or',
  'order',
  'placing',
  'primary',
  'references',
  'returning',
  'select',
  'session_user',
  'some',
  'symmetric',
  'table',
  'then',
  'to',
  'trailing',
  'true',
  'union',
  'unique',
  'user',
  'using',
  'variadic',
  'when',
  'where',
  'window',
  'with',
]);

export interface IdentifierOptions {
  /** Identificadores ya usados en el mismo ambito. Se actualiza al generar. */
  taken: Set<string>;
  /** Base cuando la etiqueta no deja ningun caracter utilizable. */
  fallback: string;
  /** Nombres adicionales que no se pueden ocupar. */
  reserved?: ReadonlySet<string>;
}

/**
 * Convierte una etiqueta escrita por una persona en un identificador fisico.
 *
 * Es la pieza central del ADR 0001. El texto del usuario entra por aqui y sale
 * convertido en algo que encaja en `^[a-z_][a-z0-9_]{0,62}$`, se persiste, y es
 * lo unico que el constructor de SQL llega a leer. El texto original nunca viaja
 * mas alla de la etiqueta visible.
 *
 * Reduce agresivamente a proposito: todo lo que no sea `[a-z0-9_]` desaparece.
 * Preferir un nombre feo pero seguro a uno bonito que haya que escapar.
 */
export function toIdentifier(label: string, options: IdentifierOptions): string {
  const base = reduceToIdentifier(label) || reduceToIdentifier(options.fallback) || 'campo';

  // Un identificador no puede empezar por digito.
  const prefixed = /^[0-9]/.test(base) ? `c_${base}` : base;
  const truncated = prefixed.slice(0, MAX_IDENTIFIER_LENGTH);

  const unavailable = (candidate: string): boolean =>
    options.taken.has(candidate) ||
    RESERVED_SQL_WORDS.has(candidate) ||
    (options.reserved?.has(candidate) ?? false) ||
    // El prefijo `__` pertenece a las columnas de sistema.
    candidate.startsWith('__');

  let candidate = truncated;
  let suffix = 2;

  while (unavailable(candidate)) {
    const tail = `_${suffix}`;
    candidate = `${truncated.slice(0, MAX_IDENTIFIER_LENGTH - tail.length)}${tail}`;
    suffix += 1;
  }

  options.taken.add(candidate);
  return assertSafeIdentifier(candidate);
}

/**
 * La reduccion en si.
 *
 * `Gestión de Viajes 2026` -> `gestion_de_viajes_2026`
 * `"; DROP TABLE user; --` -> `drop_table_user`
 */
function reduceToIdentifier(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_IDENTIFIER_LENGTH);
}
