import type { EntityManager } from 'typeorm';
import { formatOrderNo, kstDay, nextOrderNo } from './order-number.js';

describe('order number', () => {
  it('uses the KST calendar date', () => {
    expect(kstDay(new Date('2026-11-20T14:59:59Z'))).toBe('2026-11-20');
    expect(kstDay(new Date('2026-11-20T15:00:00Z'))).toBe('2026-11-21');
  });

  it('pads to 4 digits and grows beyond', () => {
    expect(formatOrderNo('2026-11-21', 1)).toBe('ORD-20261121-0001');
    expect(formatOrderNo('2026-11-21', 12345)).toBe('ORD-20261121-12345');
  });

  it('nextOrderNo queries the sequence with the KST day', async () => {
    const query = vi.fn().mockResolvedValue([{ last: 7 }]);
    const no = await nextOrderNo(
      { query } as unknown as EntityManager,
      new Date('2026-11-20T15:30:00Z'),
    );
    expect(no).toBe('ORD-20261121-0007');
    expect(query.mock.calls[0]![1]).toEqual(['2026-11-21']);
  });
});
