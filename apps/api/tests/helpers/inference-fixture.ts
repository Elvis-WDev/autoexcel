import type { AnalysisInput } from '../../src/domain/blueprint/analysis-input.js';

/**
 * La misma entrada y la misma respuesta para los tres proveedores.
 *
 * Compartirlas no es ahorro de lineas: es lo que hace que las tres suites
 * comprueben **lo mismo**. Si cada una trajera su propio caso, dos podrian
 * pasar por motivos distintos y nadie lo notaria.
 */
export const INPUT: AnalysisInput = {
  fileName: 'viajes.xlsx',
  sheets: [
    {
      index: 0,
      name: 'Viajes',
      rowCount: 400,
      columns: [
        {
          index: 0,
          header: 'Cliente',
          normalizedHeader: 'cliente',
          profile: {
            total: 400,
            empty: 0,
            distinct: 3,
            cardinalityRatio: 0.0075,
            samples: ['Comercial Andes', 'Cliente Norte'],
            inferredType: 'text',
            typeConfidence: 1,
            maxLength: 20,
            repeatsEnoughForEntity: true,
            identifying: false,
            identityCandidate: false,
          },
        },
      ],
    },
  ],
  overlaps: [],
};

export const VALID_RESPONSE = {
  applicationName: 'Gestion de Viajes',
  entities: [
    {
      name: 'clientes',
      label: 'Clientes',
      origin: 'derived',
      sourceSheetIndex: 0,
      displayField: 'nombre',
      dedupeField: 'nombre',
      fields: [
        {
          name: 'nombre',
          label: 'Cliente',
          type: 'text',
          required: true,
          options: null,
          targetEntity: null,
          sourceSheetIndex: 0,
          sourceColumnIndex: 0,
        },
      ],
    },
  ],
  relations: [],
};
