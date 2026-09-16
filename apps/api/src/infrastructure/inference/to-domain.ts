import type { ProposedBlueprint } from '../../domain/blueprint/types.js';
import type { RawProposal } from './prompt.js';

/**
 * El esquema usa `null` donde el dominio usa ausencia: un esquema JSON estricto
 * no admite campos opcionales, asi que la traduccion ocurre aqui, en la frontera.
 */
export function toDomain(raw: RawProposal): ProposedBlueprint {
  return {
    applicationName: raw.applicationName,
    entities: raw.entities.map((entity) => ({
      name: entity.name,
      label: entity.label,
      origin: entity.origin,
      ...(entity.sourceSheetIndex === null ? {} : { sourceSheetIndex: entity.sourceSheetIndex }),
      displayField: entity.displayField,
      ...(entity.dedupeField === null ? {} : { dedupeField: entity.dedupeField }),
      fields: entity.fields.map((field) => ({
        name: field.name,
        label: field.label,
        type: field.type,
        required: field.required,
        ...(field.options === null ? {} : { options: field.options }),
        ...(field.targetEntity === null ? {} : { targetEntity: field.targetEntity }),
        ...(field.sourceSheetIndex === null || field.sourceColumnIndex === null
          ? {}
          : {
              source: {
                sheetIndex: field.sourceSheetIndex,
                columnIndex: field.sourceColumnIndex,
              },
            }),
      })),
    })),
    relations: raw.relations.map((relation) => ({
      fromEntity: relation.fromEntity,
      toEntity: relation.toEntity,
      fieldName: relation.fieldName,
      type: 'many_to_one' as const,
    })),
  };
}
