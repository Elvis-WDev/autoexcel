import type { ProjectStatus } from '../../domain/project-status.js';

export interface ProjectRecord {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  /** Schema del plano de datos. Nunca sale al cliente. */
  schemaName: string;
  status: ProjectStatus;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectInput {
  ownerId: string;
  name: string;
  slug: string;
  schemaName: string;
}

export interface ListPage {
  limit: number;
  offset: number;
  /**
   * Texto libre sobre el nombre del proyecto. `null` para no filtrar.
   *
   * Filtra en la base y no en el cliente a proposito: una busqueda que solo
   * mirara la pagina cargada contradiria el total que muestra el pie.
   */
  search?: string | null;
}

export interface ListResult {
  items: ProjectRecord[];
  total: number;
}

/**
 * Puerto de persistencia del plano de control. La capa de aplicacion depende de
 * esta interfaz, no de Prisma (`docs/architecture/backend.md`).
 */
export interface ProjectRepository {
  create(input: CreateProjectInput): Promise<ProjectRecord>;
  findById(id: string): Promise<ProjectRecord | null>;
  listByOwner(ownerId: string, page: ListPage): Promise<ListResult>;
  /** Cuantos proyectos tiene una persona, para la cuota. */
  countByOwner(ownerId: string): Promise<number>;
  /** Mueve el estado. Quien llama ya valido la transicion en el dominio. */
  updateStatus(
    id: string,
    status: ProjectStatus,
    failureReason?: string | null,
  ): Promise<ProjectRecord>;
  deleteById(id: string): Promise<void>;
  slugTaken(ownerId: string, slug: string): Promise<boolean>;
}
