/**
 * Un libro de contabilidad como los que se usan de verdad.
 *
 * Los otros tres escenarios prueban el sistema. Este prueba otra cosa: si el
 * modelo que sale se parece a como trabaja un contador. Por eso la estructura
 * no es inventada, es la de siempre:
 *
 *   Plan de Cuentas  el catalogo. Todo movimiento apunta a una cuenta.
 *   Terceros         clientes y proveedores, con su RUC.
 *   Comprobantes     la cabecera del asiento: numero, fecha, tercero, total.
 *   Movimientos      el detalle, por partida doble: cada linea debe o haber.
 *   Facturas         la venta, que es otro documento distinto del asiento.
 *
 * Las relaciones estan donde un contador las espera, y se sostienen en valores
 * que coinciden de verdad entre hojas —un comprobante referencia su numero, un
 * movimiento su codigo de cuenta— porque eso es lo que el analisis detecta.
 *
 * Trae ademas tres cosas que tiene cualquier archivo real y que es donde se ve
 * si el sistema sirve:
 *
 *   - RUC con cero a la izquierda. Guardarlos como numero los destruye.
 *   - Codigos de cuenta con puntos: `1.1.01`, que no es un numero.
 *   - Filas sucias: una fecha que no lo es y un importe escrito a mano.
 */
import type { FixtureSheet } from '../../tests/helpers/xlsx-fixtures.js';

// ---------------------------------------------------------------------------
// Catalogos
// ---------------------------------------------------------------------------

interface Cuenta {
  codigo: string;
  nombre: string;
  tipo: string;
  naturaleza: string;
}

const CUENTAS: Cuenta[] = [
  { codigo: '1.1.01', nombre: 'Caja General', tipo: 'Activo', naturaleza: 'Deudora' },
  { codigo: '1.1.02', nombre: 'Bancos', tipo: 'Activo', naturaleza: 'Deudora' },
  { codigo: '1.1.03', nombre: 'Cuentas por Cobrar', tipo: 'Activo', naturaleza: 'Deudora' },
  { codigo: '1.1.04', nombre: 'Credito Tributario IVA', tipo: 'Activo', naturaleza: 'Deudora' },
  { codigo: '1.1.05', nombre: 'Inventario de Mercaderia', tipo: 'Activo', naturaleza: 'Deudora' },
  { codigo: '1.2.01', nombre: 'Muebles y Enseres', tipo: 'Activo', naturaleza: 'Deudora' },
  { codigo: '2.1.01', nombre: 'Cuentas por Pagar', tipo: 'Pasivo', naturaleza: 'Acreedora' },
  { codigo: '2.1.02', nombre: 'IVA por Pagar', tipo: 'Pasivo', naturaleza: 'Acreedora' },
  { codigo: '2.1.03', nombre: 'Retenciones por Pagar', tipo: 'Pasivo', naturaleza: 'Acreedora' },
  { codigo: '2.1.04', nombre: 'Sueldos por Pagar', tipo: 'Pasivo', naturaleza: 'Acreedora' },
  { codigo: '3.1.01', nombre: 'Capital Social', tipo: 'Patrimonio', naturaleza: 'Acreedora' },
  {
    codigo: '3.2.01',
    nombre: 'Resultados Acumulados',
    tipo: 'Patrimonio',
    naturaleza: 'Acreedora',
  },
  { codigo: '4.1.01', nombre: 'Ventas de Servicios', tipo: 'Ingreso', naturaleza: 'Acreedora' },
  { codigo: '4.1.02', nombre: 'Ventas de Mercaderia', tipo: 'Ingreso', naturaleza: 'Acreedora' },
  { codigo: '5.1.01', nombre: 'Costo de Ventas', tipo: 'Gasto', naturaleza: 'Deudora' },
  { codigo: '5.2.01', nombre: 'Sueldos y Salarios', tipo: 'Gasto', naturaleza: 'Deudora' },
  { codigo: '5.2.02', nombre: 'Arriendo', tipo: 'Gasto', naturaleza: 'Deudora' },
  { codigo: '5.2.03', nombre: 'Servicios Basicos', tipo: 'Gasto', naturaleza: 'Deudora' },
  { codigo: '5.2.04', nombre: 'Suministros de Oficina', tipo: 'Gasto', naturaleza: 'Deudora' },
  { codigo: '5.2.05', nombre: 'Honorarios Profesionales', tipo: 'Gasto', naturaleza: 'Deudora' },
];

interface Tercero {
  razon: string;
  ruc: string;
  tipo: string;
  correo: string;
  telefono: string;
  ciudad: string;
}

/** Tres de los ocho RUC empiezan por cero. Es deliberado. */
const TERCEROS: Tercero[] = [
  {
    razon: 'Comercial Andes S.A.',
    ruc: '1790012345001',
    tipo: 'Cliente',
    correo: 'facturacion@andes.test',
    telefono: '+593 2 245 6789',
    ciudad: 'Quito',
  },
  {
    razon: 'Distribuidora del Norte Cia. Ltda.',
    ruc: '0990054321001',
    tipo: 'Cliente',
    correo: 'cobros@norte.test',
    telefono: '+593 4 238 1122',
    ciudad: 'Guayaquil',
  },
  {
    razon: 'Constructora Pacifico S.A.',
    ruc: '0190098765001',
    tipo: 'Cliente',
    correo: 'pagos@pacifico.test',
    telefono: '+593 7 288 3344',
    ciudad: 'Cuenca',
  },
  {
    razon: 'Servicios Integrales Loja',
    ruc: '1190023456001',
    tipo: 'Cliente',
    correo: 'admin@sil.test',
    telefono: '+593 7 257 8899',
    ciudad: 'Loja',
  },
  {
    razon: 'Papeleria Central',
    ruc: '0990087654001',
    tipo: 'Proveedor',
    correo: 'ventas@papeleria.test',
    telefono: '+593 4 229 5566',
    ciudad: 'Guayaquil',
  },
  {
    razon: 'Inmobiliaria Rocafuerte',
    ruc: '1790045678001',
    tipo: 'Proveedor',
    correo: 'arriendos@rocafuerte.test',
    telefono: '+593 2 250 1133',
    ciudad: 'Quito',
  },
  {
    razon: 'Estudio Contable Vera & Asociados',
    ruc: '1390076543001',
    tipo: 'Proveedor',
    correo: 'contacto@vera.test',
    telefono: '+593 5 262 4477',
    ciudad: 'Manta',
  },
  {
    razon: 'Electrica del Austro',
    ruc: '0190034567001',
    tipo: 'Proveedor',
    correo: 'servicios@austro.test',
    telefono: '+593 7 280 9900',
    ciudad: 'Cuenca',
  },
];

const CLIENTES = TERCEROS.filter((t) => t.tipo === 'Cliente');
const PROVEEDORES = TERCEROS.filter((t) => t.tipo === 'Proveedor');

const FORMAS_DE_PAGO = ['Efectivo', 'Transferencia', 'Cheque', 'Credito 30 dias'];
const ESTADOS_COMPROBANTE = ['Borrador', 'Contabilizado', 'Anulado'];

function fecha(indice: number): string {
  const mes = String((indice % 6) + 1).padStart(2, '0');
  const dia = String((indice % 27) + 1).padStart(2, '0');
  return `2026-${mes}-${dia}`;
}

function dinero(valor: number): number {
  return Number(valor.toFixed(2));
}

// ---------------------------------------------------------------------------
// Hojas
// ---------------------------------------------------------------------------

export function planDeCuentas(): FixtureSheet {
  return {
    name: 'Plan de Cuentas',
    rows: [
      ['Codigo', 'Cuenta', 'Tipo', 'Naturaleza'],
      ...CUENTAS.map((c) => [c.codigo, c.nombre, c.tipo, c.naturaleza]),
    ],
  };
}

export function terceros(): FixtureSheet {
  return {
    name: 'Terceros',
    rows: [
      ['Razon Social', 'RUC', 'Tipo', 'Correo', 'Telefono', 'Ciudad'],
      ...TERCEROS.map((t) => [t.razon, t.ruc, t.tipo, t.correo, t.telefono, t.ciudad]),
    ],
  };
}

/** Un asiento por comprobante: la cabecera aqui, el detalle en Movimientos. */
interface Comprobante {
  numero: string;
  fecha: string;
  tipo: string;
  tercero: Tercero;
  concepto: string;
  total: number;
  estado: string;
  cuentaDebe: Cuenta;
  cuentaHaber: Cuenta;
}

function comprobantes(): Comprobante[] {
  const lista: Comprobante[] = [];

  const gastos = CUENTAS.filter((c) => c.tipo === 'Gasto');
  const ingresos = CUENTAS.filter((c) => c.tipo === 'Ingreso');
  const caja = CUENTAS.find((c) => c.codigo === '1.1.02')!;
  const porCobrar = CUENTAS.find((c) => c.codigo === '1.1.03')!;
  const porPagar = CUENTAS.find((c) => c.codigo === '2.1.01')!;

  for (let i = 0; i < 120; i += 1) {
    const esEgreso = i % 3 !== 0;

    if (esEgreso) {
      const proveedor = PROVEEDORES[i % PROVEEDORES.length]!;
      const cuenta = gastos[i % gastos.length]!;
      lista.push({
        numero: `CE-2026-${String(i + 1).padStart(4, '0')}`,
        fecha: fecha(i),
        tipo: 'Egreso',
        tercero: proveedor,
        concepto: `${cuenta.nombre} - ${proveedor.razon.split(' ')[0]}`,
        total: dinero(45 + (i % 37) * 18.75),
        estado: ESTADOS_COMPROBANTE[i % 11 === 0 ? 0 : i % 29 === 0 ? 2 : 1]!,
        cuentaDebe: cuenta,
        cuentaHaber: i % 2 === 0 ? caja : porPagar,
      });
    } else {
      const cliente = CLIENTES[i % CLIENTES.length]!;
      const cuenta = ingresos[i % ingresos.length]!;
      lista.push({
        numero: `CI-2026-${String(i + 1).padStart(4, '0')}`,
        fecha: fecha(i),
        tipo: 'Ingreso',
        tercero: cliente,
        concepto: `${cuenta.nombre} - ${cliente.razon.split(' ')[0]}`,
        total: dinero(180 + (i % 41) * 26.4),
        estado: ESTADOS_COMPROBANTE[i % 13 === 0 ? 0 : 1]!,
        cuentaDebe: i % 2 === 0 ? caja : porCobrar,
        cuentaHaber: cuenta,
      });
    }
  }

  return lista;
}

const COMPROBANTES = comprobantes();

export function hojaComprobantes(): FixtureSheet {
  const rows: FixtureSheet['rows'] = [
    ['Numero', 'Fecha', 'Tipo', 'Tercero', 'Concepto', 'Total', 'Estado', 'Conciliado'],
  ];

  for (const [i, c] of COMPROBANTES.entries()) {
    rows.push([
      c.numero,
      c.fecha,
      c.tipo,
      // Una de cada nueve escribe el tercero con otro espaciado. Si no se
      // normaliza, apareceran terceros duplicados que no existen.
      i % 9 === 0 ? `  ${c.tercero.razon}  ` : c.tercero.razon,
      c.concepto,
      c.total,
      c.estado,
      i % 4 === 0 ? 'No' : 'Si',
    ]);
  }

  // Las dos filas sucias que trae cualquier archivo real.
  rows.push([
    'CE-2026-0121',
    'por confirmar',
    'Egreso',
    'Papeleria Central',
    'Suministros de Oficina - Papeleria',
    88.4,
    'Borrador',
    'No',
  ]);
  rows.push([
    'CI-2026-0122',
    '2026-06-28',
    'Ingreso',
    'Comercial Andes S.A.',
    'Ventas de Servicios - Comercial',
    'pendiente de cierre',
    'Borrador',
    'No',
  ]);

  return { name: 'Comprobantes', rows };
}

/** Partida doble: dos lineas por comprobante, y cuadran. */
export function movimientos(): FixtureSheet {
  const rows: FixtureSheet['rows'] = [
    ['Comprobante', 'Cuenta', 'Nombre de Cuenta', 'Detalle', 'Debe', 'Haber'],
  ];

  for (const c of COMPROBANTES) {
    rows.push([c.numero, c.cuentaDebe.codigo, c.cuentaDebe.nombre, c.concepto, c.total, 0]);
    rows.push([c.numero, c.cuentaHaber.codigo, c.cuentaHaber.nombre, c.concepto, 0, c.total]);
  }

  return { name: 'Movimientos', rows };
}

/** La venta es un documento distinto del asiento, y asi se lleva. */
export function facturas(): FixtureSheet {
  const rows: FixtureSheet['rows'] = [
    ['Numero', 'Fecha', 'Cliente', 'Subtotal', 'IVA', 'Total', 'Forma de Pago', 'Cobrada'],
  ];

  for (let i = 0; i < 64; i += 1) {
    const cliente = CLIENTES[i % CLIENTES.length]!;
    const subtotal = dinero(120 + (i % 33) * 31.5);
    const iva = dinero(subtotal * 0.15);

    rows.push([
      `001-001-${String(i + 1).padStart(9, '0')}`,
      fecha(i),
      cliente.razon,
      subtotal,
      iva,
      dinero(subtotal + iva),
      FORMAS_DE_PAGO[i % FORMAS_DE_PAGO.length]!,
      i % 3 === 0 ? 'No' : 'Si',
    ]);
  }

  return { name: 'Facturas', rows };
}

/** La pestana de notas que nadie borra. Se descarta sola. */
export function notas(): FixtureSheet {
  return { name: 'Notas', rows: [] };
}

export function libroContabilidad(): FixtureSheet[] {
  return [planDeCuentas(), terceros(), hojaComprobantes(), movimientos(), facturas(), notas()];
}
