import { PassThrough } from 'node:stream';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { writeXlsx, type XlsxColumn } from './xlsx-writer.js';

interface Row {
  name: string;
  amount: number;
}

const columns: XlsxColumn<Row>[] = [
  { header: '이름', width: 20, value: (r) => r.name },
  { header: '금액', width: 12, value: (r) => r.amount, numFmt: '#,##0' },
];

async function* gen(batches: Row[][]): AsyncIterable<Row[]> {
  for (const b of batches) yield b;
}

async function build(batches: Row[][]): Promise<ExcelJS.Worksheet> {
  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on('data', (c: Buffer) => chunks.push(c));
  await writeXlsx(out, '시트', columns, gen(batches));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.concat(chunks) as unknown as ExcelJS.Buffer);
  return wb.getWorksheet('시트')!;
}

describe('writeXlsx', () => {
  it('writes header row bold and frozen at ySplit 1, with column widths', async () => {
    const ws = await build([[{ name: 'a', amount: 1 }]]);
    expect(ws.getRow(1).getCell(1).value).toBe('이름');
    expect(ws.getRow(1).getCell(1).font?.bold).toBe(true);
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(ws.getColumn(1).width).toBe(20);
    expect(ws.getColumn(2).width).toBe(12);
  });

  it('number cell keeps numFmt #,##0; empty batches → header only', async () => {
    const ws = await build([[{ name: 'a', amount: 1234567 }]]);
    const cell = ws.getRow(2).getCell(2);
    expect(cell.value).toBe(1234567);
    expect(cell.numFmt).toBe('#,##0');
    const empty = await build([]);
    expect(empty.rowCount).toBe(1);
  });

  it('"=1+1" and "@SUM(A1)" stay string cells (no formula)', async () => {
    const ws = await build([
      [
        { name: '=1+1', amount: 1 },
        { name: '@SUM(A1)', amount: 2 },
      ],
    ]);
    for (const r of [2, 3]) {
      const cell = ws.getRow(r).getCell(1);
      expect(cell.type).toBe(ExcelJS.ValueType.String);
      expect(typeof cell.value).toBe('string');
    }
    expect(ws.getRow(2).getCell(1).value).toBe('=1+1');
    expect(ws.getRow(3).getCell(1).value).toBe('@SUM(A1)');
  });

  it('rows from multiple batches come out in order', async () => {
    const ws = await build([
      [
        { name: 'a', amount: 1 },
        { name: 'b', amount: 2 },
      ],
      [{ name: 'c', amount: 3 }],
    ]);
    expect([2, 3, 4].map((r) => ws.getRow(r).getCell(1).value)).toEqual(['a', 'b', 'c']);
  });
});
