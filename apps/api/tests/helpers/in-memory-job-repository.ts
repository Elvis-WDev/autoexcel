import { randomUUID } from 'node:crypto';
import type {
  JobFailure,
  JobKind,
  JobRecord,
  JobRepository,
  JobResult,
} from '../../src/application/ports/job-repository.js';

export interface InMemoryJobRepository extends JobRepository {
  jobs: JobRecord[];
  failures: Map<string, JobFailure[]>;
}

export function createInMemoryJobRepository(): InMemoryJobRepository {
  const jobs: JobRecord[] = [];
  const failures = new Map<string, JobFailure[]>();

  const find = (jobId: string): JobRecord | undefined => jobs.find((job) => job.id === jobId);

  return {
    jobs,
    failures,

    create(projectId: string, kind: JobKind, message: string): Promise<JobRecord> {
      const job: JobRecord = {
        id: randomUUID(),
        projectId,
        kind,
        status: 'queued',
        progress: 0,
        total: 0,
        message,
        failureReason: null,
        result: null,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date(),
      };
      jobs.push(job);
      return Promise.resolve(job);
    },

    markRunning(jobId: string, message: string): Promise<void> {
      const job = find(jobId);
      if (job) {
        job.status = 'running';
        job.message = message;
        job.startedAt = new Date();
      }
      return Promise.resolve();
    },

    updateProgress(jobId: string, progress: number, message: string): Promise<void> {
      const job = find(jobId);
      if (job) {
        job.progress = Math.max(0, Math.min(100, Math.round(progress)));
        job.message = message;
      }
      return Promise.resolve();
    },

    markCompleted(jobId: string, message: string, result?: JobResult): Promise<void> {
      const job = find(jobId);
      if (job) {
        job.status = 'completed';
        job.message = message;
        job.progress = 100;
        job.result = result ?? null;
        job.finishedAt = new Date();
      }
      return Promise.resolve();
    },

    markPartial(jobId: string, message: string, result: JobResult): Promise<void> {
      const job = find(jobId);
      if (job) {
        job.status = 'partial';
        job.message = message;
        job.progress = 100;
        job.result = result;
        job.finishedAt = new Date();
      }
      return Promise.resolve();
    },

    recordFailures(jobId: string, rows: JobFailure[]): Promise<void> {
      failures.set(jobId, [...(failures.get(jobId) ?? []), ...rows]);
      return Promise.resolve();
    },

    listFailures(jobId: string): Promise<JobFailure[]> {
      return Promise.resolve(failures.get(jobId) ?? []);
    },

    markFailed(jobId: string, reason: string): Promise<void> {
      const job = find(jobId);
      if (job) {
        job.status = 'failed';
        job.failureReason = reason;
        job.finishedAt = new Date();
      }
      return Promise.resolve();
    },

    findById(projectId: string, jobId: string): Promise<JobRecord | null> {
      const job = find(jobId);
      return Promise.resolve(job && job.projectId === projectId ? job : null);
    },

    findLatest(projectId: string, kind: JobKind): Promise<JobRecord | null> {
      const matching = jobs.filter((job) => job.projectId === projectId && job.kind === kind);
      return Promise.resolve(matching.at(-1) ?? null);
    },

    failOrphaned(): Promise<number> {
      return Promise.resolve(0);
    },
  };
}
