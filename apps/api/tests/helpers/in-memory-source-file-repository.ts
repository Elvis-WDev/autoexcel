import { randomUUID } from 'node:crypto';
import type {
  SaveIngestionInput,
  SheetLocator,
  SheetRecord,
  SheetSelectionChange,
  SourceFileRecord,
  SourceFileRepository,
} from '../../src/application/ports/source-file-repository.js';
import type { AnalyzedSheet } from '../../src/domain/spreadsheet/sheet-analysis.js';

export interface InMemorySourceFileRepository extends SourceFileRepository {
  files: SourceFileRecord[];
  sheetsByProject: Map<string, SheetRecord[]>;
}

export function createInMemorySourceFileRepository(): InMemorySourceFileRepository {
  const files: SourceFileRecord[] = [];
  const sheetsByProject = new Map<string, SheetRecord[]>();
  const sheetIndexById = new Map<string, { projectId: string; index: number }>();

  function toSheetRecord(sheet: AnalyzedSheet): SheetRecord {
    return {
      id: randomUUID(),
      name: sheet.name,
      index: sheet.index,
      rowCount: sheet.rowCount,
      headerRowIndex: sheet.headerRowIndex,
      included: sheet.included,
      columns: sheet.columns.map((column) => ({
        id: randomUUID(),
        index: column.index,
        header: column.header,
        normalizedHeader: column.normalizedHeader,
        profile: { ...column.profile },
      })),
    };
  }

  return {
    files,
    sheetsByProject,

    replaceIngestion(input: SaveIngestionInput): Promise<SourceFileRecord> {
      const existingIndex = files.findIndex((file) => file.projectId === input.projectId);
      if (existingIndex >= 0) files.splice(existingIndex, 1);

      const record: SourceFileRecord = {
        id: randomUUID(),
        projectId: input.projectId,
        ...input.file,
        createdAt: new Date(),
      };
      files.push(record);

      const sheets = input.sheets.map(toSheetRecord);
      sheetsByProject.set(input.projectId, sheets);
      for (const sheet of sheets) {
        sheetIndexById.set(sheet.id, { projectId: input.projectId, index: sheet.index });
      }

      return Promise.resolve(record);
    },

    findByProject(projectId: string): Promise<SourceFileRecord | null> {
      return Promise.resolve(files.find((file) => file.projectId === projectId) ?? null);
    },

    listSheets(projectId: string): Promise<SheetRecord[]> {
      return Promise.resolve(sheetsByProject.get(projectId) ?? []);
    },

    findSheet(projectId: string, sheetId: string): Promise<SheetLocator | null> {
      const located = sheetIndexById.get(sheetId);
      if (!located || located.projectId !== projectId) return Promise.resolve(null);

      const file = files.find((candidate) => candidate.projectId === projectId);
      if (!file) return Promise.resolve(null);

      return Promise.resolve({
        id: sheetId,
        index: located.index,
        storagePath: file.storagePath,
      });
    },

    replaceSheetAnalysis(sheetId: string, analysis: AnalyzedSheet): Promise<void> {
      const located = sheetIndexById.get(sheetId);
      if (!located) return Promise.resolve();

      const sheets = sheetsByProject.get(located.projectId) ?? [];
      const position = sheets.findIndex((sheet) => sheet.id === sheetId);
      if (position < 0) return Promise.resolve();

      const replaced = { ...toSheetRecord(analysis), id: sheetId };
      sheets[position] = replaced;

      return Promise.resolve();
    },

    applySheetSelection(projectId: string, changes: SheetSelectionChange[]): Promise<void> {
      const sheets = sheetsByProject.get(projectId) ?? [];

      for (const change of changes) {
        if (change.included === undefined) continue;
        const sheet = sheets.find((candidate) => candidate.id === change.sheetId);
        if (sheet) sheet.included = change.included;
      }

      return Promise.resolve();
    },
  };
}
