/**
 * Tres archivos de Excel, del mas simple al mas completo.
 *
 * Existen para responder una pregunta concreta: dado un Excel cualquiera —no el
 * de la demo— ¿sale una aplicacion que funciona? Tipos, formularios, tablas y
 * relaciones.
 *
 * El primero se analiza con el motor determinista de verdad, sin sustituir
 * nada: es la unica forma de comprobar que la inferencia de tipos funciona. Los
 * otros dos traen su propuesta, porque sin clave de API el camino determinista
 * nunca propone relaciones (RI-04) y no habria relaciones que probar.
 */
import type { ProposedBlueprint } from '../../src/domain/blueprint/types.js';
import type { FixtureSheet } from '../../tests/helpers/xlsx-fixtures.js';

// ---------------------------------------------------------------------------
// E1 — Una hoja, ocho tipos. Sin propuesta: se analiza de verdad.
// ---------------------------------------------------------------------------

const CATEGORIAS = ['Oficina', 'Viajes', 'Software', 'Formacion'];
const RESPONSABLES = ['ana', 'luis', 'carmen', 'diego'];

/**
 * Gastos: la hoja mas simple que sigue siendo interesante.
 *
 * Una columna por cada tipo que el motor determinista sabe reconocer. Si alguna
 * sale como texto, la inferencia de esa columna no funciona, y se vera.
 */
export function gastos(): FixtureSheet {
  const rows: FixtureSheet['rows'] = [
    [
      'Fecha',
      'Registrado',
      'Concepto',
      'Categoria',
      'Cantidad',
      'Importe',
      'Pagado',
      'Responsable',
      'Telefono',
    ],
  ];

  for (let i = 0; i < 40; i += 1) {
    const dia = String((i % 28) + 1).padStart(2, '0');
    const quien = RESPONSABLES[i % RESPONSABLES.length]!;

    rows.push([
      `2026-03-${dia}`,
      `2026-03-${dia} 09:${String(i % 60).padStart(2, '0')}:00`,
      `Gasto numero ${i + 1}`,
      CATEGORIAS[i % CATEGORIAS.length]!,
      1 + (i % 12),
      Number((12.5 + i * 3.25).toFixed(2)),
      i % 3 === 0 ? 'No' : 'Si',
      `${quien}@empresa.test`,
      `+593 9${i % 10} ${String(100 + i).padStart(3, '0')} ${String(1000 + i)}`,
    ]);
  }

  return { name: 'Gastos', rows };
}

export function libroGastos(): FixtureSheet[] {
  return [gastos()];
}

// ---------------------------------------------------------------------------
// E2 — Dos hojas y una relacion.
// ---------------------------------------------------------------------------

const TIENDAS = [
  { nombre: 'Panaderia Central', correo: 'hola@central.test', ciudad: 'Quito' },
  { nombre: 'Cafe del Parque', correo: 'pedidos@parque.test', ciudad: 'Cuenca' },
  { nombre: 'Mercado Sur', correo: 'compras@sur.test', ciudad: 'Loja' },
];

const ESTADOS = ['Pendiente', 'Enviado', 'Entregado'];

export function pedidos(): FixtureSheet {
  const rows: FixtureSheet['rows'] = [
    ['Fecha', 'Cliente', 'Producto', 'Unidades', 'Total', 'Estado'],
  ];

  for (let i = 0; i < 60; i += 1) {
    const tienda = TIENDAS[i % TIENDAS.length]!;

    rows.push([
      `2026-04-${String((i % 28) + 1).padStart(2, '0')}`,
      // Mayusculas alternas: si no se normaliza, saldran seis clientes y no tres.
      i % 5 === 0 ? tienda.nombre.toUpperCase() : tienda.nombre,
      `Producto ${String.fromCharCode(65 + (i % 8))}`,
      1 + (i % 20),
      Number((9.9 + i * 1.75).toFixed(2)),
      ESTADOS[i % ESTADOS.length]!,
    ]);
  }

  // Una fila que no se podra importar: el total no es un numero.
  rows.push(['2026-04-29', 'Mercado Sur', 'Producto Z', 3, 'a convenir', 'Pendiente']);

  return { name: 'Pedidos', rows };
}

export function clientesDePedidos(): FixtureSheet {
  return {
    name: 'Clientes',
    rows: [['Cliente', 'Correo', 'Ciudad'], ...TIENDAS.map((t) => [t.nombre, t.correo, t.ciudad])],
  };
}

export function libroPedidos(): FixtureSheet[] {
  return [pedidos(), clientesDePedidos()];
}

export function planoPedidos(): ProposedBlueprint {
  return {
    applicationName: 'Gestion de Pedidos',
    entities: [
      {
        name: 'clientes',
        label: 'Clientes',
        origin: 'sheet',
        sourceSheetIndex: 1,
        displayField: 'nombre',
        dedupeField: 'nombre',
        fields: [
          {
            name: 'nombre',
            label: 'Cliente',
            type: 'text',
            required: true,
            source: { sheetIndex: 1, columnIndex: 0 },
          },
          {
            name: 'correo',
            label: 'Correo',
            type: 'email',
            required: false,
            source: { sheetIndex: 1, columnIndex: 1 },
          },
          {
            name: 'ciudad',
            label: 'Ciudad',
            type: 'text',
            required: false,
            source: { sheetIndex: 1, columnIndex: 2 },
          },
        ],
      },
      {
        name: 'pedidos',
        label: 'Pedidos',
        origin: 'sheet',
        sourceSheetIndex: 0,
        displayField: 'producto',
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
            required: false,
            targetEntity: 'clientes',
            source: { sheetIndex: 0, columnIndex: 1 },
          },
          {
            name: 'producto',
            label: 'Producto',
            type: 'text',
            required: true,
            source: { sheetIndex: 0, columnIndex: 2 },
          },
          {
            name: 'unidades',
            label: 'Unidades',
            type: 'integer',
            required: false,
            source: { sheetIndex: 0, columnIndex: 3 },
          },
          {
            name: 'total',
            label: 'Total',
            type: 'decimal',
            required: false,
            source: { sheetIndex: 0, columnIndex: 4 },
          },
          {
            name: 'estado',
            label: 'Estado',
            type: 'select',
            required: false,
            options: ESTADOS,
            source: { sheetIndex: 0, columnIndex: 5 },
          },
        ],
      },
    ],
    relations: [
      { fromEntity: 'pedidos', toEntity: 'clientes', fieldName: 'cliente', type: 'many_to_one' },
    ],
  };
}

// ---------------------------------------------------------------------------
// E3 — Cuatro hojas, tres relaciones y los diez tipos.
// ---------------------------------------------------------------------------

const ESTUDIANTES = [
  {
    nombre: 'Maria Salazar',
    cedula: '1712345678',
    correo: 'maria@academia.test',
    tel: '+593 99 111 2233',
  },
  {
    nombre: 'Jorge Benitez',
    cedula: '0923456789',
    correo: 'jorge@academia.test',
    tel: '+593 98 222 3344',
  },
  {
    nombre: 'Elena Ponce',
    cedula: '0134567890',
    correo: 'elena@academia.test',
    tel: '+593 97 333 4455',
  },
  {
    nombre: 'Raul Chavez',
    cedula: '1745678901',
    correo: 'raul@academia.test',
    tel: '+593 96 444 5566',
  },
  {
    nombre: 'Sofia Aguirre',
    cedula: '0956789012',
    correo: 'sofia@academia.test',
    tel: '+593 95 555 6677',
  },
];

const CURSOS = [
  { nombre: 'Contabilidad Basica', codigo: 'CON-101', horas: 40, precio: 180.0 },
  { nombre: 'Excel Avanzado', codigo: 'EXC-201', horas: 24, precio: 120.5 },
  { nombre: 'Gestion de Proyectos', codigo: 'GDP-301', horas: 60, precio: 310.75 },
];

const DOCENTES = [
  { nombre: 'Patricia Nunez', correo: 'patricia@academia.test' },
  { nombre: 'Andres Vela', correo: 'andres@academia.test' },
];

const MODALIDADES = ['Presencial', 'Virtual', 'Hibrida'];

export function matriculas(): FixtureSheet {
  const rows: FixtureSheet['rows'] = [
    [
      'Fecha',
      'Inscrito el',
      'Estudiante',
      'Curso',
      'Docente',
      'Modalidad',
      'Cuotas',
      'Valor',
      'Becado',
      'Contacto',
      'Telefono',
    ],
  ];

  for (let i = 0; i < 90; i += 1) {
    const e = ESTUDIANTES[i % ESTUDIANTES.length]!;
    const c = CURSOS[i % CURSOS.length]!;
    const d = DOCENTES[i % DOCENTES.length]!;

    rows.push([
      `2026-05-${String((i % 28) + 1).padStart(2, '0')}`,
      `2026-05-${String((i % 28) + 1).padStart(2, '0')} 14:${String(i % 60).padStart(2, '0')}:00`,
      i % 6 === 0 ? `  ${e.nombre}  ` : e.nombre,
      c.nombre,
      d.nombre,
      MODALIDADES[i % MODALIDADES.length]!,
      1 + (i % 6),
      Number((c.precio - (i % 4) * 5).toFixed(2)),
      i % 7 === 0 ? 'Si' : 'No',
      e.correo,
      e.tel,
    ]);
  }

  // Suciedad: una fecha que no lo es y un valor que no es numero.
  rows.push([
    'sin fecha',
    '2026-05-30 10:00:00',
    'Maria Salazar',
    'Excel Avanzado',
    'Andres Vela',
    'Virtual',
    2,
    120.5,
    'No',
    'maria@academia.test',
    '+593 99 111 2233',
  ]);
  rows.push([
    '2026-05-31',
    '2026-05-31 10:00:00',
    'Jorge Benitez',
    'Contabilidad Basica',
    'Patricia Nunez',
    'Presencial',
    3,
    'por definir',
    'No',
    'jorge@academia.test',
    '+593 98 222 3344',
  ]);

  return { name: 'Matriculas', rows };
}

export function estudiantes(): FixtureSheet {
  return {
    name: 'Estudiantes',
    rows: [
      ['Estudiante', 'Cedula', 'Correo', 'Telefono'],
      ...ESTUDIANTES.map((e) => [e.nombre, e.cedula, e.correo, e.tel]),
    ],
  };
}

export function cursos(): FixtureSheet {
  return {
    name: 'Cursos',
    rows: [
      ['Curso', 'Codigo', 'Horas', 'Precio'],
      ...CURSOS.map((c) => [c.nombre, c.codigo, c.horas, c.precio]),
    ],
  };
}

export function docentes(): FixtureSheet {
  return {
    name: 'Docentes',
    rows: [['Docente', 'Correo'], ...DOCENTES.map((d) => [d.nombre, d.correo])],
  };
}

/** Y una pestana de leyenda vacia, como trae cualquier archivo real. */
export function libroAcademia(): FixtureSheet[] {
  return [matriculas(), estudiantes(), cursos(), docentes(), { name: 'Leyenda', rows: [] }];
}

export function planoAcademia(): ProposedBlueprint {
  return {
    applicationName: 'Academia',
    entities: [
      {
        name: 'estudiantes',
        label: 'Estudiantes',
        origin: 'sheet',
        sourceSheetIndex: 1,
        displayField: 'nombre',
        dedupeField: 'cedula',
        fields: [
          {
            name: 'nombre',
            label: 'Estudiante',
            type: 'text',
            required: true,
            source: { sheetIndex: 1, columnIndex: 0 },
          },
          {
            name: 'cedula',
            label: 'Cedula',
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
        ],
      },
      {
        name: 'cursos',
        label: 'Cursos',
        origin: 'sheet',
        sourceSheetIndex: 2,
        displayField: 'nombre',
        dedupeField: 'codigo',
        fields: [
          {
            name: 'nombre',
            label: 'Curso',
            type: 'text',
            required: true,
            source: { sheetIndex: 2, columnIndex: 0 },
          },
          {
            name: 'codigo',
            label: 'Codigo',
            type: 'text',
            required: true,
            source: { sheetIndex: 2, columnIndex: 1 },
          },
          {
            name: 'horas',
            label: 'Horas',
            type: 'integer',
            required: false,
            source: { sheetIndex: 2, columnIndex: 2 },
          },
          {
            name: 'precio',
            label: 'Precio',
            type: 'decimal',
            required: false,
            source: { sheetIndex: 2, columnIndex: 3 },
          },
        ],
      },
      {
        name: 'docentes',
        label: 'Docentes',
        origin: 'sheet',
        sourceSheetIndex: 3,
        displayField: 'nombre',
        dedupeField: 'nombre',
        fields: [
          {
            name: 'nombre',
            label: 'Docente',
            type: 'text',
            required: true,
            source: { sheetIndex: 3, columnIndex: 0 },
          },
          {
            name: 'correo',
            label: 'Correo',
            type: 'email',
            required: false,
            source: { sheetIndex: 3, columnIndex: 1 },
          },
        ],
      },
      {
        name: 'matriculas',
        label: 'Matriculas',
        origin: 'sheet',
        sourceSheetIndex: 0,
        displayField: 'fecha',
        fields: [
          {
            name: 'fecha',
            label: 'Fecha',
            type: 'date',
            required: true,
            source: { sheetIndex: 0, columnIndex: 0 },
          },
          {
            name: 'inscrito_el',
            label: 'Inscrito el',
            type: 'datetime',
            required: false,
            source: { sheetIndex: 0, columnIndex: 1 },
          },
          {
            name: 'estudiante',
            label: 'Estudiante',
            type: 'relation',
            required: false,
            targetEntity: 'estudiantes',
            source: { sheetIndex: 0, columnIndex: 2 },
          },
          {
            name: 'curso',
            label: 'Curso',
            type: 'relation',
            required: false,
            targetEntity: 'cursos',
            source: { sheetIndex: 0, columnIndex: 3 },
          },
          {
            name: 'docente',
            label: 'Docente',
            type: 'relation',
            required: false,
            targetEntity: 'docentes',
            source: { sheetIndex: 0, columnIndex: 4 },
          },
          {
            name: 'modalidad',
            label: 'Modalidad',
            type: 'select',
            required: false,
            options: MODALIDADES,
            source: { sheetIndex: 0, columnIndex: 5 },
          },
          {
            name: 'cuotas',
            label: 'Cuotas',
            type: 'integer',
            required: false,
            source: { sheetIndex: 0, columnIndex: 6 },
          },
          {
            name: 'valor',
            label: 'Valor',
            type: 'decimal',
            required: false,
            source: { sheetIndex: 0, columnIndex: 7 },
          },
          {
            name: 'becado',
            label: 'Becado',
            type: 'boolean',
            required: false,
            source: { sheetIndex: 0, columnIndex: 8 },
          },
          {
            name: 'contacto',
            label: 'Contacto',
            type: 'email',
            required: false,
            source: { sheetIndex: 0, columnIndex: 9 },
          },
          {
            name: 'telefono',
            label: 'Telefono',
            type: 'phone',
            required: false,
            source: { sheetIndex: 0, columnIndex: 10 },
          },
        ],
      },
    ],
    relations: [
      {
        fromEntity: 'matriculas',
        toEntity: 'estudiantes',
        fieldName: 'estudiante',
        type: 'many_to_one',
      },
      { fromEntity: 'matriculas', toEntity: 'cursos', fieldName: 'curso', type: 'many_to_one' },
      { fromEntity: 'matriculas', toEntity: 'docentes', fieldName: 'docente', type: 'many_to_one' },
    ],
  };
}
