import ExcelJS from 'exceljs';
import type {
  RawSheet,
  ReadLimits,
  SpreadsheetReader,
} from '../../application/ports/spreadsheet-reader.js';
import type { CellValue } from '../../domain/spreadsheet/cell.js';
import { AppError } from '../../domain/errors.js';
import { inspectZip, looksLikeWorkbook } from '../storage/zip-inspector.js';

/**
 * Lector de xlsx sobre ExcelJS.
 *
 * Por que ExcelJS y no SheetJS: la version de SheetJS publicada en npm
 * (`xlsx@0.18.5`) arrastra dos avisos de seguridad vigentes y sus versiones
 * corregidas solo se distribuyen desde el CDN del proveedor, fuera del registro
 * y fuera de las comprobaciones del lockfile. Para un componente cuyo trabajo es
 * parsear archivos que llegan de fuera, eso no compensa.
 *
 * Por que NO se usa su lector en streaming, que seria lo natural: falla con
 * libros de varias hojas. En `workbook-reader.js` decide parsear una hoja en
 * linea cuando ya tiene `sharedStrings` y `workbookRels`, pero lee
 * `this.model.sheets` sin comprobar que `this.model` exista, y `model` solo se
 * rellena al procesar `xl/workbook.xml`. Si esa entrada del ZIP llega despues de
 * las hojas, revienta. El orden de entradas lo decide quien genero el archivo
 * (Excel, LibreOffice, Google Sheets, una libreria...), no nosotros; el propio
 * ExcelJS escribe `xl/workbook.xml` al final. Leer varias hojas es el nucleo de
 * este producto, asi que no podemos depender de ese orden.
 *
 * La contrapartida de leer de una vez es la memoria, y por eso el techo se
 * comprueba ANTES de parsear, sobre los tamanos descomprimidos que el propio ZIP
 * declara. Es mejor garantia que abortar a media lectura: se sabe lo que va a
 * costar antes de empezar.
 */
export interface ExcelJsReaderOptions {
  /** Techo de expansion del archivo. Defensa contra el zip bomb. */
  maxUncompressedBytes: number;
}

export function createExcelJsReader(options: ExcelJsReaderOptions): SpreadsheetReader {
  return {
    async read(filePath: string, limits: ReadLimits): Promise<RawSheet[]> {
      const report = await inspectZip(filePath).catch(() => null);

      if (!report || !looksLikeWorkbook(report)) {
        throw unreadable();
      }

      if (report.uncompressedBytes > options.maxUncompressedBytes) {
        const megabytes = Math.floor(options.maxUncompressedBytes / (1024 * 1024));
        throw new AppError(
          'PAYLOAD_TOO_LARGE',
          `Este archivo contiene demasiada informacion para procesarlo (ocupa mas de ${megabytes} MB una vez abierto).`,
        );
      }

      const workbook = new ExcelJS.Workbook();

      try {
        await workbook.xlsx.readFile(filePath);
      } catch (error) {
        throw unreadable(error);
      }

      return workbook.worksheets
        .slice(0, limits.maxSheets)
        .map((worksheet, index) =>
          extractSheet(worksheet as unknown as LoadedWorksheet, index, limits),
        );
    },
  };
}

/** RE-01. El motivo real va al log; a la persona se le dice algo util. */
function unreadable(cause?: unknown): AppError {
  return new AppError(
    'UNSUPPORTED_FILE',
    'No pudimos leer este archivo. Comprueba que sea un archivo Excel valido e intentalo nuevamente.',
    cause === undefined ? {} : { cause },
  );
}

interface LoadedWorksheet {
  name: string;
  rowCount: number;
  getRow: (index: number) => {
    eachCell: (
      options: { includeEmpty: boolean },
      callback: (cell: { value: unknown }, columnNumber: number) => void,
    ) => void;
  };
}

function extractSheet(worksheet: LoadedWorksheet, index: number, limits: ReadLimits): RawSheet {
  const available = worksheet.rowCount;
  const readable = Math.min(available, limits.maxRowsPerSheet);
  const rows: CellValue[][] = [];

  // `getRow` es 1-based y devuelve una fila vacia para los huecos, que es justo
  // lo que hace falta: si los indices se desplazaran, la deteccion de
  // encabezados apuntaria a la fila equivocada.
  for (let rowNumber = 1; rowNumber <= readable; rowNumber += 1) {
    const cells: CellValue[] = [];

    worksheet.getRow(rowNumber).eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      if (columnNumber > limits.maxColumnsPerSheet) return;
      cells[columnNumber - 1] = toCellValue(cell.value);
    });

    for (let i = 0; i < cells.length; i += 1) {
      cells[i] = cells[i] ?? null;
    }

    rows.push(cells);
  }

  return {
    name: worksheet.name || `Hoja ${index + 1}`,
    index,
    rows,
    truncated: available > readable,
  };
}

/** Celda de ExcelJS -> valor del dominio. */
function toCellValue(value: unknown): CellValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'object') {
    const candidate = value as Record<string, unknown>;

    // Celda con formula: interesa el resultado, no la formula. El MVP no
    // interpreta logica embebida en Excel (ERS 4.2).
    if ('result' in candidate) return toCellValue(candidate['result']);
    // Texto enriquecido.
    if ('richText' in candidate && Array.isArray(candidate['richText'])) {
      return (candidate['richText'] as { text?: unknown }[])
        .map((part) => (typeof part.text === 'string' ? part.text : ''))
        .join('');
    }
    // Hipervinculo.
    if ('text' in candidate && typeof candidate['text'] === 'string') return candidate['text'];
    // Celda de error (#N/A, #REF!) -> se trata como vacia.
    if ('error' in candidate) return null;
  }

  return null;
}
