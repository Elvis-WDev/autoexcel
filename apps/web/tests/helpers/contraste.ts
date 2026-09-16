import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Medicion del contraste de la paleta.
 *
 * "Cumple 4.5:1" es una afirmacion comprobable, y hasta que alguien la calcula
 * no se sabe. Aqui se convierte cada token de `globals.css` de OKLCH a sRGB, se
 * saca su luminancia relativa y se comparan los pares que de verdad se pintan
 * juntos.
 *
 * Vive en los tests y no solo en un script porque una paleta se retoca a
 * menudo, y un umbral que solo se comprueba cuando alguien se acuerda no es un
 * umbral.
 *
 * Umbrales de WCAG 2.1 AA: 4.5:1 para texto normal, 3:1 para texto grande y
 * para elementos no textuales que transmiten significado.
 */

type Rgb = [number, number, number];

/** OKLCH -> sRGB lineal, segun CSS Color 4. */
function oklchARgb(L: number, C: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function luminancia([r, g, b]: Rgb): number {
  const acotar = (v: number): number => Math.min(Math.max(v, 0), 1);
  return 0.2126 * acotar(r) + 0.7152 * acotar(g) + 0.0722 * acotar(b);
}

export function contraste(a: Rgb, b: Rgb): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const [claro, oscuro] = la > lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (oscuro + 0.05);
}

function tokensDe(css: string, bloque: string): Record<string, Rgb> {
  const inicio = css.indexOf(bloque);
  const cuerpo = css.slice(inicio, css.indexOf('}', inicio));

  const tokens: Record<string, Rgb> = {};
  for (const [, nombre, l, c, h] of cuerpo.matchAll(
    /--([a-z-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g,
  )) {
    tokens[nombre!] = oklchARgb(Number(l), Number(c), Number(h));
  }
  return tokens;
}

export interface ParDeContraste {
  frente: string;
  fondo: string;
  /** Umbral exigible. `0` marca una excepcion declarada. */
  minimo: number;
  etiqueta: string;
}

/**
 * Los pares que se pintan juntos de verdad.
 *
 * `--border` separa y agrupa —filas de una tabla, borde de una tarjeta— y no es
 * lo unico que identifica un componente: la tabla se lee sin sus lineas. WCAG
 * 1.4.11 no le aplica. Se mide igual, con umbral `0`, para que la excepcion sea
 * visible y no un descuido.
 */
export const PARES: ParDeContraste[] = [
  { frente: 'foreground', fondo: 'background', minimo: 4.5, etiqueta: 'Texto sobre la pagina' },
  { frente: 'muted-foreground', fondo: 'background', minimo: 4.5, etiqueta: 'Texto secundario' },
  { frente: 'muted-foreground', fondo: 'muted', minimo: 4.5, etiqueta: 'Secundario sobre apagado' },
  { frente: 'card-foreground', fondo: 'card', minimo: 4.5, etiqueta: 'Texto sobre tarjeta' },
  { frente: 'popover-foreground', fondo: 'popover', minimo: 4.5, etiqueta: 'Texto sobre menu' },
  { frente: 'primary-foreground', fondo: 'primary', minimo: 4.5, etiqueta: 'Boton principal' },
  { frente: 'secondary-foreground', fondo: 'secondary', minimo: 4.5, etiqueta: 'Boton secundario' },
  { frente: 'accent-foreground', fondo: 'accent', minimo: 4.5, etiqueta: 'Texto sobre acento' },
  {
    frente: 'destructive-foreground',
    fondo: 'destructive',
    minimo: 4.5,
    etiqueta: 'Boton destructivo',
  },
  { frente: 'destructive', fondo: 'background', minimo: 4.5, etiqueta: 'Mensaje de error' },
  { frente: 'success', fondo: 'background', minimo: 4.5, etiqueta: 'Texto de exito' },
  { frente: 'warning-foreground', fondo: 'warning', minimo: 4.5, etiqueta: 'Texto de aviso' },
  { frente: 'info', fondo: 'background', minimo: 4.5, etiqueta: 'Texto informativo' },
  {
    frente: 'sidebar-foreground',
    fondo: 'sidebar',
    minimo: 4.5,
    etiqueta: 'Texto de la barra lateral',
  },
  {
    frente: 'sidebar-accent-foreground',
    fondo: 'sidebar-accent',
    minimo: 4.5,
    etiqueta: 'Destino seleccionado',
  },
  { frente: 'border', fondo: 'background', minimo: 0, etiqueta: 'Separador (excepcion declarada)' },
  { frente: 'input', fondo: 'background', minimo: 3, etiqueta: 'Borde de un campo' },
  { frente: 'ring', fondo: 'background', minimo: 3, etiqueta: 'Anillo de foco' },
  { frente: 'primary', fondo: 'background', minimo: 3, etiqueta: 'Elemento principal' },
];

export interface Medicion extends ParDeContraste {
  tema: 'claro' | 'oscuro';
  ratio: number;
  pasa: boolean;
}

/**
 * Ruta desde la raiz del paquete, no desde este archivo.
 *
 * `import.meta.url` no es una URL de archivo cuando Vite sirve el modulo, asi
 * que resolverla contra el propio modulo falla solo dentro de los tests. Tanto
 * Vitest como el script corren con el directorio del paquete como raiz.
 */
export const RUTA_DE_LA_PALETA = resolve('app/globals.css');

export function medirPaleta(rutaCss: string = RUTA_DE_LA_PALETA): Medicion[] {
  const css = readFileSync(rutaCss, 'utf8');
  const mediciones: Medicion[] = [];

  for (const [tema, bloque] of [
    ['claro', ':root {'],
    ['oscuro', '.dark {'],
  ] as const) {
    const tokens = tokensDe(css, bloque);

    for (const par of PARES) {
      const frente = tokens[par.frente];
      const fondo = tokens[par.fondo];
      if (!frente || !fondo) {
        throw new Error(`Falta el token ${par.frente} o ${par.fondo} en el tema ${tema}`);
      }

      const ratio = contraste(frente, fondo);
      mediciones.push({ ...par, tema, ratio, pasa: ratio >= par.minimo });
    }
  }

  return mediciones;
}
