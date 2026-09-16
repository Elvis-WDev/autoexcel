import { request, type ApiResponse } from './client';

/**
 * El modelo propuesto, tal como lo presenta el backend.
 *
 * Ni `tableName` ni `columnName`: el presentador los deja fuera a proposito,
 * porque son nombres fisicos y no salen nunca del servidor (ADR 0001).
 */
export interface CampoDelModelo {
  name: string;
  label: string;
  type: string;
  required: boolean;
  options: string[] | null;
  /** Etiqueta del modulo apuntado cuando el campo es una relacion. */
  relatedTo: string | null;
}

export interface EntidadDelModelo {
  name: string;
  label: string;
  /** `true` si salio de los valores repetidos de una columna (RI-02). */
  derived: boolean;
  displayField: string | null;
  dedupeField: string | null;
  fields: CampoDelModelo[];
}

export interface RelacionDelModelo {
  /** La frase en lenguaje natural la escribe el backend; no se recompone aqui. */
  description: string;
  from: string;
  to: string;
  fromName: string;
  through: string;
}

export interface Modelo {
  applicationName: string;
  status: 'draft' | 'confirmed';
  wasInferred: boolean;
  notes: string[];
  entities: EntidadDelModelo[];
  relations: RelacionDelModelo[];
}

/** Toda edicion devuelve el modelo **entero**, no el trozo tocado. */
export type RespuestaDeEdicion = ApiResponse<Modelo>;

const base = (proyectoId: string): string => `/api/projects/${proyectoId}/blueprint`;

export function obtenerModelo(proyectoId: string, signal?: AbortSignal): Promise<Modelo> {
  return request<Modelo>(base(proyectoId), { signal }).then((r) => r.data);
}

export function renombrarAplicacion(
  proyectoId: string,
  applicationName: string,
): Promise<RespuestaDeEdicion> {
  return request<Modelo>(base(proyectoId), { method: 'PATCH', body: { applicationName } });
}

export interface CambioDeEntidad {
  label?: string;
  displayField?: string;
  /** `null` quita la deduplicacion: cada fila del Excel sera un registro. */
  dedupeField?: string | null;
}

export function editarEntidad(
  proyectoId: string,
  entidad: string,
  cambio: CambioDeEntidad,
): Promise<RespuestaDeEdicion> {
  return request<Modelo>(`${base(proyectoId)}/entities/${encodeURIComponent(entidad)}`, {
    method: 'PATCH',
    body: cambio,
  });
}

export function eliminarEntidad(proyectoId: string, entidad: string): Promise<RespuestaDeEdicion> {
  return request<Modelo>(`${base(proyectoId)}/entities/${encodeURIComponent(entidad)}`, {
    method: 'DELETE',
  });
}

export interface CampoNuevo {
  label: string;
  type: string;
  required: boolean;
  options?: string[];
}

export function anadirCampo(
  proyectoId: string,
  entidad: string,
  campo: CampoNuevo,
): Promise<RespuestaDeEdicion> {
  return request<Modelo>(`${base(proyectoId)}/entities/${encodeURIComponent(entidad)}/fields`, {
    method: 'POST',
    body: campo,
  });
}

export function editarCampo(
  proyectoId: string,
  entidad: string,
  campo: string,
  cambio: Partial<CampoNuevo>,
): Promise<RespuestaDeEdicion> {
  return request<Modelo>(
    `${base(proyectoId)}/entities/${encodeURIComponent(entidad)}/fields/${encodeURIComponent(campo)}`,
    { method: 'PATCH', body: cambio },
  );
}

export function eliminarCampo(
  proyectoId: string,
  entidad: string,
  campo: string,
): Promise<RespuestaDeEdicion> {
  return request<Modelo>(
    `${base(proyectoId)}/entities/${encodeURIComponent(entidad)}/fields/${encodeURIComponent(campo)}`,
    { method: 'DELETE' },
  );
}

/**
 * Aceptar o rechazar una relacion.
 *
 * Se direcciona por la entidad que la lleva y el campo que la sostiene, que es
 * como se lee en pantalla: "cada viaje pertenece a un cliente" es
 * `viajes` + `cliente`.
 */
export function decidirRelacion(
  proyectoId: string,
  entidad: string,
  campo: string,
  accepted: boolean,
): Promise<RespuestaDeEdicion> {
  return request<Modelo>(
    `${base(proyectoId)}/relations/${encodeURIComponent(entidad)}/${encodeURIComponent(campo)}`,
    { method: 'PATCH', body: { accepted } },
  );
}

export const clavesDelModelo = {
  modelo: (proyectoId: string) => ['proyecto', proyectoId, 'blueprint'] as const,
};

// ---------------------------------------------------------------------------
// Resumen previo a crear (RF-12) y construccion
// ---------------------------------------------------------------------------

/**
 * Lo que se lee justo antes de que exista algo.
 *
 * Deliberadamente recortado por el backend: ni tipos, ni claves, ni nombres
 * internos. En el ultimo paso se lee lo que va a existir, no se audita un
 * esquema.
 */
export interface Resumen {
  applicationName: string;
  totals: { entities: number; fields: number; relations: number };
  entities: { label: string; fields: string[] }[];
  relations: string[];
  confirmed: boolean;
}

export function obtenerResumen(proyectoId: string, signal?: AbortSignal): Promise<Resumen> {
  return request<Resumen>(`${base(proyectoId)}/summary`, { signal }).then((r) => r.data);
}

export function confirmarModelo(proyectoId: string): Promise<Resumen> {
  return request<Resumen>(`${base(proyectoId)}/confirm`, { method: 'POST' }).then((r) => r.data);
}
