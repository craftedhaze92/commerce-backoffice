import type { Logger } from '@nestjs/common';
import { EXPORT_LIMITS, type ExportTooLargeDetails } from '@bo/contracts';
import type { Response } from 'express';
import type { DataSource, EntityManager } from 'typeorm';
import { AppException } from '../app-exception.js';
import { kstDateOf } from '../kst-range.js';
import { contentDisposition } from './content-disposition.js';
import { writeXlsx, type XlsxColumn } from './xlsx-writer.js';

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** What an export reads inside the snapshot: the row count and one page of rows at a time. */
export interface ExportSource<T> {
  total: number;
  fetchBatch: (offset: number, limit: number) => Promise<T[]>;
}

export interface StreamExportOptions<T> {
  dataSource: DataSource;
  res: Response;
  logger: Logger;
  now: Date;
  /** File name stem (`주문목록`) and its ASCII fallback (`orders`); `_YYYYMMDD.xlsx` (KST) is appended. */
  filename: string;
  asciiFilename: string;
  sheetName: string;
  columns: XlsxColumn<T>[];
  /**
   * Runs inside the REPEATABLE READ transaction; every query must use `manager`.
   * Throwing here (e.g. a 400 for a bad sort) happens before any header is set.
   */
  open: (manager: EntityManager) => Promise<ExportSource<T>>;
}

/**
 * Streams a filtered list as a single-sheet xlsx: count and every batch share one REPEATABLE READ
 * snapshot; more than maxRows is a 422 before any byte is written.
 *
 * After headers are sent an error cannot become JSON, so a mid-stream failure is logged and the
 * response destroyed (the client never sees a truncated file as complete). If the client goes away
 * first, batch reads stop and the export settles without waiting on the xlsx writer, whose
 * finalization depends on a stream that will never finish; the transaction then ends and its
 * connection returns to the pool.
 */
export async function streamExport<T>(o: StreamExportOptions<T>): Promise<void> {
  const { res } = o;
  const gone = new AbortController();
  const onClose = () => {
    if (!res.writableFinished) gone.abort();
  };
  res.on('close', onClose);
  res.on('error', onClose);
  try {
    await o.dataSource.transaction('REPEATABLE READ', async (manager) => {
      const { total, fetchBatch } = await o.open(manager);
      if (total > EXPORT_LIMITS.maxRows) {
        const details: ExportTooLargeDetails = { total, maxRows: EXPORT_LIMITS.maxRows };
        throw new AppException(
          422,
          'EXPORT_TOO_LARGE',
          `Too many rows to export (${total} > ${EXPORT_LIMITS.maxRows})`,
          details,
        );
      }
      if (gone.signal.aborted) return;

      const day = kstDateOf(o.now).replaceAll('-', '');
      res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader(
        'Content-Disposition',
        contentDisposition(`${o.filename}_${day}.xlsx`, `${o.asciiFilename}_${day}.xlsx`),
      );

      // The batch query in flight, so an abort can wait for it before the transaction ends.
      let reading: Promise<unknown> = Promise.resolve();
      async function* batches(): AsyncGenerator<T[]> {
        for (let offset = 0; offset < total; offset += EXPORT_LIMITS.batchSize) {
          if (gone.signal.aborted) throw new Error('client disconnected');
          const pending = fetchBatch(offset, EXPORT_LIMITS.batchSize);
          reading = pending.catch(() => undefined);
          const rows = await pending;
          if (rows.length === 0) return;
          yield rows;
        }
      }

      const disconnected = new Promise<'disconnected'>((resolve) => {
        if (gone.signal.aborted) resolve('disconnected');
        gone.signal.addEventListener('abort', () => resolve('disconnected'), { once: true });
      });
      const written = writeXlsx(res, o.sheetName, o.columns, batches()).then(() => 'done' as const);
      try {
        if ((await Promise.race([written, disconnected])) === 'disconnected') {
          // `written` may never settle; Promise.race already handles its rejection.
          await reading;
          o.logger.warn(`${o.sheetName} export aborted: client disconnected`);
        }
      } catch (err) {
        if (gone.signal.aborted) {
          await reading;
          o.logger.warn(`${o.sheetName} export aborted: client disconnected`);
          return;
        }
        o.logger.error(
          `${o.sheetName} export failed mid-stream: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err.stack : undefined,
        );
        res.destroy(err instanceof Error ? err : new Error(String(err)));
      }
    });
  } finally {
    res.off('close', onClose);
    res.off('error', onClose);
  }
}
