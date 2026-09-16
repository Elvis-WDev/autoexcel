import { AppError } from '../../../domain/errors.js';
import type { JobRecord, JobRepository } from '../../ports/job-repository.js';
import type { ProjectRepository } from '../../ports/project-repository.js';
import { loadOwnedProject } from './ownership.js';

export interface GetJobQuery {
  projectId: string;
  actorId: string;
  jobId: string;
}

export type GetJob = (query: GetJobQuery) => Promise<JobRecord>;

export function getJobUseCase(projects: ProjectRepository, jobs: JobRepository): GetJob {
  return async ({ projectId, actorId, jobId }) => {
    await loadOwnedProject(projects, projectId, actorId);

    const job = await jobs.findById(projectId, jobId);
    if (!job) throw AppError.notFound('No encontramos ese proceso.');

    return job;
  };
}
