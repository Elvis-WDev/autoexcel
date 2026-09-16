import type {
  BlueprintProposer,
  ProposalAttempt,
  RepairRequest,
} from '../../application/ports/blueprint-proposer.js';
import type { Logger } from '../../application/ports/logger.js';
import type { AnalysisInput } from '../../domain/blueprint/analysis-input.js';
import { AppError } from '../../domain/errors.js';
import { renderAnalysisInput, renderRepairRequest, SYSTEM_PROMPT } from './prompt.js';
import { toDomain } from './to-domain.js';
import type { ProveedorDeInferencia } from './providers/tipos.js';

/**
 * El motor de inferencia, sobre una lista ordenada de proveedores.
 *
 * Aqui vive todo lo que es igual para los tres: que instrucciones se mandan,
 * como se compone la peticion de reparacion, como se traduce la respuesta al
 * dominio y que se registra. Un proveedor solo sabe mandar dos textos y
 * devolver un objeto; esta funcion sabe lo que significan.
 *
 * **El encadenado.** Se prueba el primero de la lista y, si falla, se sigue con
 * el siguiente. Es una decision explicita y tiene un coste que conviene no
 * esconder: se gasta dinero en un proveedor que nadie eligio. La alternativa
 * —rendirse al primer fallo— degrada la propuesta a la estructura simple de
 * RE-04 teniendo una clave valida sin usar, que es peor.
 *
 * Si se acaban los proveedores, se lanza. El caso de uso interpreta ese error
 * como la senal para caer al camino determinista, exactamente igual que antes
 * de que existiera la lista.
 */
export function createProposer(
  proveedores: readonly ProveedorDeInferencia[],
  logger: Logger,
): BlueprintProposer {
  if (proveedores.length === 0) {
    throw new Error('createProposer necesita al menos un proveedor');
  }

  async function pedir(
    mensaje: string,
    contexto: Record<string, unknown>,
  ): Promise<ProposalAttempt> {
    let ultimo: unknown;

    for (const proveedor of proveedores) {
      try {
        const { propuesta, consumo } = await proveedor.pedir(SYSTEM_PROMPT, mensaje);

        logger.info('Inferencia completada', {
          ...contexto,
          proveedor: proveedor.nombre,
          modelo: proveedor.modelo,
          ...consumo,
        });

        return { blueprint: toDomain(propuesta), usage: consumo };
      } catch (error) {
        ultimo = error;

        // Cada intento fallido se registra con su proveedor: sin esto, un
        // analisis caro por haber recorrido los tres seria indistinguible de
        // uno barato que acerto a la primera.
        logger.warn('Un proveedor de inferencia fallo', {
          ...contexto,
          proveedor: proveedor.nombre,
          modelo: proveedor.modelo,
          motivo: error instanceof Error ? error.message : 'desconocido',
        });
      }
    }

    throw ultimo instanceof AppError
      ? ultimo
      : AppError.unavailable('El analisis automatico no esta disponible ahora mismo.', ultimo);
  }

  return {
    propose(input: AnalysisInput): Promise<ProposalAttempt> {
      return pedir(renderAnalysisInput(input), {
        sheets: input.sheets.length,
        overlaps: input.overlaps.length,
        attempt: 'propose',
      });
    },

    repair(request: RepairRequest): Promise<ProposalAttempt> {
      const contenido = [
        renderAnalysisInput(request.input),
        '',
        'PROPUESTA ANTERIOR:',
        JSON.stringify(request.previous),
        '',
        renderRepairRequest(request.problems),
      ].join('\n');

      return pedir(contenido, { problems: request.problems.length, attempt: 'repair' });
    },
  };
}
