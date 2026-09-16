import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type {
  BlueprintProposer,
  ProposalAttempt,
  RepairRequest,
} from '../../application/ports/blueprint-proposer.js';
import type { Logger } from '../../application/ports/logger.js';
import type { AnalysisInput } from '../../domain/blueprint/analysis-input.js';
import type { ProposedBlueprint } from '../../domain/blueprint/types.js';
import { AppError } from '../../domain/errors.js';
import {
  proposalSchema,
  renderAnalysisInput,
  renderRepairRequest,
  SYSTEM_PROMPT,
  type RawProposal,
} from './prompt.js';

const MODEL = 'claude-opus-5';
const MAX_TOKENS = 16_000;

export interface ClaudeProposerOptions {
  apiKey: string;
  logger: Logger;
  /**
   * Transporte alternativo. Existe para que los tests puedan comprobar la forma
   * exacta de la peticion sin red y sin gastar dinero.
   */
  fetch?: typeof fetch;
}

/**
 * Motor de inferencia sobre Claude.
 *
 * Es el unico punto del sistema que habla con un modelo, y solo se invoca una
 * vez por analisis (dos si el validador pide reparacion). Todo lo posterior a la
 * confirmacion del usuario es determinista: P-03 y P-04.
 *
 * Tres decisiones que merecen explicacion:
 *
 *   - Se envia el PERFIL, nunca las filas. Ademas de acotar coste y latencia,
 *     significa que los datos de negocio no salen del servidor: viajan
 *     encabezados, estadisticas y como mucho ocho ejemplos por columna.
 *   - Las instrucciones van en un bloque cacheado. Son identicas en cada
 *     peticion, asi que a partir de la segunda se cobran a una fraccion.
 *   - Se usa `messages.parse` con un esquema. Reduce las salidas invalidas, pero
 *     la garantia sigue siendo el validador determinista del dominio: si el
 *     modelo devuelve algo que no encaja, no llega a persistirse.
 */
export function createClaudeProposer(options: ClaudeProposerOptions): BlueprintProposer {
  const client = new Anthropic({
    apiKey: options.apiKey,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });

  async function ask(
    userContent: string,
    context: Record<string, unknown>,
  ): Promise<ProposalAttempt> {
    const response = await client.messages
      .parse({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: 'adaptive' },
        output_config: {
          effort: 'high',
          format: zodOutputFormat(proposalSchema),
        },
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            // Prefijo estable: el perfil del archivo va despues, en el mensaje.
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: userContent }],
      })
      .catch((error: unknown) => {
        throw translate(error);
      });

    if (response.stop_reason === 'refusal') {
      throw AppError.unavailable(
        'No pudimos analizar este archivo automaticamente. Puedes continuar con una estructura simple.',
      );
    }

    const parsed = response.parsed_output;
    if (!parsed) {
      throw AppError.unavailable(
        'El analisis automatico devolvio una respuesta que no pudimos leer.',
      );
    }

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cachedInputTokens: response.usage.cache_read_input_tokens ?? 0,
    };

    options.logger.info('Inferencia completada', { ...context, ...usage });

    return { blueprint: toDomain(parsed), usage };
  }

  return {
    propose(input: AnalysisInput): Promise<ProposalAttempt> {
      return ask(renderAnalysisInput(input), {
        sheets: input.sheets.length,
        overlaps: input.overlaps.length,
        attempt: 'propose',
      });
    },

    repair(request: RepairRequest): Promise<ProposalAttempt> {
      const content = [
        renderAnalysisInput(request.input),
        '',
        'PROPUESTA ANTERIOR:',
        JSON.stringify(request.previous),
        '',
        renderRepairRequest(request.problems),
      ].join('\n');

      return ask(content, { problems: request.problems.length, attempt: 'repair' });
    },
  };
}

/**
 * El esquema usa `null` donde el dominio usa ausencia: un esquema JSON estricto
 * no admite campos opcionales, asi que la traduccion ocurre aqui, en la frontera.
 */
function toDomain(raw: RawProposal): ProposedBlueprint {
  return {
    applicationName: raw.applicationName,
    entities: raw.entities.map((entity) => ({
      name: entity.name,
      label: entity.label,
      origin: entity.origin,
      ...(entity.sourceSheetIndex === null ? {} : { sourceSheetIndex: entity.sourceSheetIndex }),
      displayField: entity.displayField,
      ...(entity.dedupeField === null ? {} : { dedupeField: entity.dedupeField }),
      fields: entity.fields.map((field) => ({
        name: field.name,
        label: field.label,
        type: field.type,
        required: field.required,
        ...(field.options === null ? {} : { options: field.options }),
        ...(field.targetEntity === null ? {} : { targetEntity: field.targetEntity }),
        ...(field.sourceSheetIndex === null || field.sourceColumnIndex === null
          ? {}
          : {
              source: {
                sheetIndex: field.sourceSheetIndex,
                columnIndex: field.sourceColumnIndex,
              },
            }),
      })),
    })),
    relations: raw.relations.map((relation) => ({
      fromEntity: relation.fromEntity,
      toEntity: relation.toEntity,
      fieldName: relation.fieldName,
      type: 'many_to_one' as const,
    })),
  };
}

/**
 * Cualquier fallo del proveedor se traduce a SERVICE_UNAVAILABLE, que es la
 * senal que el caso de uso interpreta para caer al camino determinista de RE-04.
 * El analisis nunca deja el proyecto bloqueado por un problema externo.
 */
function translate(error: unknown): AppError {
  if (error instanceof Anthropic.RateLimitError) {
    return AppError.unavailable('El analisis automatico esta saturado ahora mismo.', error);
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return AppError.unavailable('El analisis automatico no esta configurado correctamente.', error);
  }
  if (error instanceof Anthropic.APIError) {
    return AppError.unavailable('El analisis automatico no esta disponible ahora mismo.', error);
  }
  return AppError.unavailable('El analisis automatico no esta disponible ahora mismo.', error);
}
