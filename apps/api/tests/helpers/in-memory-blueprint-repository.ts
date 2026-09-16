import { randomUUID } from 'node:crypto';
import type {
  BlueprintRepository,
  SaveBlueprintInput,
  StoredBlueprint,
} from '../../src/application/ports/blueprint-repository.js';
import type { PhysicalPlan } from '../../src/domain/blueprint/physical-plan.js';

export interface InMemoryBlueprintRepository extends BlueprintRepository {
  stored: Map<string, StoredBlueprint>;
}

export function createInMemoryBlueprintRepository(): InMemoryBlueprintRepository {
  const stored = new Map<string, StoredBlueprint>();

  return {
    stored,

    replace(input: SaveBlueprintInput): Promise<void> {
      stored.set(input.projectId, {
        id: randomUUID(),
        applicationName: input.applicationName,
        status: 'draft',
        origin: input.origin,
        notes: input.notes,
        entities: input.blueprint.entities.map((entity) => ({
          id: randomUUID(),
          name: entity.name,
          label: entity.label,
          origin: entity.origin,
          sourceSheetIndex: entity.sourceSheetIndex ?? null,
          displayFieldName: entity.displayField,
          dedupeFieldName: entity.dedupeField ?? null,
          tableName: null,
          fields: entity.fields.map((field) => ({
            id: randomUUID(),
            name: field.name,
            label: field.label,
            type: field.type,
            required: field.required,
            options: field.options ?? null,
            targetEntityName: field.targetEntity ?? null,
            sourceSheetIndex: field.source?.sheetIndex ?? null,
            sourceColumnIndex: field.source?.columnIndex ?? null,
            isInferred: true,
            columnName: null,
          })),
        })),
        relations: input.blueprint.relations.map((relation) => ({
          id: randomUUID(),
          fromEntityName: relation.fromEntity,
          toEntityName: relation.toEntity,
          fieldName: relation.fieldName,
          type: relation.type,
        })),
      });

      return Promise.resolve();
    },

    savePhysicalNames(projectId: string, plan: PhysicalPlan): Promise<void> {
      const blueprint = stored.get(projectId);
      if (!blueprint) return Promise.resolve();

      for (const table of plan.tables) {
        const entity = blueprint.entities.find((item) => item.name === table.entityName);
        if (!entity) continue;

        entity.tableName = table.tableName;
        for (const column of table.columns) {
          const field = entity.fields.find((item) => item.name === column.fieldName);
          if (field) field.columnName = column.columnName;
        }
      }

      return Promise.resolve();
    },

    confirm(projectId: string): Promise<void> {
      const blueprint = stored.get(projectId);
      if (blueprint) blueprint.status = 'confirmed';
      return Promise.resolve();
    },

    findByProject(projectId: string): Promise<StoredBlueprint | null> {
      return Promise.resolve(stored.get(projectId) ?? null);
    },
  };
}
