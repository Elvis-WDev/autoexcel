import type {
  CreateProjectInput,
  ListPage,
  ListResult,
  ProjectRecord,
  ProjectRepository,
} from '../../application/ports/project-repository.js';
import { AppError } from '../../domain/errors.js';
import { isProjectStatus, type ProjectStatus } from '../../domain/project-status.js';
import type { PrismaClient } from './prisma.js';

/** Fila tal como la devuelve Prisma. */
interface ProjectRow {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  schemaName: string;
  status: string;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * El enum de Prisma y el del dominio se generan por separado. Si alguien anade
 * un estado a `schema.prisma` y olvida `domain/project-status.ts`, esto lo
 * detecta en la frontera en vez de propagar un estado desconocido.
 */
function toProjectStatus(value: string): ProjectStatus {
  if (!isProjectStatus(value)) {
    throw AppError.internal(
      'El proyecto quedo en un estado que no reconocemos.',
      new Error(`Estado desconocido en base de datos: ${value}`),
    );
  }
  return value;
}

function toRecord(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    slug: row.slug,
    schemaName: row.schemaName,
    status: toProjectStatus(row.status),
    failureReason: row.failureReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createProjectRepository(prisma: PrismaClient): ProjectRepository {
  return {
    async create(input: CreateProjectInput): Promise<ProjectRecord> {
      return toRecord(await prisma.project.create({ data: input }));
    },

    async findById(id: string): Promise<ProjectRecord | null> {
      const row = await prisma.project.findUnique({ where: { id } });
      return row ? toRecord(row) : null;
    },

    async listByOwner(ownerId: string, page: ListPage): Promise<ListResult> {
      const texto = page.search?.trim();
      // El mismo `where` para las filas y para el recuento: si difirieran, el
      // pie diria un total que no corresponde a lo que se ve.
      const where = {
        ownerId,
        ...(texto ? { name: { contains: texto, mode: 'insensitive' as const } } : {}),
      };

      const [rows, total] = await Promise.all([
        prisma.project.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: page.limit,
          skip: page.offset,
        }),
        prisma.project.count({ where }),
      ]);

      return { items: rows.map(toRecord), total };
    },

    async countByOwner(ownerId: string): Promise<number> {
      return prisma.project.count({ where: { ownerId } });
    },

    async updateStatus(
      id: string,
      status: ProjectStatus,
      failureReason: string | null = null,
    ): Promise<ProjectRecord> {
      return toRecord(
        await prisma.project.update({ where: { id }, data: { status, failureReason } }),
      );
    },

    async deleteById(id: string): Promise<void> {
      await prisma.project.delete({ where: { id } });
    },

    async slugTaken(ownerId: string, slug: string): Promise<boolean> {
      const existing = await prisma.project.findUnique({
        where: { ownerId_slug: { ownerId, slug } },
        select: { id: true },
      });
      return existing !== null;
    },
  };
}
