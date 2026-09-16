import { describe, expect, it } from 'vitest';
import { createProposer } from '../src/infrastructure/inference/proposer.js';
import {
  crearProveedorOpenAI,
  MODELO_OPENAI,
} from '../src/infrastructure/inference/providers/openai.js';
import { createSilentLogger } from '../src/infrastructure/logging/logger.js';
import { INPUT, VALID_RESPONSE } from './helpers/inference-fixture.js';

/**
 * La llamada a OpenAI, sin red y sin gastar dinero.
 *
 * Se afirma lo mismo que en la de Anthropic, porque lo que hay que demostrar es
 * lo mismo: que la peticion tiene la forma que el proveedor espera —ahi es donde
 * se produce la deriva de API— y que **sale el perfil, no los datos de negocio**.
 */
interface Capturada {
  url: string;
  body: Record<string, unknown>;
}

function conTransporteFalso(): {
  proposer: ReturnType<typeof createProposer>;
  capturadas: Capturada[];
} {
  const capturadas: Capturada[] = [];

  const fakeFetch: typeof fetch = (input, init) => {
    const body = typeof init?.body === 'string' ? init.body : '{}';

    capturadas.push({
      url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      body: JSON.parse(body) as Record<string, unknown>,
    });

    const respuesta = {
      id: 'resp_test',
      object: 'response',
      created_at: 0,
      model: MODELO_OPENAI,
      status: 'completed',
      output: [
        {
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: JSON.stringify(VALID_RESPONSE), annotations: [] }],
        },
      ],
      usage: {
        input_tokens: 1000,
        output_tokens: 200,
        total_tokens: 1200,
        input_tokens_details: { cached_tokens: 300 },
        output_tokens_details: { reasoning_tokens: 0 },
      },
    };

    return Promise.resolve(
      new Response(JSON.stringify(respuesta), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };

  const logger = createSilentLogger();
  const proposer = createProposer(
    [
      crearProveedorOpenAI({
        apiKey: 'sk-de-prueba',
        modelo: MODELO_OPENAI,
        logger,
        fetch: fakeFetch,
      }),
    ],
    logger,
  );

  return { proposer, capturadas };
}

describe('motor de inferencia sobre OpenAI', () => {
  it('llama a la API de respuestas con el modelo configurado', async () => {
    const { proposer, capturadas } = conTransporteFalso();
    await proposer.propose(INPUT);

    expect(capturadas).toHaveLength(1);
    expect(capturadas[0]?.url).toContain('/responses');
    expect(capturadas[0]?.body['model']).toBe(MODELO_OPENAI);
  });

  /** Las instrucciones van en su sitio, no coladas como un mensaje mas. */
  it('manda las instrucciones como instrucciones', async () => {
    const { proposer, capturadas } = conTransporteFalso();
    await proposer.propose(INPUT);

    expect(String(capturadas[0]?.body['instructions'])).toContain('modelo de datos');
  });

  it('pide la salida contra el esquema, en modo estricto', async () => {
    const { proposer, capturadas } = conTransporteFalso();
    await proposer.propose(INPUT);

    const formato = (capturadas[0]?.body['text'] as { format?: Record<string, unknown> })?.format;

    expect(formato?.['type']).toBe('json_schema');
    expect(formato?.['strict']).toBe(true);
    expect(JSON.stringify(formato?.['schema'])).toContain('applicationName');
  });

  /** Lo que de verdad importa: los datos de negocio no salen del servidor. */
  it('envia estadisticas, no contenido', async () => {
    const { proposer, capturadas } = conTransporteFalso();
    await proposer.propose(INPUT);

    const enviado = JSON.stringify(capturadas[0]?.body);

    expect(enviado).toContain('Cliente');
    expect(enviado).toContain('distintos');
    // Como mucho viajan las muestras declaradas en el perfil, nunca las filas.
    expect(enviado).not.toContain('rowCount');
  });

  it('traduce la respuesta al modelo del dominio', async () => {
    const { proposer } = conTransporteFalso();
    const { blueprint, usage } = await proposer.propose(INPUT);

    expect(blueprint.applicationName).toBe('Gestion de Viajes');
    expect(blueprint.entities[0]?.name).toBe('clientes');
    // `null` en el esquema es ausencia en el dominio.
    expect(blueprint.entities[0]?.fields[0]).not.toHaveProperty('options');
    expect(usage).toEqual({ inputTokens: 1000, outputTokens: 200, cachedInputTokens: 300 });
  });

  it('incluye los problemas del validador al pedir reparacion', async () => {
    const { proposer, capturadas } = conTransporteFalso();

    await proposer.repair({
      input: INPUT,
      previous: { applicationName: 'x', entities: [], relations: [] },
      problems: ['la entidad "viajes" no declara displayField'],
    });

    expect(String(capturadas[0]?.body['input'])).toContain('no declara displayField');
  });
});
