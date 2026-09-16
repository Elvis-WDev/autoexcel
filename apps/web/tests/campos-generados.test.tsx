import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CampoDelManifiesto } from '@/lib/api/aplicacion';
import { RENDERIZADORES, renderizadorDe } from '@/lib/aplicacion/campos';
import { comoTexto } from '@/lib/aplicacion/formato';

/** Los diez tipos del vocabulario cerrado de RF-08. */
const TIPOS = [
  'text',
  'integer',
  'decimal',
  'boolean',
  'date',
  'datetime',
  'email',
  'phone',
  'select',
  'relation',
];

function campo(parcial: Partial<CampoDelManifiesto> = {}): CampoDelManifiesto {
  return {
    name: 'campo',
    label: 'Campo',
    type: 'text',
    required: false,
    options: null,
    relatedTo: null,
    ...parcial,
  };
}

function pintarCelda(tipo: string, valor: unknown, etiquetaRelacionada: string | null = null) {
  const definicion = campo({ type: tipo });
  render(<>{renderizadorDe(tipo).celda({ campo: definicion, etiquetaRelacionada, valor })}</>);
}

describe('el registro de tipos', () => {
  /**
   * Si falta uno, la aplicacion generada de alguien pinta un campo como texto
   * crudo sin que nadie se entere.
   */
  it('cubre los diez tipos del vocabulario cerrado', () => {
    for (const tipo of TIPOS) {
      expect(RENDERIZADORES[tipo], `falta el renderizador de ${tipo}`).toBeDefined();
    }
    expect(Object.keys(RENDERIZADORES)).toHaveLength(10);
  });

  it('un tipo desconocido se trata como texto en vez de romper la pantalla', () => {
    expect(renderizadorDe('tipo_del_futuro')).toBe(RENDERIZADORES['text']);
  });

  it('los numeros se alinean a la derecha y el resto no', () => {
    expect(RENDERIZADORES['integer']?.alineacion).toBe('derecha');
    expect(RENDERIZADORES['decimal']?.alineacion).toBe('derecha');
    expect(RENDERIZADORES['text']?.alineacion).toBeUndefined();
  });
});

describe('las celdas', () => {
  it('formatea los numeros para es-EC', () => {
    pintarCelda('integer', 1234567);
    expect(screen.getByText('1.234.567')).toBeInTheDocument();
  });

  it('los decimales llevan dos cifras', () => {
    pintarCelda('decimal', 1234.5);
    expect(screen.getByText('1.234,50')).toBeInTheDocument();
  });

  /**
   * La fecha se lee del texto `YYYY-MM-DD` sin construir un instante: es la
   * misma precaucion que evito el desplazamiento de un dia en el backend.
   */
  it('una fecha de calendario conserva su dia', () => {
    pintarCelda('date', '2026-09-01');

    // Se afirma el dia y el anio, no la abreviatura del mes: esa es un detalle
    // del idioma que puede cambiar con la libreria. Lo que no puede cambiar es
    // que el 1 de septiembre se vea como el 1 y no como el 31 de agosto.
    const texto = screen.getByText(/2026/).textContent ?? '';
    expect(texto).toMatch(/^1 /);
    expect(texto).not.toContain('31');
  });

  it('una fecha invalida no inventa un dia', () => {
    pintarCelda('date', '2026-13-45');
    expect(screen.getByText('2026-13-45')).toBeInTheDocument();
  });

  /** El color nunca va solo: hay icono y palabra. */
  it('los si/no llevan palabra, no solo color', () => {
    pintarCelda('boolean', true);
    expect(screen.getByText('Si')).toBeInTheDocument();
  });

  /**
   * La regla mas importante de toda la aplicacion generada: se ve la etiqueta,
   * nunca el identificador.
   */
  it('una relacion muestra la etiqueta y jamas el UUID', () => {
    pintarCelda('relation', '3f1a5e20-0000-4000-8000-000000000000', 'Comercial Andes');

    expect(screen.getByText('Comercial Andes')).toBeInTheDocument();
    expect(screen.queryByText(/3f1a5e20/)).toBeNull();
  });

  it('una relacion sin etiqueta no ensena el identificador crudo', () => {
    pintarCelda('relation', '3f1a5e20-0000-4000-8000-000000000000', null);

    expect(screen.queryByText(/3f1a5e20/)).toBeNull();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it.each(['text', 'integer', 'decimal', 'date', 'datetime', 'email', 'phone', 'select'])(
    'un %s vacio se ve como una raya, no como "null"',
    (tipo) => {
      pintarCelda(tipo, null);
      expect(screen.getByText('—')).toBeInTheDocument();
    },
  );

  /** El backend ya se topo con esto: `[object Object]` en pantalla. */
  it('un objeto no imprime [object Object]', () => {
    expect(comoTexto({ cualquier: 'cosa' })).toBeNull();
    expect(comoTexto([1, 2])).toBeNull();
    expect(comoTexto(0)).toBe('0');
    expect(comoTexto(false)).toBe('false');
  });
});

describe('los esquemas de validacion', () => {
  it('un campo obligatorio rechaza el vacio y uno opcional lo acepta', () => {
    const obligatorio = renderizadorDe('text').esquema(campo({ required: true }));
    const opcional = renderizadorDe('text').esquema(campo({ required: false }));

    expect(obligatorio.safeParse(null).success).toBe(false);
    expect(opcional.safeParse(null).success).toBe(true);
  });

  /** El backend exige exactamente `AAAA-MM-DD`; aqui se comprueba antes. */
  it('la fecha exige el formato que el backend acepta', () => {
    const esquema = renderizadorDe('date').esquema(campo({ required: true }));

    expect(esquema.safeParse('2026-09-01').success).toBe(true);
    expect(esquema.safeParse('01/09/2026').success).toBe(false);
    expect(esquema.safeParse('2026-09-01T00:00:00Z').success).toBe(false);
  });

  it('la lista cerrada solo admite sus valores, y lo dice', () => {
    const esquema = renderizadorDe('select').esquema(
      campo({ required: true, options: ['Abierto', 'Cerrado'] }),
    );

    expect(esquema.safeParse('Abierto').success).toBe(true);

    const fallo = esquema.safeParse('Pendiente');
    expect(fallo.success).toBe(false);
    if (!fallo.success) {
      expect(fallo.error.issues[0]?.message).toContain('Abierto, Cerrado');
    }
  });

  it('una relacion exige un identificador, no texto libre', () => {
    const esquema = renderizadorDe('relation').esquema(campo({ required: true }));

    expect(esquema.safeParse('3f1a5e20-0000-4000-8000-000000000000').success).toBe(true);
    expect(esquema.safeParse('Comercial Andes').success).toBe(false);
  });

  it('los mensajes nombran el campo por su etiqueta, no por su nombre interno', () => {
    const esquema = renderizadorDe('integer').esquema(
      campo({ name: 'valor_total', label: 'Valor total', required: true }),
    );

    const fallo = esquema.safeParse('no es un numero');
    expect(fallo.success).toBe(false);
    if (!fallo.success) {
      expect(fallo.error.issues[0]?.message).toContain('Valor total');
      expect(fallo.error.issues[0]?.message).not.toContain('valor_total');
    }
  });
});
