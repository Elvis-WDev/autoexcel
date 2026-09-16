/**
 * Los diez tipos de campo de RF-08, en lenguaje de negocio.
 *
 * El vocabulario esta **cerrado**: el backend no acepta nada fuera de esta
 * lista, y por eso W7 podra generar formularios y tablas con un renderizador
 * por tipo en vez de con casos infinitos.
 *
 * `relation` esta aparte a proposito: **no se puede elegir a mano**. El backend
 * lo excluye de sus tipos editables porque una relacion no es una propiedad de
 * una columna, sino una decision sobre el modelo, y se acepta o se rechaza en la
 * pantalla de relaciones.
 */
export interface TipoDeCampo {
  valor: string;
  etiqueta: string;
  ayuda: string;
}

export const TIPOS_EDITABLES: TipoDeCampo[] = [
  { valor: 'text', etiqueta: 'Texto', ayuda: 'Nombres, descripciones, codigos.' },
  { valor: 'integer', etiqueta: 'Numero entero', ayuda: 'Cantidades, unidades.' },
  { valor: 'decimal', etiqueta: 'Numero con decimales', ayuda: 'Importes, pesos, medidas.' },
  { valor: 'boolean', etiqueta: 'Si o no', ayuda: 'Una casilla marcada o sin marcar.' },
  { valor: 'date', etiqueta: 'Fecha', ayuda: 'Un dia, sin hora.' },
  { valor: 'datetime', etiqueta: 'Fecha y hora', ayuda: 'Un momento exacto.' },
  { valor: 'email', etiqueta: 'Correo', ayuda: 'Direcciones de correo.' },
  { valor: 'phone', etiqueta: 'Telefono', ayuda: 'Numeros de contacto.' },
  { valor: 'select', etiqueta: 'Lista cerrada', ayuda: 'Un valor de entre varios fijos.' },
];

const POR_VALOR = new Map(TIPOS_EDITABLES.map((tipo) => [tipo.valor, tipo]));

export function etiquetaDeTipo(valor: string): string {
  if (valor === 'relation') return 'Relacion';
  return POR_VALOR.get(valor)?.etiqueta ?? valor;
}

export function esEditable(tipo: string): boolean {
  return tipo !== 'relation';
}

/** Solo las listas cerradas tienen opciones que administrar. */
export function tieneOpciones(tipo: string): boolean {
  return tipo === 'select';
}
