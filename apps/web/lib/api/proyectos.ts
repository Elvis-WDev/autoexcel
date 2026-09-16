import { request, type ApiResponse } from './client';

/**
 * Los proyectos, tal como los devuelve la API.
 *
 * `schemaName` y `ownerId` no estan, y no por olvido: el presentador del
 * backend los deja fuera a proposito. El nombre del schema es un detalle del
 * motor de base de datos que nadie de fuera debe conocer (ADR 0001).
 */
export interface Proyecto {
  id: string;
  name: string;
  slug: string;
  status: string;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsultaDeProyectos {
  busqueda: string;
  pagina: number;
  tamano: number;
}

export interface MetaDeLista {
  total: number;
  limit: number;
  offset: number;
}

export function listarProyectos(
  { busqueda, pagina, tamano }: ConsultaDeProyectos,
  signal?: AbortSignal,
): Promise<ApiResponse<Proyecto[]>> {
  const parametros = new URLSearchParams({
    limit: String(tamano),
    offset: String((pagina - 1) * tamano),
  });
  if (busqueda) parametros.set('q', busqueda);

  return request<Proyecto[]>(`/api/projects?${parametros.toString()}`, { signal });
}

export function crearProyecto(name: string): Promise<Proyecto> {
  return request<Proyecto>('/api/projects', { method: 'POST', body: { name } }).then((r) => r.data);
}

/**
 * Borrar exige el nombre exacto.
 *
 * No es una formalidad del cliente: el backend lo valida, porque al borrar un
 * proyecto se elimina tambien su schema con todos sus registros dentro.
 */
export function eliminarProyecto(id: string, confirmName: string): Promise<void> {
  return request<void>(`/api/projects/${id}`, {
    method: 'DELETE',
    body: { confirmName },
  }).then(() => undefined);
}

/** Claves de cache, en un solo sitio para que invalidar no falle por un typo. */
export const clavesDeProyectos = {
  todas: ['proyectos'] as const,
  lista: (consulta: ConsultaDeProyectos) => ['proyectos', 'lista', consulta] as const,
};
