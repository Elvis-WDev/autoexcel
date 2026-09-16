import type {
  AnalysisInput,
  AnalyzedSheetSignal,
} from '../../../domain/blueprint/analysis-input.js';
import { buildFallbackBlueprint } from '../../../domain/blueprint/fallback.js';
import type { BlueprintOrigin, ProposedBlueprint } from '../../../domain/blueprint/types.js';
import {
  profileKey,
  validateBlueprint,
  type ValidationIssue,
} from '../../../domain/blueprint/validator.js';
import { AppError } from '../../../domain/errors.js';
import { assertStatusIn } from '../../../domain/project-status.js';
import type { ColumnProfile } from '../../../domain/spreadsheet/column-profile.js';
import { normalizeValue } from '../../../domain/spreadsheet/normalization.js';
import { findColumnOverlaps, type ColumnValues } from '../../../domain/spreadsheet/overlap.js';
import { analyzeSheet } from '../../../domain/spreadsheet/sheet-analysis.js';
import type { BlueprintProposer } from '../../ports/blueprint-proposer.js';
import type { BlueprintRepository } from '../../ports/blueprint-repository.js';
import type { FileStorage } from '../../ports/file-storage.js';
import type { Logger } from '../../ports/logger.js';
import type { ProjectRepository } from '../../ports/project-repository.js';
import type { SourceFileRepository } from '../../ports/source-file-repository.js';
import type { ReadLimits, SpreadsheetReader } from '../../ports/spreadsheet-reader.js';
import { loadOwnedProject } from './ownership.js';

export interface AnalyzeProjectCommand {
  projectId: string;
  actorId: string;
}

export interface AnalysisOutcome {
  blueprint: ProposedBlueprint;
  origin: BlueprintOrigin;
  notes: ValidationIssue[];
}

export type AnalyzeProject = (command: AnalyzeProjectCommand) => Promise<AnalysisOutcome>;

export interface AnalyzeProjectDependencies {
  projects: ProjectRepository;
  sourceFiles: SourceFileRepository;
  blueprints: BlueprintRepository;
  storage: FileStorage;
  reader: SpreadsheetReader;
  limits: ReadLimits;
  proposer: BlueprintProposer | null;
  logger: Logger;
}

/**
 * Analiza el archivo y produce una propuesta de modelo (RF-05 a RF-11).
 *
 * Es la unica fase donde interviene la IA, y su papel esta acotado por tres
 * cosas que ocurren aqui dentro:
 *
 *   1. Antes de hablar con el modelo se calculan senales deterministas, entre
 *      ellas el solapamiento entre hojas, que es lo que permite construir UN
 *      modelo unificado en vez de uno por pestana.
 *   2. Lo que devuelve pasa por el validador del dominio. Si no pasa, se le
 *      devuelven los problemas y se le da una segunda oportunidad.
 *   3. Si vuelve a fallar, o si no hay motor configurado, o si el proveedor no
 *      responde, se usa el camino determinista de RE-04. El proceso NUNCA queda
 *      bloqueado por la IA.
 *
 * El resultado se persiste como borrador y el modelo no vuelve a invocarse en
 * toda la vida del proyecto (P-03).
 */
export function analyzeProjectUseCase(dependencies: AnalyzeProjectDependencies): AnalyzeProject {
  const { projects, sourceFiles, blueprints, storage, reader, limits, proposer, logger } =
    dependencies;

  return async ({ projectId, actorId }) => {
    const project = await loadOwnedProject(projects, projectId, actorId);
    // Quien arranca el trabajo ya movio el estado; aqui solo se comprueba que
    // sigue siendo el esperado, porque este caso de uso corre en diferido.
    assertStatusIn(project.status, ['analyzing']);

    const file = await sourceFiles.findByProject(projectId);
    if (!file) {
      throw AppError.invalidState('Todavia no has subido un archivo a este proyecto.');
    }

    const stored = await sourceFiles.listSheets(projectId);
    const included = stored.filter((sheet) => sheet.included);

    if (included.length === 0) {
      throw AppError.invalidState('Selecciona al menos una hoja antes de analizar.');
    }

    // Se relee el archivo porque el solapamiento entre hojas necesita los
    // conjuntos completos de valores, y el perfilado solo guarda veinte
    // ejemplos. Guardarlos todos abultaria la base de datos para algo que se
    // usa una vez.
    const rawSheets = await reader.read(storage.resolve(file.storagePath), limits);
    const byIndex = new Map(rawSheets.map((sheet) => [sheet.index, sheet]));

    const signals: AnalyzedSheetSignal[] = [];
    const columnValues: ColumnValues[] = [];
    const profiles = new Map<string, ColumnProfile>();

    for (const sheet of included) {
      const raw = byIndex.get(sheet.index);
      if (!raw) continue;

      const analysis = analyzeSheet({
        name: raw.name,
        index: raw.index,
        rows: raw.rows,
        truncated: raw.truncated,
        forcedHeaderRowIndex: sheet.headerRowIndex,
      });

      if (analysis.columns.length === 0) continue;

      signals.push({
        index: analysis.index,
        name: analysis.name,
        rowCount: analysis.rowCount,
        columns: analysis.columns.map((column) => ({
          index: column.index,
          header: column.header,
          normalizedHeader: column.normalizedHeader,
          profile: column.profile,
        })),
      });

      const dataRows = raw.rows.slice((analysis.headerRowIndex ?? 0) + 1);

      for (const column of analysis.columns) {
        profiles.set(profileKey(analysis.index, column.index), column.profile);

        const values = new Set<string>();
        for (const row of dataRows) {
          const value = row[column.index];
          if (value === undefined || value === null) continue;
          const normalized = normalizeValue(value);
          if (normalized.length > 0) values.add(normalized);
        }

        columnValues.push({
          sheetIndex: analysis.index,
          columnIndex: column.index,
          header: column.header,
          values,
        });
      }
    }

    if (signals.length === 0) {
      throw AppError.validation(
        'No pudimos identificar columnas utilizables en las hojas seleccionadas.',
      );
    }

    const input: AnalysisInput = {
      fileName: file.originalName,
      sheets: signals,
      overlaps: findColumnOverlaps(columnValues),
    };

    const context = {
      profiles,
      includedSheetIndexes: new Set(signals.map((sheet) => sheet.index)),
    };

    const outcome = await proposeWithGuards(input, context);

    await blueprints.replace({
      projectId,
      applicationName: outcome.blueprint.applicationName,
      origin: outcome.origin,
      notes: outcome.notes,
      blueprint: outcome.blueprint,
    });

    await projects.updateStatus(projectId, 'reviewing_entities', null);

    logger.info('Analisis completado', {
      projectId,
      origin: outcome.origin,
      entities: outcome.blueprint.entities.length,
      relations: outcome.blueprint.relations.length,
      overlaps: input.overlaps.length,
      repairs: outcome.notes.filter((note) => note.severity === 'repair').length,
    });

    return outcome;
  };

  /**
   * Propone, valida, repara una vez y, si nada de eso sale, cae al camino
   * determinista. Nunca lanza por culpa del motor de inferencia.
   */
  async function proposeWithGuards(
    input: AnalysisInput,
    context: { profiles: Map<string, ColumnProfile>; includedSheetIndexes: Set<number> },
  ): Promise<AnalysisOutcome> {
    const fallback = (reason: string, notes: ValidationIssue[] = []): AnalysisOutcome => {
      logger.warn('Se usa la estructura simple de RE-04', { reason });

      const simple = buildFallbackBlueprint(applicationNameFrom(input.fileName), input.sheets);
      const validated = validateBlueprint(simple, context);

      return {
        blueprint: validated.blueprint,
        origin: 'fallback',
        notes: [
          ...notes,
          {
            severity: 'repair',
            code: 'FALLBACK_USED',
            message:
              'No pudimos identificar grupos claros en este archivo. Empezamos con una estructura simple que puedes ajustar.',
          },
          ...validated.issues,
        ],
      };
    };

    if (!proposer) return fallback('motor de inferencia no configurado');

    let first;
    try {
      first = await proposer.propose(input);
    } catch (error) {
      return fallback(error instanceof Error ? error.message : 'error del proveedor');
    }

    const firstCheck = validateBlueprint(first.blueprint, context);
    if (firstCheck.ok) {
      return { blueprint: firstCheck.blueprint, origin: 'inferred', notes: firstCheck.issues };
    }

    const problems = firstCheck.issues
      .filter((issue) => issue.severity === 'error')
      .map((issue) => `${issue.path ? `${issue.path}: ` : ''}${issue.message}`);

    logger.warn('La propuesta no paso el validador; se pide reparacion', {
      problems: problems.length,
    });

    let second;
    try {
      second = await proposer.repair({ input, previous: first.blueprint, problems });
    } catch (error) {
      return fallback(error instanceof Error ? error.message : 'error del proveedor al reparar');
    }

    const secondCheck = validateBlueprint(second.blueprint, context);
    if (secondCheck.ok) {
      return { blueprint: secondCheck.blueprint, origin: 'inferred', notes: secondCheck.issues };
    }

    return fallback('la propuesta no paso el validador dos veces');
  }
}

/** `viajes-2026.xlsx` -> `Viajes 2026`. */
function applicationNameFrom(fileName: string): string {
  const base = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (base.length === 0) return 'Mi aplicacion';
  return base.charAt(0).toUpperCase() + base.slice(1);
}
