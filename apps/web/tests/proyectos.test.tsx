import { describe, expect, it } from 'vitest';
import { vistaDeEstado } from '@/lib/proyectos/estados';
import { haceCuanto } from '@/lib/formato/fechas';
import { tamanoLegible } from '@/lib/formato/tamano';

describe('los doce estados del proceso', () => {
  const TODOS = [
    'draft',
    'uploaded',
    'sheet_selected',
    'analyzing',
    'reviewing_entities',
    'reviewing_fields',
    'reviewing_relations',
    'reviewing_summary',
    'creating',
    'importing',
    'completed',
    'failed',
  ];

  /** El token del enum no le dice nada a quien subio un Excel. */
  it('ninguno deja escapar el nombre tecnico', () => {
    for (const estado of TODOS) {
      const vista = vistaDeEstado(estado);
      expect(vista.etiqueta).not.toBe(estado);
      expect(vista.etiqueta).not.toMatch(/_/);
    }
  });

  it('los cuatro pasos de revision se ven igual desde la lista', () => {
    const revisiones = TODOS.filter((e) => e.startsWith('reviewing_'));
    const etiquetas = new Set(revisiones.map((e) => vistaDeEstado(e).etiqueta));

    // Desde la lista da igual cual de los cuatro sea; el detalle esta dentro.
    expect(etiquetas).toEqual(new Set(['En revision']));
  });

  it('solo lo terminado es exito y solo el fallo es destructivo', () => {
    expect(vistaDeEstado('completed').tono).toBe('exito');
    expect(vistaDeEstado('failed').tono).toBe('error');
    expect(vistaDeEstado('draft').tono).toBe('neutro');
  });

  it('lo que esta ocurriendo ahora se anima', () => {
    expect(vistaDeEstado('analyzing').enCurso).toBe(true);
    expect(vistaDeEstado('importing').enCurso).toBe(true);
    expect(vistaDeEstado('completed').enCurso).toBeUndefined();
  });

  /** Si el backend anade un estado, la lista no puede caerse por eso. */
  it('un estado desconocido no rompe nada', () => {
    const vista = vistaDeEstado('estado_del_futuro');

    expect(vista.etiqueta).toBe('estado_del_futuro');
    expect(vista.tono).toBe('neutro');
    expect(vista.icono).toBeDefined();
  });
});

describe('formato', () => {
  it('lo reciente se lee en relativo', () => {
    const haceDosHoras = new Date(Date.now() - 2 * 3600_000).toISOString();
    expect(haceCuanto(haceDosHoras)).toMatch(/hace/);
  });

  /** "hace 8 meses" no situa nada; una fecha si. */
  it('lo viejo pasa a fecha absoluta', () => {
    const haceUnAnio = new Date(Date.now() - 400 * 86_400_000).toISOString();
    const texto = haceCuanto(haceUnAnio);

    expect(texto).not.toMatch(/hace/);
    expect(texto).toMatch(/\d{4}/);
  });

  it('una fecha ilegible no imprime "Invalid Date"', () => {
    expect(haceCuanto('cualquier cosa')).toBe('—');
  });

  it('los tamanos usan coma decimal', () => {
    expect(tamanoLegible(0)).toBe('0 B');
    expect(tamanoLegible(1024)).toBe('1,0 KB');
    expect(tamanoLegible(20 * 1024 * 1024)).toBe('20,0 MB');
    expect(tamanoLegible(512)).toBe('512 B');
  });
});
