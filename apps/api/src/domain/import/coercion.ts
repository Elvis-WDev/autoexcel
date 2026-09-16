import type { FieldType } from '../blueprint/types.js';
import { isBlank, toText, type CellValue } from '../spreadsheet/cell.js';
import { normalizeText } from '../spreadsheet/normalization.js';

/**
 * Conversion de una celda del Excel al valor que espera su columna.
 *
 * Es determinista y pura: P-04 exige que la importacion no dependa de la IA, y
 * esto es el nucleo de esa promesa. Tambien es donde se decide que filas entran
 * y cuales se reportan (RE-06), asi que cada rechazo trae una explicacion que
 * una persona pueda accionar sobre su archivo.
 */

export type Coercion =
  { ok: true; value: string | number | boolean | Date | null } | { ok: false; reason: string };

const TRUE_VALUES = new Set(['true', 'si', 'yes', 'verdadero', '1', 'x', 'sí']);
const FALSE_VALUES = new Set(['false', 'no', 'falso', '0', '']);

const INTEGER = /^[+-]?\d+$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;
/** `15/09/2026`, `15-9-26`. Dia primero: es la convencion en espanol. */
const LOCAL_DATE = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/;

export function coerceValue(
  raw: CellValue,
  type: FieldType,
  required: boolean,
  options: readonly string[] | null,
  label: string,
): Coercion {
  if (isBlank(raw)) {
    if (required) {
      return { ok: false, reason: `Falta "${label}", que es obligatorio.` };
    }
    return { ok: true, value: null };
  }

  switch (type) {
    case 'text':
    case 'email':
    case 'phone':
    case 'relation':
      return { ok: true, value: toText(raw) };

    case 'integer':
      return coerceInteger(raw, label);

    case 'decimal':
      return coerceDecimal(raw, label);

    case 'boolean':
      return coerceBoolean(raw, label);

    case 'date':
      return coerceDate(raw, label, true);

    case 'datetime':
      return coerceDate(raw, label, false);

    case 'select':
      return coerceSelect(raw, options, label);
  }
}

function coerceInteger(raw: CellValue, label: string): Coercion {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { ok: false, reason: `"${label}" no es un numero.` };
    // Un decimal en una columna entera se redondea en vez de rechazarse: un
    // `350.0` que Excel guardo como flotante no es un error de la persona.
    return { ok: true, value: Math.round(raw) };
  }

  const text = toText(raw).replace(/\s/g, '');
  if (INTEGER.test(text)) return { ok: true, value: Number.parseInt(text, 10) };

  const asDecimal = parseDecimalText(text);
  if (asDecimal !== null) return { ok: true, value: Math.round(asDecimal) };

  return { ok: false, reason: `"${label}" deberia ser un numero entero, y trae "${short(raw)}".` };
}

function coerceDecimal(raw: CellValue, label: string): Coercion {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { ok: false, reason: `"${label}" no es un numero.` };
    return { ok: true, value: raw };
  }

  const parsed = parseDecimalText(toText(raw).replace(/\s/g, ''));
  if (parsed !== null) return { ok: true, value: parsed };

  return { ok: false, reason: `"${label}" deberia ser un numero, y trae "${short(raw)}".` };
}

/**
 * Acepta la coma decimal y el punto de millares, que es como escribe la mitad
 * del mundo: `1.234,56` y `1,234.56` valen lo mismo.
 */
function parseDecimalText(text: string): number | null {
  if (text.length === 0) return null;

  const cleaned = text.replace(/[^\d,.+-]/g, '');
  if (cleaned.length === 0) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  let normalized: string;
  if (lastComma > lastDot) {
    // La coma es el separador decimal: los puntos son de millares.
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    normalized = cleaned.replace(/,/g, '');
  } else {
    normalized = cleaned;
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function coerceBoolean(raw: CellValue, label: string): Coercion {
  if (typeof raw === 'boolean') return { ok: true, value: raw };
  if (typeof raw === 'number') return { ok: true, value: raw !== 0 };

  const text = normalizeText(toText(raw));
  if (TRUE_VALUES.has(text)) return { ok: true, value: true };
  if (FALSE_VALUES.has(text)) return { ok: true, value: false };

  return { ok: false, reason: `"${label}" deberia ser si o no, y trae "${short(raw)}".` };
}

/**
 * Convierte a fecha.
 *
 * `dateOnly` decide como sale el valor, y no es un detalle: una fecha de negocio
 * —el dia de un viaje— no tiene zona horaria, pero un objeto `Date` de
 * JavaScript si. El driver de PostgreSQL serializa ese objeto en hora LOCAL con
 * su desplazamiento, asi que al guardarlo en una columna `DATE` desde un
 * servidor al oeste de Greenwich, `01/09/2026` se convierte en `2026-08-31`.
 *
 * Se detecto importando contra la base real: un dia menos en todas las fechas.
 * Por eso las fechas sin hora viajan como texto `YYYY-MM-DD`, que PostgreSQL
 * interpreta sin intervencion de ninguna zona horaria. Las fechas CON hora si
 * son un instante, y ahi el objeto `Date` es lo correcto.
 */
function coerceDate(raw: CellValue, label: string, dateOnly: boolean): Coercion {
  const emit = (date: Date): Coercion => ({
    ok: true,
    value: dateOnly ? toDateOnlyText(date) : date,
  });

  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) {
      return { ok: false, reason: `"${label}" no tiene una fecha valida.` };
    }
    return emit(raw);
  }

  const text = toText(raw);

  const iso = ISO_DATE.exec(text);
  if (iso) {
    const parsed = new Date(text.length > 10 ? text : `${text}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) return emit(parsed);
  }

  const local = LOCAL_DATE.exec(text);
  if (local) {
    // Dia primero. Es la convencion en espanol y el ERS usa `01/09/26`; con dos
    // digitos de ano se asume el siglo actual.
    const day = Number(local[1]);
    const month = Number(local[2]);
    const rawYear = Number(local[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const parsed = new Date(Date.UTC(year, month - 1, day));
      // `new Date(2026, 1, 31)` no falla: se desborda a marzo. Hay que
      // comprobar que el dia sobrevivio.
      if (parsed.getUTCDate() === day && parsed.getUTCMonth() === month - 1) {
        return emit(parsed);
      }
    }

    return { ok: false, reason: `"${label}" tiene una fecha que no existe: "${short(raw)}".` };
  }

  return {
    ok: false,
    reason: `"${label}" deberia ser una fecha, y trae "${short(raw)}".`,
  };
}

/**
 * Un valor fuera de la lista se rechaza en vez de guardarse: la restriccion
 * CHECK de la tabla lo rechazaria igual, y es mejor explicarlo aqui que dejar
 * que falle el lote entero.
 */
function coerceSelect(raw: CellValue, options: readonly string[] | null, label: string): Coercion {
  const text = toText(raw);
  if (!options || options.length === 0) return { ok: true, value: text };

  const match = options.find((option) => normalizeText(option) === normalizeText(text));
  if (match) return { ok: true, value: match };

  return {
    ok: false,
    reason: `"${label}" no admite el valor "${short(raw)}". Valores posibles: ${options
      .slice(0, 8)
      .join(', ')}.`,
  };
}

/** `YYYY-MM-DD` a partir de los componentes UTC, sin zona horaria de por medio. */
function toDateOnlyText(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Recorta el valor para que quepa en un mensaje. */
function short(raw: CellValue): string {
  const text = toText(raw);
  return text.length > 40 ? `${text.slice(0, 40)}...` : text;
}
