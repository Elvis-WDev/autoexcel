import { request, type ApiResponse } from './client';

/** Detalle del proyecto. `nextStatuses` es la maquina de estados del backend. */
export interface ProyectoDetalle {
  id: string;
  name: string;
  slug: string;
  status: string;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  nextStatuses: string[];
}

export interface ColumnaDeHoja {
  id?: string;
  index: number;
  header: string;
  rows: number;
  empty: number;
  distinct: number;
  samples: string[];
  type: string;
}

export interface Hoja {
  id?: string;
  name: string;
  index: number;
  rowCount: number;
  headerRowIndex: number | null;
  included: boolean;
  /** Ya viene en lenguaje de negocio; no se traduce aqui. */
  issue: string | null;
  columns: ColumnaDeHoja[];
}

export interface Trabajo {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'partial' | 'failed';
  message: string | null;
  progress: number;
  failureReason: string | null;
  result: Record<string, number> | null;
}

export interface CambioDeHoja {
  sheetId: string;
  included?: boolean;
  headerRowIndex?: number | null;
}

export function obtenerProyecto(id: string, signal?: AbortSignal): Promise<ProyectoDetalle> {
  return request<ProyectoDetalle>(`/api/projects/${id}`, { signal }).then((r) => r.data);
}

export function listarHojas(
  id: string,
  signal?: AbortSignal,
): Promise<ApiResponse<{ fileName: string; sheets: Hoja[] }>> {
  return request<{ fileName: string; sheets: Hoja[] }>(`/api/projects/${id}/sheets`, { signal });
}

export function actualizarHojas(id: string, sheets: CambioDeHoja[]): Promise<Hoja[]> {
  return request<Hoja[]>(`/api/projects/${id}/sheets`, {
    method: 'PATCH',
    body: { sheets },
  }).then((r) => r.data);
}

/** RF-13: a partir de aqui se emite DDL. No hay vuelta atras. */
export function lanzarConstruccion(id: string): Promise<Trabajo> {
  return request<Trabajo>(`/api/projects/${id}/build`, { method: 'POST' }).then((r) => r.data);
}

/** Una fila del Excel que no se pudo importar (RE-06). */
export interface FilaFallida {
  entityLabel: string;
  sheetName: string;
  /** Tal como la ve la persona en Excel, empezando en 1. */
  rowNumber: number;
  reason: string;
  raw: unknown[];
}

export function listarFilasFallidas(
  proyectoId: string,
  trabajoId: string,
  signal?: AbortSignal,
): Promise<ApiResponse<FilaFallida[]>> {
  return request<FilaFallida[]>(`/api/projects/${proyectoId}/jobs/${trabajoId}/errors`, { signal });
}

/**
 * La direccion del informe en CSV.
 *
 * Se enlaza en vez de descargarse con `fetch`: un enlace normal deja que el
 * navegador gestione la descarga, muestre su progreso y la guarde donde la
 * persona tenga configurado. Traerla a memoria para volver a soltarla seria
 * peor en todo.
 */
export function urlDelInformeCsv(proyectoId: string, trabajoId: string): string {
  return `/api/projects/${proyectoId}/jobs/${trabajoId}/errors?format=csv`;
}

export function lanzarAnalisis(id: string): Promise<Trabajo> {
  return request<Trabajo>(`/api/projects/${id}/analyze`, { method: 'POST' }).then((r) => r.data);
}

export function obtenerTrabajo(
  proyectoId: string,
  trabajoId: string,
  signal?: AbortSignal,
): Promise<Trabajo> {
  return request<Trabajo>(`/api/projects/${proyectoId}/jobs/${trabajoId}`, { signal }).then(
    (r) => r.data,
  );
}

/** Mueve el proyecto a otro paso. El backend rechaza lo que no sea legal. */
export function moverAPaso(id: string, to: string): Promise<{ status: string }> {
  return request<{ status: string }>(`/api/projects/${id}/step`, {
    method: 'POST',
    body: { to },
  }).then((r) => r.data);
}

/**
 * Sube el archivo.
 *
 * Con `XMLHttpRequest` y no con `fetch` por una sola razon: `fetch` no informa
 * del progreso de subida, y para un Excel de veinte megas una barra que no se
 * mueve es indistinguible de una aplicacion colgada.
 */
export function subirArchivo(
  id: string,
  archivo: File,
  onProgreso: (porcentaje: number) => void,
): Promise<{ fileName: string; sheets: Hoja[] }> {
  return new Promise((resolver, rechazar) => {
    const datos = new FormData();
    datos.append('file', archivo);

    const peticion = new XMLHttpRequest();
    peticion.open('POST', `/api/projects/${id}/file`);
    peticion.withCredentials = true;
    peticion.setRequestHeader('Accept', 'application/json');

    peticion.upload.addEventListener('progress', (evento) => {
      if (evento.lengthComputable) {
        onProgreso(Math.round((evento.loaded / evento.total) * 100));
      }
    });

    peticion.addEventListener('load', () => {
      let cuerpo: unknown = null;
      try {
        cuerpo = JSON.parse(peticion.responseText);
      } catch {
        cuerpo = null;
      }

      if (peticion.status >= 200 && peticion.status < 300) {
        resolver((cuerpo as { data: { fileName: string; sheets: Hoja[] } }).data);
        return;
      }

      // Se importa aqui dentro para no crear un ciclo entre modulos.
      void import('./errors').then(({ ApiError }) => {
        rechazar(ApiError.fromEnvelope(cuerpo, peticion.status));
      });
    });

    peticion.addEventListener('error', () => rechazar(new TypeError('Failed to fetch')));
    peticion.send(datos);
  });
}

export const clavesDelAsistente = {
  proyecto: (id: string) => ['proyecto', id] as const,
  hojas: (id: string) => ['proyecto', id, 'hojas'] as const,
  trabajo: (proyectoId: string, trabajoId: string) =>
    ['proyecto', proyectoId, 'trabajo', trabajoId] as const,
};
