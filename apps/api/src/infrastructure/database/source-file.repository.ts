import type { AnalyzedSheet } from '../../domain/spreadsheet/sheet-analysis.js';
import type {
  SaveIngestionInput,
  SheetRecord,
  SheetLocator,
  SheetSelectionChange,
  SourceFileRecord,
  SourceFileRepository,
} from '../../application/ports/source-file-repository.js';
import type { PrismaClient } from './prisma.js';

export function createSourceFileRepository(prisma: PrismaClient): SourceFileRepository {
  return {
    /**
     * Sustituye el archivo del proyecto y todo su analisis en una transaccion.
     *
     * Borrar y volver a crear, en vez de reconciliar: volver a subir significa
     * empezar de cero, y el borrado en cascada se lleva hojas y columnas sin
     * dejar restos del archivo anterior. Si algo falla a mitad, no queda un
     * analisis mezclado de dos archivos distintos.
     */
    async replaceIngestion(input: SaveIngestionInput): Promise<SourceFileRecord> {
      return prisma.$transaction(async (tx) => {
        await tx.sourceFile.deleteMany({ where: { projectId: input.projectId } });

        return tx.sourceFile.create({
          data: {
            projectId: input.projectId,
            originalName: input.file.originalName,
            storagePath: input.file.storagePath,
            sizeBytes: input.file.sizeBytes,
            sha256: input.file.sha256,
            sheets: {
              create: input.sheets.map((sheet) => ({
                name: sheet.name,
                index: sheet.index,
                rowCount: sheet.rowCount,
                headerRowIndex: sheet.headerRowIndex,
                included: sheet.included,
                columns: {
                  create: sheet.columns.map((column) => ({
                    index: column.index,
                    header: column.header,
                    normalizedHeader: column.normalizedHeader,
                    profile: { ...column.profile },
                  })),
                },
              })),
            },
          },
        });
      });
    },

    async findByProject(projectId: string): Promise<SourceFileRecord | null> {
      return prisma.sourceFile.findFirst({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
      });
    },

    async listSheets(projectId: string): Promise<SheetRecord[]> {
      const sheets = await prisma.sheet.findMany({
        where: { sourceFile: { projectId } },
        orderBy: { index: 'asc' },
        include: { columns: { orderBy: { index: 'asc' } } },
      });

      return sheets.map((sheet) => ({
        id: sheet.id,
        name: sheet.name,
        index: sheet.index,
        rowCount: sheet.rowCount,
        headerRowIndex: sheet.headerRowIndex,
        included: sheet.included,
        columns: sheet.columns.map((column) => ({
          id: column.id,
          index: column.index,
          header: column.header,
          normalizedHeader: column.normalizedHeader,
          profile: column.profile,
        })),
      }));
    },

    async findSheet(projectId: string, sheetId: string): Promise<SheetLocator | null> {
      const sheet = await prisma.sheet.findFirst({
        where: { id: sheetId, sourceFile: { projectId } },
        include: { sourceFile: { select: { storagePath: true } } },
      });

      if (!sheet) return null;
      return { id: sheet.id, index: sheet.index, storagePath: sheet.sourceFile.storagePath };
    },

    async replaceSheetAnalysis(sheetId: string, analysis: AnalyzedSheet): Promise<void> {
      await prisma.$transaction(async (tx) => {
        await tx.sourceColumn.deleteMany({ where: { sheetId } });
        await tx.sheet.update({
          where: { id: sheetId },
          data: {
            rowCount: analysis.rowCount,
            headerRowIndex: analysis.headerRowIndex,
            included: analysis.included,
            columns: {
              create: analysis.columns.map((column) => ({
                index: column.index,
                header: column.header,
                normalizedHeader: column.normalizedHeader,
                profile: { ...column.profile },
              })),
            },
          },
        });
      });
    },

    async applySheetSelection(projectId: string, changes: SheetSelectionChange[]): Promise<void> {
      const relevant = changes.filter((change) => change.included !== undefined);
      if (relevant.length === 0) return;

      await prisma.$transaction(
        relevant.map((change) =>
          // El `where` incluye el proyecto: aunque llegue el identificador de
          // una hoja ajena, la actualizacion no encuentra nada que tocar.
          prisma.sheet.updateMany({
            where: { id: change.sheetId, sourceFile: { projectId } },
            data: { included: change.included },
          }),
        ),
      );
    },
  };
}
