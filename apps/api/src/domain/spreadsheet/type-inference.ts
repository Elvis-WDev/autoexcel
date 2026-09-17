import { isBlank, toText, type CellValue } from './cell.js';
import { normalizeHeader } from './normalization.js';

/**
 * Tipos aparentes de una columna.
 *
 * Es deliberadamente el mismo vocabulario cerrado de RF-08 menos `relation` y
 * `select`, que no son propiedades de una columna aislada sino decisiones sobre
 * el modelo: `relation` la propone la inferencia de F3 y `select` sale de la
 * cardinalidad, no del contenido de la celda.
 */
export const APPARENT_TYPES = [
  'text',
  'integer',
  'decimal',
  'boolean',
  'date',
  'datetime',
  'email',
  'phone',
] as const;

export type ApparentType = (typeof APPARENT_TYPES)[number];

export interface TypeGuess {
  type: ApparentType;
  /** Fraccion de valores no vacios que encajan, de 0 a 1. */
  confidence: number;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * Telefono: entre 7 y 15 digitos, admitiendo prefijo internacional y los
 * separadores habituales. Deliberadamente estrecho, porque casi cualquier
 * numero largo podria pasar por telefono y convertir importes en telefonos
 * seria peor que dejarlos como texto.
 */
const PHONE = /^\+?[\d][\d\s\-().]{5,18}$/;
const PHONE_DIGITS = /^\+?[\d\s\-().]+$/;

const INTEGER = /^[+-]?\d+$/;
const DECIMAL = /^[+-]?(\d+([.,]\d+)?|[.,]\d+)$/;

/**
 * Un cero a la izquierda: la marca de que eso no es un numero.
 *
 * `0923456789` es una cedula, `007` un codigo de producto, `04` un mes. Ningun
 * sistema decimal escribe un cero delante para decir la misma cantidad, asi que
 * esto no es una heuristica sobre el encabezado —eso es RI-03— sino un hecho
 * sobre el valor: si alguien lo escribio, el cero significa algo.
 *
 * Importa porque guardarlo como entero lo destruye **en silencio**:
 * `0923456789` se convierte en `923456789` y ya no hay forma de recuperarlo.
 *
 * `0` solo, `0.5` y `-0.25` siguen siendo numeros: la regla pide un cero
 * seguido de otro digito.
 */
const CERO_A_LA_IZQUIERDA = /^[+-]?0\d/;

const BOOLEAN_VALUES = new Set([
  'true',
  'false',
  'si',
  'sí',
  'no',
  'yes',
  'verdadero',
  'falso',
  '1',
  '0',
  'x',
]);

/** `2026-09-15`, `15/09/2026`, `15-09-26`. Sin hora. */
const DATE_ONLY = /^(\d{4}-\d{2}-\d{2}|\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{1,2}:\d{2}(:\d{2})?/;

/** Encabezados que sugieren un tipo aunque el contenido sea ambiguo (RI-03). */
const HEADER_HINTS: ReadonlyArray<{ pattern: RegExp; type: ApparentType }> = [
  { pattern: /(^|_)(email|correo|mail|e_mail)($|_)/, type: 'email' },
  { pattern: /(^|_)(telefono|tel|celular|movil|whatsapp|phone|contacto)($|_)/, type: 'phone' },
  { pattern: /(^|_)(fecha|date|dia)($|_)/, type: 'date' },
];

function matchesDate(value: CellValue): 'date' | 'datetime' | null {
  if (value instanceof Date) {
    const hasTime =
      value.getUTCHours() !== 0 || value.getUTCMinutes() !== 0 || value.getUTCSeconds() !== 0;
    return hasTime ? 'datetime' : 'date';
  }

  if (typeof value !== 'string') return null;
  const text = value.trim();

  if (DATE_TIME.test(text)) return 'datetime';
  if (DATE_ONLY.test(text)) return 'date';
  return null;
}

/** Que tipos podria ser una celda concreta. Una celda puede encajar en varios. */
function candidatesFor(value: CellValue): Set<ApparentType> {
  const candidates = new Set<ApparentType>(['text']);

  const dateKind = matchesDate(value);
  if (dateKind) {
    candidates.add(dateKind);
    // Una fecha sin hora tambien es una fecha con hora a medianoche.
    if (dateKind === 'date') candidates.add('datetime');
    return candidates;
  }

  if (typeof value === 'boolean') {
    candidates.add('boolean');
    return candidates;
  }

  if (typeof value === 'number') {
    candidates.add('decimal');
    if (Number.isInteger(value)) candidates.add('integer');
    return candidates;
  }

  const text = toText(value);
  const lowered = text.toLowerCase();

  if (BOOLEAN_VALUES.has(lowered)) candidates.add('boolean');
  if (EMAIL.test(text)) candidates.add('email');
  if (CERO_A_LA_IZQUIERDA.test(text)) {
    // Ni entero ni decimal: se queda como texto, que es lo unico que conserva
    // el cero. Ver CERO_A_LA_IZQUIERDA.
  } else if (INTEGER.test(text)) {
    candidates.add('integer');
    candidates.add('decimal');
  } else if (DECIMAL.test(text)) {
    candidates.add('decimal');
  }
  // Un numero pelado no es un telefono salvo que lo diga el encabezado; solo
  // cuenta como telefono si trae prefijo o separadores.
  if (PHONE.test(text) && PHONE_DIGITS.test(text) && /[+\s\-().]/.test(text)) {
    candidates.add('phone');
  }

  return candidates;
}

/**
 * Orden de preferencia cuando varios tipos encajan igual de bien: del mas
 * especifico al mas general. `text` siempre encaja, asi que va ultimo y actua
 * como red de seguridad.
 */
const PRIORITY: readonly ApparentType[] = [
  'boolean',
  'integer',
  'decimal',
  'date',
  'datetime',
  'email',
  'phone',
  'text',
];

/** Un tipo gana si encaja con al menos esta fraccion de los valores no vacios. */
const ACCEPTANCE = 0.9;

/**
 * Deduce el tipo aparente de una columna a partir de sus valores.
 *
 * Es determinista y no usa IA: RF-04 alimenta a la inferencia de F3, no la
 * sustituye.
 */
export function inferColumnType(values: readonly CellValue[], header = ''): TypeGuess {
  const present = values.filter((value) => !isBlank(value));

  if (present.length === 0) return { type: 'text', confidence: 0 };

  const counts = new Map<ApparentType, number>();
  for (const value of present) {
    for (const candidate of candidatesFor(value)) {
      counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
    }
  }

  const normalizedHeader = normalizeHeader(header);
  const hinted = HEADER_HINTS.find(({ pattern }) => pattern.test(normalizedHeader))?.type;

  // Una pista del encabezado solo desempata: nunca impone un tipo que los datos
  // contradicen. Un encabezado `Telefono` con importes dentro sigue siendo texto.
  if (hinted) {
    const ratio = (counts.get(hinted) ?? 0) / present.length;
    if (ratio >= ACCEPTANCE) return { type: hinted, confidence: ratio };
  }

  for (const type of PRIORITY) {
    const ratio = (counts.get(type) ?? 0) / present.length;
    if (ratio >= ACCEPTANCE) return { type, confidence: ratio };
  }

  return { type: 'text', confidence: 1 };
}
