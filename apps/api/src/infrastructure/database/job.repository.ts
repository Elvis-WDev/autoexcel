import type {
  JobFailure,
  JobKind,
  JobRecord,
  JobRepository,
  JobResult,
} from '../../application/ports/job-repository.js';
import type { Prisma } from './generated/client.js';
import type { PrismaClient } from './prisma.js';

/** Fila de Prisma -> registro del dominio. El `result` viaja como JSON. */
function toRecord(row: {
  id: string;
  projectId: string;
  kind: string;
  status: string;
  progress: number;
  total: number;
  message: string | null;
  failureReason: string | null;
  result: unknown;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}): JobRecord {
  return {
    ...row,
    kind: row.kind as JobKind,
    status: row.status as JobRecord['status'],
    result: (row.result ?? null) as JobResult | null,
  };
}

/** Tope de filas fallidas que se guardan con detalle. */
const MAX_STORED_FAILURES = 500;

export function createJobRepository(prisma: PrismaClient): JobRepository {
  return {
    async create(projectId: string, kind: JobKind, message: string): Promise<JobRecord> {
      return toRecord(await prisma.job.create({ data: { projectId, kind, message } }));
    },

    async markRunning(jobId: string, message: string): Promise<void> {
      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'running', message, startedAt: new Date() },
      });
    },

    async updateProgress(jobId: string, progress: number, message: string): Promise<void> {
      await prisma.job.update({
        where: { id: jobId },
        data: { progress: Math.max(0, Math.min(100, Math.round(progress))), message },
      });
    },

    async markCompleted(jobId: string, message: string, result?: JobResult): Promise<void> {
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          message,
          progress: 100,
          finishedAt: new Date(),
          ...(result ? { result: result as unknown as Prisma.InputJsonValue } : {}),
        },
      });
    },

    async markPartial(jobId: string, message: string, result: JobResult): Promise<void> {
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'partial',
          message,
          progress: 100,
          finishedAt: new Date(),
          result: result as unknown as Prisma.InputJsonValue,
        },
      });
    },

    async recordFailures(jobId: string, failures: JobFailure[]): Promise<void> {
      if (failures.length === 0) return;

      await prisma.importRowError.createMany({
        data: failures.slice(0, MAX_STORED_FAILURES).map((failure) => ({
          jobId,
          entityLabel: failure.entityLabel,
          sheetName: failure.sheetName,
          rowNumber: failure.rowNumber,
          reason: failure.reason,
          rawRow: failure.raw as unknown as Prisma.InputJsonValue,
        })),
      });
    },

    async listFailures(jobId: string): Promise<JobFailure[]> {
      const rows = await prisma.importRowError.findMany({
        where: { jobId },
        orderBy: [{ sheetName: 'asc' }, { rowNumber: 'asc' }],
      });

      return rows.map((row) => ({
        entityLabel: row.entityLabel,
        sheetName: row.sheetName,
        rowNumber: row.rowNumber,
        reason: row.reason,
        raw: Array.isArray(row.rawRow) ? (row.rawRow as unknown[]) : [],
      }));
    },

    async markFailed(jobId: string, reason: string): Promise<void> {
      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'failed', failureReason: reason, finishedAt: new Date() },
      });
    },

    async findById(projectId: string, jobId: string): Promise<JobRecord | null> {
      const row = await prisma.job.findFirst({ where: { id: jobId, projectId } });
      return row ? toRecord(row) : null;
    },

    async findLatest(projectId: string, kind: JobKind): Promise<JobRecord | null> {
      const row = await prisma.job.findFirst({
        where: { projectId, kind },
        orderBy: { createdAt: 'desc' },
      });
      return row ? toRecord(row) : null;
    },

    async failOrphaned(reason: string): Promise<number> {
      const { count } = await prisma.job.updateMany({
        where: { status: { in: ['queued', 'running'] } },
        data: { status: 'failed', failureReason: reason, finishedAt: new Date() },
      });
      return count;
    },
  };
}
