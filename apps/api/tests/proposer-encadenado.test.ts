import { describe, expect, it } from 'vitest';
import { AppError } from '../src/domain/errors.js';
import { createProposer } from '../src/infrastructure/inference/proposer.js';
import { construirProveedores } from '../src/infrastructure/inference/providers/registro.js';
import type {
  NombreDeProveedor,
  ProveedorDeInferencia,
} from '../src/infrastructure/inference/providers/tipos.js';
import { createSilentLogger } from '../src/infrastructure/logging/logger.js';
import { INPUT, VALID_RESPONSE } from './helpers/inference-fixture.js';

/**
 * El encadenado entre proveedores.
 *
 * Es la parte del cambio que no tiene nada que ver con ningun SDK: dada una
 * lista de motores, se prueba el primero y, si falla, se sigue. Por eso se
 * comprueba con proveedores de mentira y sin red: lo que se afirma es la
 * politica, no la integracion.
 */
function proveedorFalso(
  nombre: NombreDeProveedor,
  comportamiento: 'responde' | 'falla',
  registro: string[],
): ProveedorDeInferencia {
  return {
    nombre,
    modelo: `${nombre}-de-prueba`,
    pedir: () => {
      registro.push(nombre);

      if (comportamiento === 'falla') {
        return Promise.reject(AppError.unavailable(`${nombre} no esta disponible`));
      }

      return Promise.resolve({
        propuesta: VALID_RESPONSE as never,
        consumo: { inputTokens: 10, outputTokens: 20, cachedInputTokens: 0 },
      });
    },
  };
}

describe('el motor encadena proveedores', () => {
  it('usa el primero y no molesta a los demas', async () => {
    const llamados: string[] = [];
    const proposer = createProposer(
      [
        proveedorFalso('anthropic', 'responde', llamados),
        proveedorFalso('openai', 'responde', llamados),
      ],
      createSilentLogger(),
    );

    const resultado = await proposer.propose(INPUT);

    expect(llamados).toEqual(['anthropic']);
    expect(resultado.blueprint.applicationName).toBe('Gestion de Viajes');
  });

  /** Lo que se pidio: mientras haya una clave puesta, se usa antes de degradar. */
  it('pasa al siguiente cuando el primero falla', async () => {
    const llamados: string[] = [];
    const proposer = createProposer(
      [
        proveedorFalso('anthropic', 'falla', llamados),
        proveedorFalso('openai', 'falla', llamados),
        proveedorFalso('gemini', 'responde', llamados),
      ],
      createSilentLogger(),
    );

    const resultado = await proposer.propose(INPUT);

    expect(llamados).toEqual(['anthropic', 'openai', 'gemini']);
    expect(resultado.blueprint.entities).toHaveLength(1);
  });

  /**
   * Si se acaban, se lanza SERVICE_UNAVAILABLE. No es un detalle: es la senal
   * exacta que el caso de uso interpreta para caer al camino determinista de
   * RE-04. Con otro codigo, el analisis dejaria el proyecto bloqueado.
   */
  it('si fallan todos, deja caer al camino determinista', async () => {
    const llamados: string[] = [];
    const proposer = createProposer(
      [proveedorFalso('anthropic', 'falla', llamados), proveedorFalso('gemini', 'falla', llamados)],
      createSilentLogger(),
    );

    await expect(proposer.propose(INPUT)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
    expect(llamados).toEqual(['anthropic', 'gemini']);
  });

  it('reparar recorre la misma cadena', async () => {
    const llamados: string[] = [];
    const proposer = createProposer(
      [
        proveedorFalso('openai', 'falla', llamados),
        proveedorFalso('anthropic', 'responde', llamados),
      ],
      createSilentLogger(),
    );

    await proposer.repair({
      input: INPUT,
      previous: { applicationName: 'x', entities: [], relations: [] },
      problems: ['falta displayField'],
    });

    expect(llamados).toEqual(['openai', 'anthropic']);
  });

  it('no se construye un motor sin proveedores', () => {
    expect(() => createProposer([], createSilentLogger())).toThrow();
  });
});

describe('el registro decide quien entra y en que orden', () => {
  const modelos = { anthropic: 'a', openai: 'o', gemini: 'g' };
  const logger = createSilentLogger();

  it('el elegido va primero y los demas detras', () => {
    const proveedores = construirProveedores({
      preferido: 'gemini',
      claves: { anthropic: 'k1', openai: 'k2', gemini: 'k3' },
      modelos,
      logger,
    });

    expect(proveedores.map((p) => p.nombre)).toEqual(['gemini', 'anthropic', 'openai']);
  });

  it('sin clave no se entra en la lista, aunque sea el elegido', () => {
    const proveedores = construirProveedores({
      preferido: 'openai',
      claves: { anthropic: 'k1' },
      modelos,
      logger,
    });

    // Elegir OpenAI sin clave no rompe el arranque: se usa el que si la tiene.
    expect(proveedores.map((p) => p.nombre)).toEqual(['anthropic']);
  });

  it('sin ninguna clave la lista queda vacia y no hay motor', () => {
    expect(
      construirProveedores({ preferido: 'anthropic', claves: {}, modelos, logger }),
    ).toHaveLength(0);
  });

  it('cada proveedor recuerda su modelo, que es lo que acaba en los registros', () => {
    const [primero] = construirProveedores({
      preferido: 'openai',
      claves: { openai: 'k' },
      modelos: { ...modelos, openai: 'gpt-de-prueba' },
      logger,
    });

    expect(primero?.modelo).toBe('gpt-de-prueba');
  });
});
