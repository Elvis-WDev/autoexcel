import { AppError } from '../../../domain/errors.js';
import type { JobFailure, JobRepository } from '../../ports/job-repository.js';
import type { ProjectRepository } from '../../ports/project-repository.js';
import { loadOwnedProject } from './ownership.js';

export interface GetJobFailuresQuery {
  projectId: string;
  actorId: string;
  jobId: string;
}

export type GetJobFailures = (query: GetJobFailuresQuery) => Promise<JobFailure[]>;

export function getJobFailuresUseCase(
  projects: ProjectRepository,
  jobs: JobRepository,
): GetJobFailures {
  return async ({ projectId, actorId, jobId }) => {
    await loadOwnedProject(projects, projectId, actorId);

    const job = await jobs.findById(projectId, jobId);
    if (!job) throw AppError.notFound('No encontramos ese proceso.');

    return jobs.listFailures(jobId);
  };
}
