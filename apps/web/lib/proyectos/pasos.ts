/**
 * De un estado del proyecto a la pantalla que le corresponde.
 *
 * El ERS 20 lo exige: *"El usuario solo debera poder acceder a estados validos
 * segun el avance realizado."* Esta tabla es la unica traduccion; el cliente
 * **no** tiene una maquina de estados propia. El paso lo dicta `status` y las
 * transiciones legales las publica el backend en `nextStatuses`, porque dos
 * copias de la misma regla acaban separandose.
 */
export const RUTA_POR_ESTADO: Record<string, string> = {
  draft: 'archivo',
  uploaded: 'hojas',
  sheet_selected: 'hojas',
  analyzing: 'analisis',
  reviewing_entities: 'modelo/entidades',
  reviewing_fields: 'modelo/campos',
  reviewing_relations: 'modelo/relaciones',
  reviewing_summary: 'resumen',
  creating: 'creando',
  importing: 'creando',
  /*
   * Un proyecto terminado no continua en ningun paso: se usa. El despachador
   * responde "donde sigo", y para este la respuesta es su aplicacion, no la
   * ultima pantalla del asistente.
   *
   * `/listo` sigue siendo alcanzable —el guardia lo permite y es a donde lleva
   * la construccion al acabar—, pero deja de ser el destino por defecto. Antes
   * pulsar la fila llevaba alli y la flecha de la misma fila llevaba a la
   * aplicacion: el mismo gesto, dos sitios.
   */
  completed: 'app',
  // Tras un fallo el archivo sigue ahi (RNF-05): se puede reintentar sin volver
  // a subirlo, asi que se vuelve a la eleccion de hojas.
  failed: 'hojas',
};

export function rutaDelEstado(proyectoId: string, status: string): string {
  const destino = RUTA_POR_ESTADO[status] ?? 'archivo';
  return `/proyectos/${proyectoId}/${destino}`;
}

/**
 * Los seis hitos que ve la persona.
 *
 * No son los doce estados: "revisando campos" y "revisando relaciones" son el
 * mismo hito para quien mira la barra de progreso. Un indicador con doce
 * casillas no informa, abruma.
 */
export interface HitoDelAsistente {
  clave: string;
  etiqueta: string;
  estados: string[];
}

export const HITOS: HitoDelAsistente[] = [
  { clave: 'archivo', etiqueta: 'Archivo', estados: ['draft'] },
  { clave: 'hojas', etiqueta: 'Hojas', estados: ['uploaded', 'sheet_selected', 'failed'] },
  { clave: 'analisis', etiqueta: 'Analisis', estados: ['analyzing'] },
  {
    clave: 'modelo',
    etiqueta: 'Modelo',
    estados: ['reviewing_entities', 'reviewing_fields', 'reviewing_relations'],
  },
  { clave: 'resumen', etiqueta: 'Resumen', estados: ['reviewing_summary'] },
  { clave: 'listo', etiqueta: 'Listo', estados: ['creating', 'importing', 'completed'] },
];

export function hitoActual(status: string): number {
  const indice = HITOS.findIndex((hito) => hito.estados.includes(status));
  return indice === -1 ? 0 : indice;
}

/**
 * El paso anterior al que se puede volver, si es que se puede.
 *
 * Sale de `nextStatuses`, que es lo que el backend declara legal. Un `failed` no
 * ofrece "atras": lo que ofrece es reintentar, y eso es otra cosa.
 */
export function pasoAnterior(status: string, nextStatuses: string[]): string | null {
  const ORDEN = [
    'draft',
    'uploaded',
    'sheet_selected',
    'analyzing',
    'reviewing_entities',
    'reviewing_fields',
    'reviewing_relations',
    'reviewing_summary',
  ];

  const actual = ORDEN.indexOf(status);
  if (actual <= 0) return null;

  // De los estados a los que se puede ir, el que queda antes del actual.
  const haciaAtras = nextStatuses.filter((candidato) => {
    const posicion = ORDEN.indexOf(candidato);
    return posicion !== -1 && posicion < actual;
  });

  if (haciaAtras.length === 0) return null;

  return haciaAtras.reduce((mejor, candidato) =>
    ORDEN.indexOf(candidato) > ORDEN.indexOf(mejor) ? candidato : mejor,
  );
}
