import type { Logger } from '../../../application/ports/logger.js';
import type { RawProposal } from '../prompt.js';

/**
 * Lo mas pequeno que tiene que saber hacer un proveedor.
 *
 * Deliberadamente **no** es el puerto del dominio. `BlueprintProposer` habla de
 * proponer y reparar, que son conceptos del problema; esto habla de mandar dos
 * textos y recibir un objeto con la forma del esquema. Un proveedor no sabe que
 * es una propuesta, ni que existe una reparacion, ni como se traduce al
 * dominio: eso lo pone `proposer.ts`, una sola vez, para los tres.
 *
 * Esa es la razon de que anadir un proveedor sea escribir un archivo.
 */
export interface ConsumoDeTokens {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

export interface RespuestaDelProveedor {
  propuesta: RawProposal;
  consumo: ConsumoDeTokens;
}

export interface ProveedorDeInferencia {
  /** Para los registros: que motor produjo esta propuesta. */
  readonly nombre: NombreDeProveedor;
  /** El modelo concreto, que tambien acaba en los registros. */
  readonly modelo: string;
  /**
   * @param instrucciones Prefijo estable. Quien pueda cachearlo, que lo cachee.
   * @param mensaje El perfil del archivo, que cambia en cada peticion.
   */
  pedir(instrucciones: string, mensaje: string): Promise<RespuestaDelProveedor>;
}

export const NOMBRES_DE_PROVEEDOR = ['anthropic', 'openai', 'gemini'] as const;
export type NombreDeProveedor = (typeof NOMBRES_DE_PROVEEDOR)[number];

export interface OpcionesDeProveedor {
  apiKey: string;
  modelo: string;
  logger: Logger;
  /**
   * Transporte alternativo. Existe para que las pruebas puedan comprobar la
   * forma exacta de la peticion sin red y sin gastar dinero.
   */
  fetch?: typeof fetch;
}
