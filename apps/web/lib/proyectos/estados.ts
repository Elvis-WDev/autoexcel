import {
  CircleCheck,
  CircleDashed,
  CircleX,
  FileSpreadsheet,
  Layers,
  Loader,
  PencilRuler,
  type LucideIcon,
} from 'lucide-react';
import type { TonoDeEstado } from '@/components/app/status-badge';

/**
 * Los doce estados del proceso, en lenguaje de negocio.
 *
 * El token del enum no sale nunca a pantalla: `reviewing_relations` no le dice
 * nada a quien subio un Excel. Los cuatro pasos de revision colapsan en uno
 * solo —"En revision"— porque desde la lista de proyectos da igual cual de los
 * cuatro sea; el detalle esta dentro del asistente.
 */
export interface VistaDeEstado {
  etiqueta: string;
  tono: TonoDeEstado;
  icono: LucideIcon;
  /** Anima el indicador: algo esta ocurriendo ahora mismo. */
  enCurso?: boolean;
}

const ESTADOS: Record<string, VistaDeEstado> = {
  draft: { etiqueta: 'Sin archivo', tono: 'neutro', icono: CircleDashed },
  uploaded: { etiqueta: 'Archivo cargado', tono: 'neutro', icono: FileSpreadsheet },
  sheet_selected: { etiqueta: 'Hojas elegidas', tono: 'neutro', icono: Layers },
  analyzing: { etiqueta: 'Analizando', tono: 'progreso', icono: Loader, enCurso: true },
  reviewing_entities: { etiqueta: 'En revision', tono: 'progreso', icono: PencilRuler },
  reviewing_fields: { etiqueta: 'En revision', tono: 'progreso', icono: PencilRuler },
  reviewing_relations: { etiqueta: 'En revision', tono: 'progreso', icono: PencilRuler },
  reviewing_summary: { etiqueta: 'En revision', tono: 'progreso', icono: PencilRuler },
  creating: { etiqueta: 'Creando', tono: 'progreso', icono: Loader, enCurso: true },
  importing: { etiqueta: 'Importando datos', tono: 'progreso', icono: Loader, enCurso: true },
  completed: { etiqueta: 'Lista', tono: 'exito', icono: CircleCheck },
  failed: { etiqueta: 'Fallo', tono: 'error', icono: CircleX },
};

/**
 * Un estado que no conocemos no puede romper la lista.
 *
 * Si el backend anade uno, lo peor que pasa es que se vea su nombre crudo en
 * gris, y no que la pantalla entera se caiga.
 */
export function vistaDeEstado(status: string): VistaDeEstado {
  return ESTADOS[status] ?? { etiqueta: status, tono: 'neutro', icono: CircleDashed };
}

/** `true` si el proyecto ya tiene aplicacion que abrir. */
export function estaTerminado(status: string): boolean {
  return status === 'completed';
}
