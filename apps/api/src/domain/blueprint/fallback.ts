import type { AnalyzedSheetSignal } from './analysis-input.js';
import { normalizeHeader } from '../spreadsheet/normalization.js';
import type { FieldType, ProposedBlueprint, ProposedEntity, ProposedField } from './types.js';

/**
 * Propuesta determinista: una entidad por hoja, todas las columnas como campos.
 *
 * Es RE-04 hecho codigo. "Si el sistema no puede inferir varias entidades con
 * suficiente claridad, debera poder proponer una estructura simple. Esto permite
 * que la demo continue."
 *
 * Se usa cuando la inferencia falla, cuando su salida no pasa el validador dos
 * veces seguidas, o cuando no hay clave de API configurada. Nunca produce
 * relaciones: sin evidencia, RI-04 manda preferir lo simple.
 *
 * No llama a nada externo y no puede fallar. Esa es su razon de ser.
 */
export function buildFallbackBlueprint(
  applicationName: string,
  sheets: readonly AnalyzedSheetSignal[],
): ProposedBlueprint {
  const usable = sheets.filter((sheet) => sheet.columns.length > 0);
  const usedNames = new Set<string>();

  const entities = usable.map((sheet) => {
    const name = uniqueName(normalizeHeader(sheet.name) || `hoja_${sheet.index + 1}`, usedNames);
    return buildEntity(name, sheet);
  });

  return { applicationName, entities, relations: [] };
}

function buildEntity(name: string, sheet: AnalyzedSheetSignal): ProposedEntity {
  const usedFieldNames = new Set<string>();

  const fields: ProposedField[] = sheet.columns.map((column) => ({
    name: uniqueName(column.normalizedHeader || `columna_${column.index + 1}`, usedFieldNames),
    label: column.header,
    type: toFieldType(column.profile.inferredType),
    // Sin inferencia no hay forma de saber que es imprescindible; obligar
    // campos aqui solo conseguiria que la importacion rechazara filas validas.
    required: false,
    source: { sheetIndex: sheet.index, columnIndex: column.index },
  }));

  return {
    name,
    label: sheet.name,
    origin: 'sheet',
    sourceSheetIndex: sheet.index,
    displayField: pickDisplayField(fields),
    fields,
  };
}

/**
 * El tipo aparente del perfilado ya pertenece al vocabulario cerrado, salvo que
 * alli no existen `select` ni `relation`, que son decisiones sobre el modelo y
 * no propiedades de una columna.
 */
function toFieldType(apparent: string): FieldType {
  switch (apparent) {
    case 'integer':
    case 'decimal':
    case 'boolean':
    case 'date':
    case 'datetime':
    case 'email':
    case 'phone':
      return apparent;
    default:
      return 'text';
  }
}

/** El primer campo de texto, o el primero que sirva para reconocer la fila. */
function pickDisplayField(fields: readonly ProposedField[]): string {
  const text = fields.find((field) => field.type === 'text');
  if (text) return text.name;

  const usable = fields.find((field) => field.type !== 'boolean');
  return (usable ?? fields[0])?.name ?? 'campo_1';
}

function uniqueName(base: string, used: Set<string>): string {
  const clean = base.length > 0 ? base : 'campo';
  let candidate = clean;
  let suffix = 2;

  while (used.has(candidate)) {
    candidate = `${clean}_${suffix}`;
    suffix += 1;
  }

  used.add(candidate);
  return candidate;
}
