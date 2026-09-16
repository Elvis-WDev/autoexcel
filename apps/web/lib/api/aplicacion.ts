import { request, type ApiResponse } from './client';

/**
 * El manifiesto de una aplicacion generada.
 *
 * Es todo lo que el panel sabe de ella. No hay nada escrito a mano: los modulos,
 * los campos y sus tipos los decidio el Excel de otra persona, y llegan aqui en
 * tiempo de ejecucion.
 *
 * Lo que **no** trae es igual de importante: ni `tableName`, ni `columnName`, ni
 * el nombre del schema. El presentador del backend los deja fuera (ADR 0001).
 */
export interface CampoDelManifiesto {
  name: string;
  label: string;
  type: string;
  required: boolean;
  options: string[] | null;
  /** Nombre publico del modulo apuntado, cuando el campo es una relacion. */
  relatedTo: string | null;
}

export interface ModuloDelManifiesto {
  name: string;
  label: string;
  /** Campo que representa al registro en listas y selectores (RF-17). */
  displayField: string;
  fields: CampoDelManifiesto[];
}

export interface Manifiesto {
  applicationName: string;
  navigation: { name: string; label: string }[];
  entities: ModuloDelManifiesto[];
}

export interface Registro {
  id: string;
  values: Record<string, unknown>;
  /**
   * Etiqueta del registro apuntado, por campo de relacion.
   *
   * El identificador sigue en `values` porque el formulario lo necesita para
   * guardar; la tabla muestra esto. Es RF-17 y la *Technical Information
   * Boundary*: nadie tiene que ver un UUID.
   */
  related: Record<string, string | null>;
}

export interface OpcionDeRegistro {
  id: string;
  label: string;
}

const base = (proyectoId: string): string => `/api/projects/${proyectoId}/app`;

export function obtenerManifiesto(proyectoId: string, signal?: AbortSignal): Promise<Manifiesto> {
  return request<Manifiesto>(base(proyectoId), { signal }).then((r) => r.data);
}

export interface ConsultaDeRegistros {
  busqueda: string;
  orden: { campo: string; direccion: 'asc' | 'desc' } | null;
  pagina: number;
  tamano: number;
}

export function listarRegistros(
  proyectoId: string,
  modulo: string,
  consulta: ConsultaDeRegistros,
  signal?: AbortSignal,
): Promise<ApiResponse<Registro[]>> {
  const parametros = new URLSearchParams({
    limit: String(consulta.tamano),
    offset: String((consulta.pagina - 1) * consulta.tamano),
  });
  if (consulta.busqueda) parametros.set('q', consulta.busqueda);
  if (consulta.orden) {
    parametros.set('sort', consulta.orden.campo);
    parametros.set('dir', consulta.orden.direccion);
  }

  return request<Registro[]>(
    `${base(proyectoId)}/${encodeURIComponent(modulo)}/records?${parametros.toString()}`,
    { signal },
  );
}

export function obtenerRegistro(
  proyectoId: string,
  modulo: string,
  registroId: string,
  signal?: AbortSignal,
): Promise<Registro> {
  return request<Registro>(
    `${base(proyectoId)}/${encodeURIComponent(modulo)}/records/${registroId}`,
    { signal },
  ).then((r) => r.data);
}

export function crearRegistro(
  proyectoId: string,
  modulo: string,
  valores: Record<string, unknown>,
): Promise<Registro> {
  return request<Registro>(`${base(proyectoId)}/${encodeURIComponent(modulo)}/records`, {
    method: 'POST',
    body: valores,
  }).then((r) => r.data);
}

export function actualizarRegistro(
  proyectoId: string,
  modulo: string,
  registroId: string,
  valores: Record<string, unknown>,
): Promise<Registro> {
  return request<Registro>(
    `${base(proyectoId)}/${encodeURIComponent(modulo)}/records/${registroId}`,
    { method: 'PATCH', body: valores },
  ).then((r) => r.data);
}

export function eliminarRegistro(
  proyectoId: string,
  modulo: string,
  registroId: string,
): Promise<void> {
  return request<void>(`${base(proyectoId)}/${encodeURIComponent(modulo)}/records/${registroId}`, {
    method: 'DELETE',
  }).then(() => undefined);
}

export function buscarOpciones(
  proyectoId: string,
  modulo: string,
  texto: string,
  signal?: AbortSignal,
): Promise<OpcionDeRegistro[]> {
  const parametros = new URLSearchParams({ limit: '20' });
  if (texto) parametros.set('q', texto);

  return request<OpcionDeRegistro[]>(
    `${base(proyectoId)}/${encodeURIComponent(modulo)}/options?${parametros.toString()}`,
    { signal },
  ).then((r) => r.data);
}

export const clavesDeLaAplicacion = {
  manifiesto: (proyectoId: string) => ['app', proyectoId, 'manifiesto'] as const,
  modulo: (proyectoId: string, modulo: string) => ['app', proyectoId, modulo] as const,
  registros: (proyectoId: string, modulo: string, consulta: ConsultaDeRegistros) =>
    ['app', proyectoId, modulo, 'registros', consulta] as const,
  /**
   * Un registro suelto, pedido por su identificador.
   *
   * Cuelga de `modulo`, asi que la invalidacion que sigue a cualquier mutacion
   * tambien lo alcanza. Quien lo consulte para editar debe pedirlo fresco: la
   * copia que trae la lista puede tener la edad de `staleTime`.
   */
  registro: (proyectoId: string, modulo: string, registroId: string) =>
    ['app', proyectoId, modulo, 'registro', registroId] as const,
  opciones: (proyectoId: string, modulo: string) =>
    ['app', proyectoId, modulo, 'opciones'] as const,
};
