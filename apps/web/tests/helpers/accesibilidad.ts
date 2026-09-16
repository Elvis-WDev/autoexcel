import axe, { type AxeResults, type RunOptions } from 'axe-core';
import { expect } from 'vitest';

/**
 * Auditoria de accesibilidad sobre lo que se acaba de pintar.
 *
 * `axe-core` no sustituye a probar con teclado y lector de pantalla, y no
 * pretende hacerlo: detecta alrededor de un tercio de los problemas reales. Pero
 * ese tercio son los que se cuelan sin que nadie los note —un icono sin nombre,
 * una etiqueta sin campo— y son justo los que reaparecen cada vez que alguien
 * anade un componente.
 *
 * Tenerlo en la suite convierte la seccion de accesibilidad del checklist en
 * algo que se comprueba solo, en vez de en una lista de buenas intenciones.
 */
const OPCIONES: RunOptions = {
  // WCAG 2.1 hasta nivel AA, que es la linea base declarada del proyecto.
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
  rules: {
    /*
     * El contraste se mide aparte, sobre los tokens, con `scripts/contraste.mjs`.
     * jsdom no aplica la hoja de estilos ni resuelve variables CSS, asi que aqui
     * axe compararia negro sobre transparente y daria falsos positivos.
     */
    'color-contrast': { enabled: false },
    /*
     * Un fragmento montado en un test no es una pagina: no tiene `main` ni el
     * resto de puntos de referencia. Eso se revisa en las paginas de verdad.
     */
    region: { enabled: false },
  },
};

function describir(resultados: AxeResults): string {
  return resultados.violations
    .map((problema) => {
      const donde = problema.nodes
        .slice(0, 3)
        .map((nodo) => `      ${nodo.html.slice(0, 120)}`)
        .join('\n');
      return `  [${problema.impact ?? 'sin impacto'}] ${problema.id}: ${problema.help}\n${donde}`;
    })
    .join('\n\n');
}

export async function esperarSinProblemasDeAccesibilidad(
  contenedor: HTMLElement = document.body,
): Promise<void> {
  const resultados = await axe.run(contenedor, OPCIONES);

  expect(
    resultados.violations.length,
    resultados.violations.length === 0
      ? ''
      : `\n\nProblemas de accesibilidad:\n\n${describir(resultados)}\n`,
  ).toBe(0);
}
