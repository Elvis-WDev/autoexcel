/** Orden pedido al servidor. `null` cuando manda el orden por defecto. */
export interface OrdenDeTabla {
  campo: string;
  direccion: 'asc' | 'desc';
}

/**
 * Todo lo que la tabla necesita saber del servidor.
 *
 * Se agrupa en un objeto y no en diez props sueltas porque siempre viajan
 * juntas: quien usa la tabla las saca de la URL y se las pasa enteras.
 */
export interface ControlesDeTabla {
  busqueda: string;
  orden: OrdenDeTabla | null;
  pagina: number;
  tamano: number;
}

export const TAMANOS_DE_PAGINA = [10, 25, 50, 100] as const;
