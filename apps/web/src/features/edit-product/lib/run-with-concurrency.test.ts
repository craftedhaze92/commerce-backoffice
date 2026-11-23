import { describe, expect, it } from 'vitest';
import { runWithConcurrency } from './run-with-concurrency';

describe('runWithConcurrency', () => {
  it('runs every item with at most `limit` in flight', async () => {
    let inFlight = 0;
    let peak = 0;
    const done: number[] = [];
    await runWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      done.push(n);
    });
    expect(peak).toBe(3);
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('keeps going when a worker rejects', async () => {
    const done: number[] = [];
    await runWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 1) throw new Error('boom');
      done.push(n);
    });
    expect(done.sort()).toEqual([2, 3]);
  });

  it('resolves immediately for an empty list', async () => {
    await expect(runWithConcurrency([], 3, async () => {})).resolves.toBeUndefined();
  });
});
