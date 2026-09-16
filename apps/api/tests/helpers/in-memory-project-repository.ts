import { randomUUID } from 'node:crypto';
import type { ProjectStatus } from '../../src/domain/project-status.js';
import type {
  CreateProjectInput,
  ListPage,
  ListResult,
  ProjectRecord,
  ProjectRepository,
} from '../../src/application/ports/project-repository.js';

export interface InMemoryProjectRepository extends ProjectRepository {
  rows: ProjectRecord[];
  seed(partial: Partial<ProjectRecord> & { ownerId: string }): ProjectRecord;
}

/**
 * Repositorio en memoria con el mismo contrato que el de Prisma.
 *
 * Permite probar rutas y casos de uso sin base de datos. El comportamiento que
 * importa replicar es el orden de listado (mas reciente primero) y la unicidad
 * de slug por propietario.
 */
export function createInMemoryProjectRepository(): InMemoryProjectRepository {
  const rows: ProjectRecord[] = [];

  return {
    rows,

    seed(partial) {
      const now = new Date();
      const record: ProjectRecord = {
        id: partial.id ?? randomUUID(),
        ownerId: partial.ownerId,
        name: partial.name ?? 'Proyecto de prueba',
        slug: partial.slug ?? 'proyecto-de-prueba',
        schemaName: partial.schemaName ?? `proj_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
        status: partial.status ?? 'draft',
        failureReason: partial.failureReason ?? null,
        createdAt: partial.createdAt ?? now,
        updatedAt: partial.updatedAt ?? now,
      };
      rows.push(record);
      return record;
    },

    create(input: CreateProjectInput): Promise<ProjectRecord> {
      const now = new Date();
      const record: ProjectRecord = {
        id: randomUUID(),
        ownerId: input.ownerId,
        name: input.name,
        slug: input.slug,
        schemaName: input.schemaName,
        status: 'draft',
        failureReason: null,
        createdAt: now,
        updatedAt: now,
      };
      rows.push(record);
      return Promise.resolve(record);
    },

    findById(id: string): Promise<ProjectRecord | null> {
      return Promise.resolve(rows.find((row) => row.id === id) ?? null);
    },

    listByOwner(ownerId: string, page: ListPage): Promise<ListResult> {
      // `mode: 'insensitive'` de Prisma, reproducido: sin esto el doble diria
      // que la busqueda distingue mayusculas y la base diria que no.
      const texto = page.search?.trim().toLowerCase();

      const owned = rows
        .filter((row) => row.ownerId === ownerId)
        .filter((row) => (texto ? row.name.toLowerCase().includes(texto) : true))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return Promise.resolve({
        items: owned.slice(page.offset, page.offset + page.limit),
        total: owned.length,
      });
    },

    countByOwner(ownerId: string): Promise<number> {
      return Promise.resolve(rows.filter((row) => row.ownerId === ownerId).length);
    },

    updateStatus(
      id: string,
      status: ProjectStatus,
      failureReason: string | null = null,
    ): Promise<ProjectRecord> {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row) return Promise.reject(new Error(`Proyecto inexistente: ${id}`));

      row.status = status;
      row.failureReason = failureReason;
      row.updatedAt = new Date();
      return Promise.resolve(row);
    },

    deleteById(id: string): Promise<void> {
      const index = rows.findIndex((row) => row.id === id);
      if (index >= 0) rows.splice(index, 1);
      return Promise.resolve();
    },

    slugTaken(ownerId: string, slug: string): Promise<boolean> {
      return Promise.resolve(rows.some((row) => row.ownerId === ownerId && row.slug === slug));
    },
  };
}
