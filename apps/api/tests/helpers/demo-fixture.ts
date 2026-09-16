import type { ProposedBlueprint } from '../../src/domain/blueprint/types.js';
import type { FixtureSheet } from './xlsx-fixtures.js';

/**
 * El archivo de demo del ERS 18.
 *
 * Dos cosas tienen que ser visibles al abrirlo:
 *
 *   1. `Cliente` se repite lo suficiente como para que deduplicar cambie el
 *      resultado de forma evidente: 120 viajes, 4 clientes. Sin repeticion, la
 *      demo no demuestra nada, porque cualquier importacion ingenua daria lo
 *      mismo.
 *   2. Hay una segunda hoja `Clientes` con datos que NO estan en la hoja de
 *      viajes: correo, telefono, ciudad. Es el caso que justifica la decision 2
 *      del plan —leer todas las hojas y construir un modelo unificado— porque
 *      con una sola hoja esa informacion se perderia.
 *
 * Tambien trae suciedad deliberada: mayusculas alternas, espacios sobrantes y
 * dos filas con celdas invalidas. Un Excel limpio no prueba nada sobre un Excel
 * real.
 */

const CLIENTES = [
  { nombre: 'Comercial Andes', ruc: '1790012345001', ciudad: 'Quito' },
  { nombre: 'Cliente Norte', ruc: '0990054321001', ciudad: 'Guayaquil' },
  { nombre: 'Distribuidora Sur', ruc: '0190098765001', ciudad: 'Cuenca' },
  { nombre: 'Transportes Pacifico', ruc: '1390011223001', ciudad: 'Manta' },
];

const VEHICULOS = ['ABC-1234', 'XYZ-5678', 'DEF-9012', 'GHI-3456'];
const CONDUCTORES = ['Juan Perez', 'Ana Ruiz', 'Luis Mora', 'Carmen Vega'];

/** Viajes: la hoja principal, con 120 filas y repeticion abundante. */
export function demoViajes(): FixtureSheet {
  const rows: FixtureSheet['rows'] = [
    ['Fecha', 'Cliente', 'RUC', 'Vehiculo', 'Conductor', 'Valor', 'Estado'],
  ];

  for (let i = 0; i < 120; i += 1) {
    const cliente = CLIENTES[i % CLIENTES.length]!;

    // Una de cada cuatro filas escribe el nombre distinto. Un sistema que no
    // normalice creara cuatro clientes donde hay uno.
    const nombre =
      i % 4 === 0
        ? cliente.nombre.toUpperCase()
        : i % 7 === 0
          ? `  ${cliente.nombre}  `
          : cliente.nombre;

    rows.push([
      `${String((i % 28) + 1).padStart(2, '0')}/09/26`,
      nombre,
      cliente.ruc,
      VEHICULOS[i % VEHICULOS.length]!,
      CONDUCTORES[i % CONDUCTORES.length]!,
      200 + (i % 45) * 10,
      i % 2 === 0 ? 'Abierto' : 'Cerrado',
    ]);
  }

  // Suciedad deliberada: dos filas que no se podran importar (RE-06).
  rows.push([
    'pendiente',
    'Comercial Andes',
    '1790012345001',
    'ABC-1234',
    'Juan Perez',
    300,
    'Abierto',
  ]);
  rows.push([
    '29/09/26',
    'Cliente Norte',
    '0990054321001',
    'XYZ-5678',
    'Ana Ruiz',
    'por definir',
    'Cerrado',
  ]);

  return { name: 'Viajes', rows };
}

/**
 * Clientes: la segunda hoja.
 *
 * Aporta correo, telefono y ciudad, que no aparecen en la hoja de viajes. Si el
 * sistema leyera una sola hoja, esta informacion se perderia entera.
 */
export function demoClientes(): FixtureSheet {
  return {
    name: 'Clientes',
    rows: [
      ['Cliente', 'RUC', 'Correo', 'Telefono', 'Ciudad'],
      ...CLIENTES.map((cliente) => [
        cliente.nombre,
        cliente.ruc,
        `ventas@${cliente.nombre.split(' ')[0]!.toLowerCase()}.com`,
        `+593 9${cliente.ruc.slice(0, 1)} ${cliente.ruc.slice(1, 4)} ${cliente.ruc.slice(4, 8)}`,
        cliente.ciudad,
      ]),
    ],
  };
}

/** Pestana de leyenda vacia, como la que trae cualquier archivo real. */
export function demoNotas(): FixtureSheet {
  return { name: 'Notas', rows: [] };
}

export function demoWorkbook(): FixtureSheet[] {
  return [demoViajes(), demoClientes(), demoNotas()];
}

/**
 * La propuesta que el ERS 18 espera para este archivo.
 *
 * En el test de aceptacion se inyecta con el motor determinista, para que la
 * suite no dependa de una clave de API ni gaste dinero. Lo que el test verifica
 * es el SISTEMA: que dada una propuesta, todo lo demas ocurre correctamente. La
 * CALIDAD de la propuesta se comprueba aparte, con el motor real, siguiendo
 * `docs/quality/inference-manual-check.md`.
 */
export function demoBlueprint(): ProposedBlueprint {
  return {
    applicationName: 'Gestion de Viajes',
    entities: [
      {
        name: 'clientes',
        label: 'Clientes',
        origin: 'sheet',
        sourceSheetIndex: 1,
        displayField: 'nombre',
        dedupeField: 'ruc',
        fields: [
          {
            name: 'nombre',
            label: 'Cliente',
            type: 'text',
            required: true,
            source: { sheetIndex: 1, columnIndex: 0 },
          },
          {
            name: 'ruc',
            label: 'RUC',
            type: 'text',
            required: true,
            source: { sheetIndex: 1, columnIndex: 1 },
          },
          {
            name: 'correo',
            label: 'Correo',
            type: 'email',
            required: false,
            source: { sheetIndex: 1, columnIndex: 2 },
          },
          {
            name: 'telefono',
            label: 'Telefono',
            type: 'phone',
            required: false,
            source: { sheetIndex: 1, columnIndex: 3 },
          },
          {
            name: 'ciudad',
            label: 'Ciudad',
            type: 'text',
            required: false,
            source: { sheetIndex: 1, columnIndex: 4 },
          },
        ],
      },
      {
        name: 'vehiculos',
        label: 'Vehiculos',
        origin: 'derived',
        sourceSheetIndex: 0,
        displayField: 'placa',
        dedupeField: 'placa',
        fields: [
          {
            name: 'placa',
            label: 'Vehiculo',
            type: 'text',
            required: true,
            source: { sheetIndex: 0, columnIndex: 3 },
          },
        ],
      },
      {
        name: 'conductores',
        label: 'Conductores',
        origin: 'derived',
        sourceSheetIndex: 0,
        displayField: 'nombre',
        dedupeField: 'nombre',
        fields: [
          {
            name: 'nombre',
            label: 'Conductor',
            type: 'text',
            required: true,
            source: { sheetIndex: 0, columnIndex: 4 },
          },
        ],
      },
      {
        name: 'viajes',
        label: 'Viajes',
        origin: 'sheet',
        sourceSheetIndex: 0,
        displayField: 'vehiculo',
        fields: [
          {
            name: 'fecha',
            label: 'Fecha',
            type: 'date',
            required: true,
            source: { sheetIndex: 0, columnIndex: 0 },
          },
          {
            name: 'cliente',
            label: 'Cliente',
            type: 'relation',
            required: true,
            targetEntity: 'clientes',
            source: { sheetIndex: 0, columnIndex: 1 },
          },
          {
            name: 'vehiculo',
            label: 'Vehiculo',
            type: 'relation',
            required: true,
            targetEntity: 'vehiculos',
            source: { sheetIndex: 0, columnIndex: 3 },
          },
          {
            name: 'conductor',
            label: 'Conductor',
            type: 'relation',
            required: true,
            targetEntity: 'conductores',
            source: { sheetIndex: 0, columnIndex: 4 },
          },
          {
            name: 'valor',
            label: 'Valor',
            type: 'decimal',
            required: false,
            source: { sheetIndex: 0, columnIndex: 5 },
          },
          {
            name: 'estado',
            label: 'Estado',
            type: 'select',
            required: false,
            options: ['Abierto', 'Cerrado'],
            source: { sheetIndex: 0, columnIndex: 6 },
          },
        ],
      },
    ],
    relations: [
      { fromEntity: 'viajes', toEntity: 'clientes', fieldName: 'cliente', type: 'many_to_one' },
      { fromEntity: 'viajes', toEntity: 'vehiculos', fieldName: 'vehiculo', type: 'many_to_one' },
      {
        fromEntity: 'viajes',
        toEntity: 'conductores',
        fieldName: 'conductor',
        type: 'many_to_one',
      },
    ],
  };
}

// --------------------------------------------------------------------------
// Segundo archivo: un Excel que no se parece en nada al primero.
//
// Existe para la promesa central de la plataforma —"si manana tengo otro Excel
// creo otro proyecto y genero otro software"—, y para que esa promesa se pruebe
// de verdad tiene que producir modulos distintos, no los mismos con otro nombre.
// --------------------------------------------------------------------------

const CATEGORIAS = ['Ferreteria', 'Electricos', 'Plomeria', 'Pinturas', 'Herramientas'];
const PROVEEDORES = [
  { nombre: 'Importadora Sierra', contacto: 'Marta Leon' },
  { nombre: 'Suministros Costa', contacto: 'Pedro Gil' },
  { nombre: 'Insumos Oriente', contacto: 'Rosa Diaz' },
];

export function inventarioWorkbook(): FixtureSheet[] {
  const productos: FixtureSheet['rows'] = [
    ['Codigo', 'Producto', 'Categoria', 'Proveedor', 'Stock', 'Precio'],
  ];

  for (let i = 0; i < 60; i += 1) {
    productos.push([
      `SKU-${String(i + 1).padStart(4, '0')}`,
      `Articulo ${i + 1}`,
      CATEGORIAS[i % CATEGORIAS.length]!,
      PROVEEDORES[i % PROVEEDORES.length]!.nombre,
      (i % 17) * 3,
      9.99 + i,
    ]);
  }

  return [
    { name: 'Productos', rows: productos },
    {
      name: 'Proveedores',
      rows: [
        ['Proveedor', 'Contacto', 'Telefono'],
        ...PROVEEDORES.map((proveedor) => [
          proveedor.nombre,
          proveedor.contacto,
          `+593 2 ${proveedor.nombre.length}00 ${proveedor.contacto.length}00`,
        ]),
      ],
    },
  ];
}

export function inventarioBlueprint(): ProposedBlueprint {
  return {
    applicationName: 'Control de Inventario',
    entities: [
      {
        name: 'proveedores',
        label: 'Proveedores',
        origin: 'sheet',
        sourceSheetIndex: 1,
        displayField: 'nombre',
        dedupeField: 'nombre',
        fields: [
          {
            name: 'nombre',
            label: 'Proveedor',
            type: 'text',
            required: true,
            source: { sheetIndex: 1, columnIndex: 0 },
          },
          {
            name: 'contacto',
            label: 'Contacto',
            type: 'text',
            required: false,
            source: { sheetIndex: 1, columnIndex: 1 },
          },
          {
            name: 'telefono',
            label: 'Telefono',
            type: 'phone',
            required: false,
            source: { sheetIndex: 1, columnIndex: 2 },
          },
        ],
      },
      {
        name: 'categorias',
        label: 'Categorias',
        origin: 'derived',
        sourceSheetIndex: 0,
        displayField: 'nombre',
        dedupeField: 'nombre',
        fields: [
          {
            name: 'nombre',
            label: 'Categoria',
            type: 'text',
            required: true,
            source: { sheetIndex: 0, columnIndex: 2 },
          },
        ],
      },
      {
        name: 'productos',
        label: 'Productos',
        origin: 'sheet',
        sourceSheetIndex: 0,
        displayField: 'nombre',
        fields: [
          {
            name: 'codigo',
            label: 'Codigo',
            type: 'text',
            required: true,
            source: { sheetIndex: 0, columnIndex: 0 },
          },
          {
            name: 'nombre',
            label: 'Producto',
            type: 'text',
            required: true,
            source: { sheetIndex: 0, columnIndex: 1 },
          },
          {
            name: 'categoria',
            label: 'Categoria',
            type: 'relation',
            required: true,
            targetEntity: 'categorias',
            source: { sheetIndex: 0, columnIndex: 2 },
          },
          {
            name: 'proveedor',
            label: 'Proveedor',
            type: 'relation',
            required: true,
            targetEntity: 'proveedores',
            source: { sheetIndex: 0, columnIndex: 3 },
          },
          {
            name: 'stock',
            label: 'Stock',
            type: 'integer',
            required: false,
            source: { sheetIndex: 0, columnIndex: 4 },
          },
          {
            name: 'precio',
            label: 'Precio',
            type: 'decimal',
            required: false,
            source: { sheetIndex: 0, columnIndex: 5 },
          },
        ],
      },
    ],
    relations: [
      {
        fromEntity: 'productos',
        toEntity: 'categorias',
        fieldName: 'categoria',
        type: 'many_to_one',
      },
      {
        fromEntity: 'productos',
        toEntity: 'proveedores',
        fieldName: 'proveedor',
        type: 'many_to_one',
      },
    ],
  };
}
