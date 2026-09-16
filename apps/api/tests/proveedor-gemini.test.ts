import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createProposer } from '../src/infrastructure/inference/proposer.js';
import {
  aEsquemaDeGemini,
  crearProveedorGemini,
  MODELO_GEMINI,
} from '../src/infrastructure/inference/providers/gemini.js';
import { proposalSchema } from '../src/infrastructure/inference/prompt.js';
import { createSilentLogger } from '../src/infrastructure/logging/logger.js';
import { INPUT, VALID_RESPONSE } from './helpers/inference-fixture.js';

/**
 * Gemini es el proveedor distinto de los tres, y esta suite tiene una prueba
 * que las otras dos no necesitan: la del esquema.
 *
 * Anthropic y OpenAI reciben el esquema de Zod tal cual. Gemini quiere JSON
 * Schema y solo admite un subconjunto de sus propiedades, asi que la conversion
 * es codigo propio y puede romperse sola cuando cambie el esquema del dominio.
 *
 * El transporte se sustituye en el `fetch` global porque **este SDK no admite
 * uno propio**, al contrario que los otros dos.
 */
const PROPIEDADES_QUE_GEMINI_ADMITE = new Set([
  '$id',
  '$defs',
  '$ref',
  '$anchor',
  'type',
  'format',
  'title',
  'description',
  'enum',
  'items',
  'prefixItems',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'anyOf',
  'oneOf',
  'properties',
  'additionalProperties',
  'required',
  'propertyOrdering',
]);

/** Recorre el esquema y devuelve lo que Gemini no sabria leer. */
function loQueGeminiRechazaria(esquema: unknown): string[] {
  const problemas: string[] = [];

  (function recorrer(nodo: unknown, ruta: string, esMapaDeNombres: boolean): void {
    if (Array.isArray(nodo)) {
      nodo.forEach((hijo, i) => recorrer(hijo, `${ruta}[${i}]`, false));
      return;
    }
    if (!nodo || typeof nodo !== 'object') return;

    for (const [clave, valor] of Object.entries(nodo as Record<string, unknown>)) {
      // Dentro de `properties` las claves son nombres de campo, no palabras
      // reservadas: ahi cualquier nombre vale.
      if (!esMapaDeNombres && !PROPIEDADES_QUE_GEMINI_ADMITE.has(clave)) {
        problemas.push(`${clave} en ${ruta || 'la raiz'}`);
      }
      if (clave === 'type' && Array.isArray(valor)) {
        problemas.push(`type como lista en ${ruta || 'la raiz'}`);
      }
      recorrer(valor, `${ruta}.${clave}`, clave === 'properties' || clave === '$defs');
    }
  })(esquema, '', false);

  return problemas;
}

function conTransporteFalso(cuerpo: unknown = VALID_RESPONSE): {
  proposer: ReturnType<typeof createProposer>;
  capturadas: { url: string; body: Record<string, unknown> }[];
} {
  const capturadas: { url: string; body: Record<string, unknown> }[] = [];

  vi.stubGlobal('fetch', (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? init.body : '{}';

    capturadas.push({
      url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      body: JSON.parse(body) as Record<string, unknown>,
    });

    const respuesta = {
      candidates: [
        { content: { role: 'model', parts: [{ text: JSON.stringify(cuerpo) }] }, index: 0 },
      ],
      usageMetadata: {
        promptTokenCount: 900,
        candidatesTokenCount: 150,
        cachedContentTokenCount: 0,
        totalTokenCount: 1050,
      },
    };

    return Promise.resolve(
      new Response(JSON.stringify(respuesta), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  const logger = createSilentLogger();
  const proposer = createProposer(
    [crearProveedorGemini({ apiKey: 'clave-de-prueba', modelo: MODELO_GEMINI, logger })],
    logger,
  );

  return { proposer, capturadas };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('el esquema traducido al dialecto de Gemini', () => {
  /**
   * La prueba que motiva que exista `aEsquemaDeGemini`.
   *
   * Sin la conversion, `z.string().nullable()` sale como
   * `{"type": ["string", "null"]}`, que no esta entre lo que Gemini documenta.
   * Solo afecta a dos campos del esquema —los numericos ya salen como `anyOf`
   * por llevar minimo y maximo—, asi que es justo el tipo de detalle que pasa
   * inadvertido hasta que falla en produccion.
   */
  it('no queda nada que Gemini no sepa leer', () => {
    expect(loQueGeminiRechazaria(aEsquemaDeGemini(proposalSchema))).toEqual([]);
  });

  it('sin convertir, el esquema si tendria algo que Gemini no admite', () => {
    // Si esto deja de fallar, la conversion sobra y hay que borrarla.
    expect(loQueGeminiRechazaria(z.toJSONSchema(proposalSchema)).length).toBeGreaterThan(0);
  });

  it('lo nullable se convierte en una union, sin perder la descripcion', () => {
    const esquema = aEsquemaDeGemini(proposalSchema) as never as {
      properties: { entities: { items: { properties: Record<string, Record<string, unknown>> } } };
    };
    const campo = esquema.properties.entities.items.properties['dedupeField']!;

    expect(campo['anyOf']).toEqual([{ type: 'string' }, { type: 'null' }]);
    expect(String(campo['description'])).toContain('derived');
  });

  it('los enum sobreviven, que es lo que impide inventarse un tipo de campo', () => {
    expect(JSON.stringify(aEsquemaDeGemini(proposalSchema))).toContain('"relation"');
  });
});

describe('motor de inferencia sobre Gemini', () => {
  it('llama al modelo configurado', async () => {
    const { proposer, capturadas } = conTransporteFalso();
    await proposer.propose(INPUT);

    expect(capturadas).toHaveLength(1);
    expect(capturadas[0]?.url).toContain(MODELO_GEMINI);
  });

  it('manda las instrucciones como instruccion de sistema y pide JSON', async () => {
    const { proposer, capturadas } = conTransporteFalso();
    await proposer.propose(INPUT);

    const cuerpo = capturadas[0]?.body ?? {};
    const sistema = cuerpo['systemInstruction'] ?? cuerpo['system_instruction'];

    expect(JSON.stringify(sistema)).toContain('modelo de datos');
    expect(JSON.stringify(cuerpo)).toContain('application/json');
    expect(JSON.stringify(cuerpo)).toContain('applicationName');
  });

  it('envia estadisticas, no contenido', async () => {
    const { proposer, capturadas } = conTransporteFalso();
    await proposer.propose(INPUT);

    const enviado = JSON.stringify(capturadas[0]?.body);

    expect(enviado).toContain('Cliente');
    expect(enviado).toContain('distintos');
  });

  it('traduce la respuesta al modelo del dominio', async () => {
    const { proposer } = conTransporteFalso();
    const { blueprint, usage } = await proposer.propose(INPUT);

    expect(blueprint.applicationName).toBe('Gestion de Viajes');
    expect(blueprint.entities[0]?.name).toBe('clientes');
    expect(blueprint.entities[0]?.fields[0]).not.toHaveProperty('targetEntity');
    expect(usage).toEqual({ inputTokens: 900, outputTokens: 150, cachedInputTokens: 0 });
  });

  /**
   * Gemini no trae un `parse` tipado como los otros dos, asi que la validacion
   * la hace el proveedor. Si no la hiciera, un JSON con la forma equivocada
   * llegaria al dominio como si fuera valido.
   */
  it('una respuesta con la forma equivocada se rechaza, no se cuela', async () => {
    const { proposer } = conTransporteFalso({ applicationName: 'x' });

    await expect(proposer.propose(INPUT)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });

  it('incluye los problemas del validador al pedir reparacion', async () => {
    const { proposer, capturadas } = conTransporteFalso();

    await proposer.repair({
      input: INPUT,
      previous: { applicationName: 'x', entities: [], relations: [] },
      problems: ['la entidad "viajes" no declara displayField'],
    });

    expect(JSON.stringify(capturadas[0]?.body)).toContain('no declara displayField');
  });
});
