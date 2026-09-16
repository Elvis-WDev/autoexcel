import type {
  BlueprintRepository,
  SaveBlueprintInput,
  StoredBlueprint,
  StoredEntity,
  StoredField,
} from '../../application/ports/blueprint-repository.js';
import type { PhysicalPlan } from '../../domain/blueprint/physical-plan.js';
import type { ValidationIssue } from '../../domain/blueprint/validator.js';
import type { Prisma } from './generated/client.js';
import type { PrismaClient } from './prisma.js';

/**
 * Persistencia del blueprint.
 *
 * El modelo del dominio referencia entidades por nombre, porque es lo que el
 * motor de inferencia produce y lo que se puede leer. La base de datos usa
 * claves foraneas reales, para que renombrar una entidad en F4 no rompa las
 * referencias. La traduccion entre ambos mundos vive aqui y solo aqui.
 */
export function createBlueprintRepository(prisma: PrismaClient): BlueprintRepository {
  return {
    /**
     * Borra y vuelve a crear. Analizar de nuevo significa empezar de cero: una
     * reconciliacion parcial dejaria campos huerfanos del analisis anterior,
     * mezclados con los nuevos y sin forma de distinguirlos.
     */
    async replace(input: SaveBlueprintInput): Promise<void> {
      await prisma.$transaction(async (tx) => {
        await tx.blueprint.deleteMany({ where: { projectId: input.projectId } });

        const blueprint = await tx.blueprint.create({
          data: {
            projectId: input.projectId,
            applicationName: input.applicationName,
            origin: input.origin,
            // `InputJsonValue` exige una firma de indice que un tipo concreto
            // no tiene. El valor es JSON valido; solo falta decirselo.
            notes: input.notes as unknown as Prisma.InputJsonValue,
          },
        });

        // Primera pasada: entidades y campos simples. Las relaciones necesitan
        // que todas las entidades existan, asi que van despues.
        const entityIds = new Map<string, string>();

        for (const [position, entity] of input.blueprint.entities.entries()) {
          const created = await tx.bpEntity.create({
            data: {
              blueprintId: blueprint.id,
              name: entity.name,
              label: entity.label,
              origin: entity.origin,
              sourceSheetIndex: entity.sourceSheetIndex ?? null,
              position,
              fields: {
                create: entity.fields.map((field, fieldPosition) => ({
                  name: field.name,
                  label: field.label,
                  type: field.type,
                  required: field.required,
                  position: fieldPosition,
                  options: field.options,
                  sourceSheetIndex: field.source?.sheetIndex ?? null,
                  sourceColumnIndex: field.source?.columnIndex ?? null,
                })),
              },
            },
          });

          entityIds.set(entity.name, created.id);
        }

        // Segunda pasada: destinos de relacion, campo mostrado y clave.
        for (const entity of input.blueprint.entities) {
          const entityId = entityIds.get(entity.name);
          if (!entityId) continue;

          const fields = await tx.bpField.findMany({ where: { entityId } });
          const fieldIds = new Map(fields.map((field) => [field.name, field.id]));

          for (const field of entity.fields) {
            if (field.type !== 'relation' || !field.targetEntity) continue;

            const targetId = entityIds.get(field.targetEntity);
            const fieldId = fieldIds.get(field.name);
            if (!targetId || !fieldId) continue;

            await tx.bpField.update({ where: { id: fieldId }, data: { targetEntityId: targetId } });
          }

          await tx.bpEntity.update({
            where: { id: entityId },
            data: {
              displayFieldId: fieldIds.get(entity.displayField) ?? null,
              dedupeFieldId: entity.dedupeField ? (fieldIds.get(entity.dedupeField) ?? null) : null,
            },
          });
        }

        // Tercera pasada: relaciones.
        for (const relation of input.blueprint.relations) {
          const fromEntityId = entityIds.get(relation.fromEntity);
          const toEntityId = entityIds.get(relation.toEntity);
          if (!fromEntityId || !toEntityId) continue;

          const field = await tx.bpField.findFirst({
            where: { entityId: fromEntityId, name: relation.fieldName },
          });
          if (!field) continue;

          await tx.bpRelation.create({
            data: {
              blueprintId: blueprint.id,
              fromEntityId,
              toEntityId,
              fieldId: field.id,
              type: relation.type,
            },
          });
        }
      });
    },

    async confirm(projectId: string): Promise<void> {
      await prisma.blueprint.update({
        where: { projectId },
        data: { status: 'confirmed' },
      });
    },

    async savePhysicalNames(projectId: string, plan: PhysicalPlan): Promise<void> {
      await prisma.$transaction(async (tx) => {
        const blueprint = await tx.blueprint.findUnique({
          where: { projectId },
          select: { id: true },
        });
        if (!blueprint) return;

        for (const table of plan.tables) {
          const entity = await tx.bpEntity.update({
            where: { blueprintId_name: { blueprintId: blueprint.id, name: table.entityName } },
            data: { tableName: table.tableName },
            select: { id: true },
          });

          for (const column of table.columns) {
            await tx.bpField.update({
              where: { entityId_name: { entityId: entity.id, name: column.fieldName } },
              data: { columnName: column.columnName },
            });
          }
        }
      });
    },

    async findByProject(projectId: string): Promise<StoredBlueprint | null> {
      const blueprint = await prisma.blueprint.findUnique({
        where: { projectId },
        include: {
          entities: {
            orderBy: { position: 'asc' },
            include: {
              fields: { orderBy: { position: 'asc' }, include: { targetEntity: true } },
              displayField: true,
              dedupeField: true,
            },
          },
          relations: {
            include: { fromEntity: true, toEntity: true, field: true },
          },
        },
      });

      if (!blueprint) return null;

      const entities: StoredEntity[] = blueprint.entities.map((entity) => ({
        id: entity.id,
        name: entity.name,
        label: entity.label,
        origin: entity.origin,
        sourceSheetIndex: entity.sourceSheetIndex,
        displayFieldName: entity.displayField?.name ?? null,
        dedupeFieldName: entity.dedupeField?.name ?? null,
        tableName: entity.tableName,
        fields: entity.fields.map((field): StoredField => ({
          id: field.id,
          name: field.name,
          label: field.label,
          type: field.type,
          required: field.required,
          options: Array.isArray(field.options) ? (field.options as string[]) : null,
          targetEntityName: field.targetEntity?.name ?? null,
          sourceSheetIndex: field.sourceSheetIndex,
          sourceColumnIndex: field.sourceColumnIndex,
          isInferred: field.isInferred,
          columnName: field.columnName,
        })),
      }));

      return {
        id: blueprint.id,
        applicationName: blueprint.applicationName,
        status: blueprint.status,
        origin: blueprint.origin,
        notes: Array.isArray(blueprint.notes)
          ? (blueprint.notes as unknown as ValidationIssue[])
          : [],
        entities,
        relations: blueprint.relations.map((relation) => ({
          id: relation.id,
          fromEntityName: relation.fromEntity.name,
          toEntityName: relation.toEntity.name,
          fieldName: relation.field.name,
          type: relation.type,
        })),
      };
    },
  };
}
