import { describe, expect, it } from 'vitest';
import { indefiniteArticle, isFeminine, severalOf, singularize } from '../src/domain/spanish.js';

/**
 * El espanol del asistente.
 *
 * Estas funciones escriben la frase que explica una relacion, que es el texto
 * que lee la persona justo en el paso donde decide si confia en el sistema. Una
 * frase mal construida ahi cuesta mas de lo que parece.
 *
 * Los tres fallos que corrigen estas pruebas se encontraron **hablando con un
 * motor de inferencia real**: una propuesta fijada siempre generaba las mismas
 * cuatro etiquetas y nunca llego a producir "Responsables" ni "Ciudades".
 */
describe('singular aproximado', () => {
  it.each([
    ['conductores', 'conductor'],
    ['camiones', 'camion'],
    ['sucursales', 'sucursal'],
    ['niveles', 'nivel'],
    ['ciudades', 'ciudad'],
    ['ordenes', 'orden'],
    ['luces', 'luz'],
  ])('%s -> %s (la raiz acaba en consonante)', (plural, singular) => {
    expect(singularize(plural)).toBe(singular);
  });

  it.each([
    ['viajes', 'viaje'],
    ['clientes', 'cliente'],
    ['productos', 'producto'],
    ['facturas', 'factura'],
  ])('%s -> %s (la raiz acaba en vocal)', (plural, singular) => {
    expect(singularize(plural)).toBe(singular);
  });

  /**
   * Una palabra espanola no puede terminar en dos consonantes, asi que
   * "responsabl" no existe y el singular tenia que ser "responsable".
   *
   * Es el caso que producia "Cada gasto pertenece a un responsabl".
   */
  it.each([
    ['responsables', 'responsable'],
    ['detalles', 'detalle'],
    ['hombres', 'hombre'],
    ['padres', 'padre'],
    ['dobles', 'doble'],
    ['tardes', 'tarde'],
  ])('%s -> %s (el singular ya acababa en -e)', (plural, singular) => {
    expect(singularize(plural)).toBe(singular);
  });

  it('un singular que llega en singular se queda como esta', () => {
    expect(singularize('cliente')).toBe('cliente');
  });
});

describe('genero, para concordar el articulo', () => {
  it.each(['factura', 'matricula', 'ciudad', 'empresa', 'facturacion', 'solicitud'])(
    '%s es femenino',
    (palabra) => {
      expect(isFeminine(palabra)).toBe(true);
    },
  );

  it.each(['cliente', 'viaje', 'producto', 'conductor', 'responsable', 'curso'])(
    '%s es masculino',
    (palabra) => {
      expect(isFeminine(palabra)).toBe(false);
    },
  );

  it('los articulos concuerdan', () => {
    expect(indefiniteArticle('ciudad')).toBe('una');
    expect(indefiniteArticle('cliente')).toBe('un');
    expect(severalOf('matricula')).toBe('varias');
    expect(severalOf('viaje')).toBe('varios');
  });

  /**
   * La heuristica falla con "dia", "mapa" y "problema", que son masculinos y
   * acaban en "a". Se acepta a proposito: son palabras que no aparecen como
   * nombre de una entidad de negocio, y la alternativa seria un diccionario.
   */
  it('se documenta lo que no acierta, en vez de fingir que acierta', () => {
    expect(isFeminine('dia')).toBe(true);
  });
});
