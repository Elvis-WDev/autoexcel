import { describe, expect, it } from 'vitest';
import { medirPaleta, type Medicion } from './helpers/contraste';

const MEDICIONES = medirPaleta();

function describir(m: Medicion): string {
  return `${m.tema} · ${m.etiqueta}: ${m.ratio.toFixed(2)}:1 (min ${m.minimo})`;
}

describe('contraste de la paleta (WCAG 2.1 AA)', () => {
  it('se miden los dos temas', () => {
    expect(MEDICIONES.filter((m) => m.tema === 'claro').length).toBeGreaterThan(10);
    expect(MEDICIONES.filter((m) => m.tema === 'oscuro').length).toBeGreaterThan(10);
  });

  it.each(MEDICIONES.map((m) => [describir(m), m] as const))('%s', (_, medicion) => {
    expect(medicion.pasa).toBe(true);
  });

  /**
   * El rojo hace dos trabajos opuestos en tema oscuro: fondo del boton
   * destructivo y color del texto de error. Si alguien "mejora" uno, este test
   * avisa de que rompio el otro.
   */
  it('el rojo destructivo sirve para las dos cosas a la vez', () => {
    const oscuras = MEDICIONES.filter((m) => m.tema === 'oscuro');
    const boton = oscuras.find((m) => m.etiqueta === 'Boton destructivo');
    const texto = oscuras.find((m) => m.etiqueta === 'Mensaje de error');

    expect(boton?.ratio).toBeGreaterThanOrEqual(4.5);
    expect(texto?.ratio).toBeGreaterThanOrEqual(4.5);
  });
});
