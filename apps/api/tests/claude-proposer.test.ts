import { describe, expect, it } from 'vitest';
import type { AnalysisInput } from '../src/domain/blueprint/analysis-input.js';
import { createClaudeProposer } from '../src/infrastructure/inference/claude-proposer.js';
import { createSilentLogger } from '../src/infrastructure/logging/logger.js';

/**
 * Verificacion de la llamada al modelo sin gastar dinero.
 *
 * Se intercepta el `fetch` del SDK: asi se comprueba la forma exacta de la
 * peticion —que es donde se produce la deriva de API— y, mas importante, que lo
 * que sale del proceso es el perfil y no los datos de negocio.
 *
 * Lo que NO cubre: que el modelo responda bien. Eso solo se comprueba con una
 * clave real, y esta anotado como pendiente en el plan.
 */

interface CapturedRequest {
  url: string;
  body: Record<string, unknown>;
}

function proposerWithFakeTransport(responseJson: unknown): {
  proposer: ReturnType<typeof createClaudeProposer>;
  captured: CapturedRequest[];
} {
  const captured: CapturedRequest[] = [];

  const fakeFetch: typeof fetch = (input, init) => {
    const body = typeof init?.body === 'string' ? init.body : '{}';

    captured.push({
      url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      body: JSON.parse(body) as Record<string, unknown>,
    });

    const message = {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5',
      content: [{ type: 'text', text: JSON.stringify(responseJson) }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 1200, output_tokens: 400, cache_read_input_tokens: 900 },
    };

    return Promise.resolve(
      new Response(JSON.stringify(message), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };

  const proposer = createClaudeProposer({
    apiKey: 'sk-ant-de-prueba',
    logger: createSilentLogger(),
    // El SDK admite un transporte propio: no hace falta parchear nada global.
    fetch: fakeFetch,
  });

  return { proposer, captured };
}

const INPUT: AnalysisInput = {
  fileName: 'viajes.xlsx',
  sheets: [
    {
      index: 0,
      name: 'Viajes',
      rowCount: 400,
      columns: [
        {
          index: 0,
          header: 'Cliente',
          normalizedHeader: 'cliente',
          profile: {
            total: 400,
            empty: 0,
            distinct: 3,
            cardinalityRatio: 0.0075,
            samples: ['Comercial Andes', 'Cliente Norte'],
            inferredType: 'text',
            typeConfidence: 1,
            maxLength: 20,
            repeatsEnoughForEntity: true,
            identifying: false,
            identityCandidate: false,
          },
        },
      ],
    },
  ],
  overlaps: [],
};

const VALID_RESPONSE = {
  applicationName: 'Gestion de Viajes',
  entities: [
    {
      name: 'clientes',
      label: 'Clientes',
      origin: 'derived',
      sourceSheetIndex: 0,
      displayField: 'nombre',
      dedupeField: 'nombre',
      fields: [
        {
          name: 'nombre',
          label: 'Cliente',
          type: 'text',
          required: true,
          options: null,
          targetEntity: null,
          sourceSheetIndex: 0,
          sourceColumnIndex: 0,
        },
      ],
    },
  ],
  relations: [],
};

describe('motor de inferencia sobre Claude', () => {
  it('pide el modelo y los parametros esperados', async () => {
    const { proposer, captured } = proposerWithFakeTransport(VALID_RESPONSE);

    await proposer.propose(INPUT);

    expect(captured).toHaveLength(1);
    const body = captured[0]!.body;

    expect(body['model']).toBe('claude-opus-5');
    expect(body['thinking']).toEqual({ type: 'adaptive' });
    expect(body['output_config']).toMatchObject({ effort: 'high' });
    expect(body['output_config']).toHaveProperty('format');
  });

  // Las instrucciones son identicas en cada peticion: cachearlas las cobra a una
  // fraccion a partir de la segunda.
  it('marca las instrucciones como cacheables', async () => {
    const { proposer, captured } = proposerWithFakeTransport(VALID_RESPONSE);

    await proposer.propose(INPUT);

    const system = captured[0]!.body['system'] as { cache_control?: unknown }[];
    expect(system[0]?.cache_control).toEqual({ type: 'ephemeral' });
  });

  // Lo que de verdad importa: los datos de negocio no salen del servidor.
  it('envia estadisticas, no contenido', async () => {
    const { proposer, captured } = proposerWithFakeTransport(VALID_RESPONSE);

    await proposer.propose(INPUT);

    const prompt = (captured[0]!.body['messages'] as { content: string }[])[0]!.content;

    expect(prompt).toContain('distintos=3');
    expect(prompt).toContain('SE_REPITE_MUCHO');
    expect(prompt).toContain('400 filas de datos');
    // Como mucho ocho ejemplos por columna, y nada mas del contenido.
    expect(prompt).toContain('Comercial Andes');
  });

  /**
   * La propiedad que justifica todo el diseno: un archivo de 400.000 filas
   * cuesta lo mismo que uno de 400. Si alguien empezara a mandar filas, este
   * test lo detectaria de inmediato.
   */
  it('produce la misma peticion con 400 filas que con 400.000', async () => {
    const enormous: AnalysisInput = structuredClone(INPUT);
    enormous.sheets[0]!.rowCount = 400_000;
    enormous.sheets[0]!.columns[0]!.profile.total = 400_000;

    const small = proposerWithFakeTransport(VALID_RESPONSE);
    await small.proposer.propose(INPUT);

    const huge = proposerWithFakeTransport(VALID_RESPONSE);
    await huge.proposer.propose(enormous);

    const smallSize = JSON.stringify(small.captured[0]!.body).length;
    const hugeSize = JSON.stringify(huge.captured[0]!.body).length;

    // La unica diferencia son los digitos del recuento de filas.
    expect(Math.abs(hugeSize - smallSize)).toBeLessThan(20);
  });

  it('traduce la respuesta al modelo del dominio', async () => {
    const { proposer } = proposerWithFakeTransport(VALID_RESPONSE);

    const { blueprint, usage } = await proposer.propose(INPUT);

    expect(blueprint.applicationName).toBe('Gestion de Viajes');
    expect(blueprint.entities[0]!.fields[0]!.source).toEqual({ sheetIndex: 0, columnIndex: 0 });
    // Los `null` del esquema se convierten en ausencia, no en `null`.
    expect(blueprint.entities[0]!.fields[0]).not.toHaveProperty('options');
    expect(blueprint.entities[0]!.fields[0]).not.toHaveProperty('targetEntity');
    expect(usage).toEqual({ inputTokens: 1200, outputTokens: 400, cachedInputTokens: 900 });
  });

  it('incluye los problemas del validador al pedir reparacion', async () => {
    const { proposer, captured } = proposerWithFakeTransport(VALID_RESPONSE);

    await proposer.repair({
      input: INPUT,
      previous: { applicationName: 'X', entities: [], relations: [] },
      problems: ['clientes.nombre: usa un tipo que el sistema no soporta'],
    });

    const messages = captured[0]!.body['messages'] as { content: string }[];
    expect(messages[0]!.content).toContain('no paso la validacion');
    expect(messages[0]!.content).toContain('tipo que el sistema no soporta');
  });
});
