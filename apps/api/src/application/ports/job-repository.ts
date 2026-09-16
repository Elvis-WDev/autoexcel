export type JobKind = 'analysis' | 'build' | 'import';
export type JobStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed';

export interface JobRecord {
  id: string;
  projectId: string;
  kind: JobKind;
  status: JobStatus;
  progress: number;
  total: number;
  message: string | null;
  failureReason: string | null;
  result: JobResult | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

export interface JobFailure {
  entityLabel: string;
  sheetName: string;
  rowNumber: number;
  reason: string;
  raw: unknown[];
}

export interface JobResult {
  modules: number;
  records: number;
  relations: number;
  failedRows: number;
}

export interface JobRepository {
  create(projectId: string, kind: JobKind, message: string): Promise<JobRecord>;
  markRunning(jobId: string, message: string): Promise<void>;
  updateProgress(jobId: string, progress: number, message: string): Promise<void>;
  markCompleted(jobId: string, message: string, result?: JobResult): Promise<void>;
  /** Termino, pero con filas fallidas (RE-06, decision 4 del plan). */
  markPartial(jobId: string, message: string, result: JobResult): Promise<void>;
  /** Guarda el detalle de las filas que no se pudieron importar. */
  recordFailures(jobId: string, failures: JobFailure[]): Promise<void>;
  listFailures(jobId: string): Promise<JobFailure[]>;
  markFailed(jobId: string, reason: string): Promise<void>;
  findById(projectId: string, jobId: string): Promise<JobRecord | null>;
  findLatest(projectId: string, kind: JobKind): Promise<JobRecord | null>;
  /**
   * Marca como fallidos los trabajos que quedaron corriendo al reiniciar.
   *
   * El trabajo se ejecuta dentro del proceso, asi que un reinicio lo mata sin
   * que nadie actualice su fila. Sin esta reconciliacion, la interfaz mostraria
   * "Analizando archivo..." para siempre.
   */
  failOrphaned(reason: string): Promise<number>;
}
