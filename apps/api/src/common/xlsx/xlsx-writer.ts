import type { Stream } from 'node:stream';
import ExcelJS from 'exceljs';

export interface XlsxColumn<T> {
  header: string;
  width: number;
  value: (row: T) => string | number | null;
  numFmt?: string;
}

/**
 * Streams batches into a single-sheet xlsx. String values are written as plain
 * strings (never formulas or rich text), so user input cannot become a formula.
 */
export async function writeXlsx<T>(
  out: NodeJS.WritableStream,
  sheetName: string,
  columns: XlsxColumn<T>[],
  batches: AsyncIterable<T[]>,
): Promise<void> {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: out as unknown as Stream, // exceljs types want a Stream; any Writable works
    useSharedStrings: false,
    useStyles: true,
  });
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = columns.map((c) => ({ header: c.header, width: c.width }));
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.commit();

  for await (const batch of batches) {
    for (const item of batch) {
      const row = sheet.addRow(columns.map((c) => c.value(item)));
      columns.forEach((c, i) => {
        if (c.numFmt) row.getCell(i + 1).numFmt = c.numFmt;
      });
      row.commit();
    }
  }
  sheet.commit();
  await workbook.commit();
}
