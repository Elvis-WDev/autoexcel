import { describe, expect, it } from 'vitest';
import { HITOS, hitoActual, pasoAnterior, rutaDelEstado } from '@/lib/proyectos/pasos';

const TODOS = [
  'draft',
  'uploaded',
  'sheet_selected',
  'analyzing',
  'reviewing_entities',
  'reviewing_fields',
  'reviewing_relations',
  'reviewing_summary',
  'creating',
  'importing',
  'completed',
  'failed',
];

describe('el despachador de pasos', () => {
  it('cada uno de los doce estados tiene destino', () => {
    for (const estado of TODOS) {
      expect(rutaDelEstado('p1', estado)).toMatch(/^\/proyectos\/p1\//);
    }
  });

  /** ERS 20: no se puede entrar a un paso que no corresponde. */
  it('un proyecto sin archivo va a subirlo', () => {
    expect(rutaDelEstado('p1', 'draft')).toBe('/proyectos/p1/archivo');
  });

  /** RNF-05: tras un fallo el archivo sigue ahi, no hay que volver a subirlo. */
  it('un proyecto fallido vuelve a las hojas, no al archivo', () => {
    expect(rutaDelEstado('p1', 'failed')).toBe('/proyectos/p1/hojas');
  });

  /**
   * Un proyecto terminado se usa, no se continua. Antes pulsar la fila llevaba
   * a la ultima pantalla del asistente y la flecha de la misma fila a la
   * aplicacion: dos destinos para el mismo gesto.
   */
  it('un proyecto terminado lleva a su aplicacion, no al final del asistente', () => {
    expect(rutaDelEstado('p1', 'completed')).toBe('/proyectos/p1/app');
  });

  it('un estado desconocido no deja a nadie en ningun sitio', () => {
    expect(rutaDelEstado('p1', 'inventado')).toBe('/proyectos/p1/archivo');
  });
  /**
   * Cada estado va a **su** pantalla, no a una aproximada.
   *
   * Durante W5 este mapa tenia una lista de pasos "todavia sin construir" que
   * desviaba a la ultima pantalla existente. Al completarse el flujo se quito,
   * y estas afirmaciones impiden que reaparezca por accidente.
   */
  it.each([
    ['draft', 'archivo'],
    ['uploaded', 'hojas'],
    ['sheet_selected', 'hojas'],
    ['analyzing', 'analisis'],
    ['reviewing_entities', 'modelo/entidades'],
    ['reviewing_fields', 'modelo/campos'],
    ['reviewing_relations', 'modelo/relaciones'],
    ['reviewing_summary', 'resumen'],
    ['creating', 'creando'],
    ['importing', 'creando'],
    ['completed', 'app'],
    ['failed', 'hojas'],
  ])('%s lleva a /%s', (estado, ruta) => {
    expect(rutaDelEstado('p1', estado)).toBe(`/proyectos/p1/${ruta}`);
  });
});

describe('los hitos del indicador', () => {
  it('son seis y no doce: dos estados de revision son el mismo hito', () => {
    expect(HITOS).toHaveLength(6);
    expect(hitoActual('reviewing_fields')).toBe(hitoActual('reviewing_relations'));
  });

  it('avanzan en el orden del proceso', () => {
    expect(hitoActual('draft')).toBe(0);
    expect(hitoActual('analyzing')).toBeGreaterThan(hitoActual('uploaded'));
    expect(hitoActual('completed')).toBe(HITOS.length - 1);
  });

  it('cada estado del backend cae en algun hito', () => {
    // `hitoActual` devuelve 0 cuando no encuentra nada; se comprueba de verdad.
    const cubiertos = new Set(HITOS.flatMap((hito) => hito.estados));
    for (const estado of TODOS) {
      expect(cubiertos.has(estado)).toBe(true);
    }
  });
});

describe('el boton de Atras', () => {
  /**
   * No se inventa transiciones: solo ofrece las que el backend declara legales
   * en `nextStatuses`. Duplicar la maquina de estados aqui garantizaria que las
   * dos copias se separasen.
   */
  it('ofrece el paso anterior mas cercano de los permitidos', () => {
    expect(pasoAnterior('reviewing_relations', ['reviewing_fields', 'reviewing_summary'])).toBe(
      'reviewing_fields',
    );
  });

  it('no ofrece nada cuando el backend no permite retroceder', () => {
    // A partir de `creating` ya se emitio DDL: no hay vuelta.
    expect(pasoAnterior('creating', ['importing', 'failed'])).toBeNull();
    expect(pasoAnterior('completed', [])).toBeNull();
  });

  it('no ofrece nada en el primer paso', () => {
    expect(pasoAnterior('draft', ['uploaded', 'failed'])).toBeNull();
  });

  it('ignora los estados que van hacia delante', () => {
    expect(pasoAnterior('sheet_selected', ['analyzing', 'failed'])).toBeNull();
  });

  it('desde revisar hojas se puede volver al archivo', () => {
    expect(pasoAnterior('sheet_selected', ['uploaded', 'analyzing'])).toBe('uploaded');
  });
});
