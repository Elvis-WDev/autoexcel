import type { Logger } from '../../../application/ports/logger.js';
import { crearProveedorAnthropic } from './anthropic.js';
import { crearProveedorGemini } from './gemini.js';
import { crearProveedorOpenAI } from './openai.js';
import {
  NOMBRES_DE_PROVEEDOR,
  type NombreDeProveedor,
  type ProveedorDeInferencia,
} from './tipos.js';

/**
 * Que proveedores hay y en que orden se prueban.
 *
 * El orden no es cosmetico: es la politica de reintento. Primero el que eligio
 * el operador; despues los demas que tengan clave, para no degradar la propuesta
 * a la estructura simple de RE-04 teniendo una clave valida sin usar.
 *
 * Un proveedor elegido pero sin clave no es un error de arranque. Simplemente no
 * entra en la lista: la alternativa seria negarse a arrancar por una variable
 * mal puesta, cuando el sistema sabe seguir perfectamente sin ella.
 */
export interface ClavesDeInferencia {
  anthropic?: string | undefined;
  openai?: string | undefined;
  gemini?: string | undefined;
}

export interface ModelosDeInferencia {
  anthropic: string;
  openai: string;
  gemini: string;
}

const CONSTRUCTORES = {
  anthropic: crearProveedorAnthropic,
  openai: crearProveedorOpenAI,
  gemini: crearProveedorGemini,
} as const;

export function construirProveedores(opciones: {
  preferido: NombreDeProveedor;
  claves: ClavesDeInferencia;
  modelos: ModelosDeInferencia;
  logger: Logger;
}): ProveedorDeInferencia[] {
  const { preferido, claves, modelos, logger } = opciones;

  // El preferido primero; los demas en el orden declarado, que es estable.
  const orden: NombreDeProveedor[] = [
    preferido,
    ...NOMBRES_DE_PROVEEDOR.filter((nombre) => nombre !== preferido),
  ];

  return orden
    .filter((nombre) => Boolean(claves[nombre]))
    .map((nombre) =>
      CONSTRUCTORES[nombre]({
        apiKey: claves[nombre]!,
        modelo: modelos[nombre],
        logger,
      }),
    );
}
