import ExcelJS from 'exceljs';
import type { Response, Test } from 'supertest';

/** Runs a supertest request, buffers the binary body and parses it as an xlsx workbook. */
export async function getXlsx(req: Test): Promise<{ res: Response; workbook: ExcelJS.Workbook }> {
  const res = await req.buffer(true).parse((r, cb) => {
    const chunks: Buffer[] = [];
    r.on('data', (c: Buffer) => chunks.push(c));
    r.on('end', () => cb(null, Buffer.concat(chunks)));
    r.on('error', (e: Error) => cb(e, null));
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(res.body as unknown as ExcelJS.Buffer);
  return { res, workbook };
}
