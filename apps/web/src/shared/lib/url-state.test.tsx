import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { z } from 'zod';
import { useUrlState } from './url-state';

const replace = vi.fn();
let search = '';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/products',
  useSearchParams: () => new URLSearchParams(search),
}));

const schema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  q: z.string().max(50).catch(''),
});

describe('useUrlState', () => {
  beforeEach(() => {
    replace.mockClear();
    search = '';
  });

  it('parses and falls back on invalid values (?page=abc → 1)', () => {
    search = 'page=abc&q=shoe';
    const { result } = renderHook(() => useUrlState(schema));
    expect(result.current[0]).toEqual({ page: 1, q: 'shoe' });
  });

  it('setter writes non-default keys and resets page', () => {
    search = 'page=3&q=a';
    const { result } = renderHook(() => useUrlState(schema));
    result.current[1]({ q: 'b' });
    expect(replace).toHaveBeenCalledWith('/products?q=b', { scroll: false });
  });

  it('setter with resetPage:false keeps page', () => {
    search = 'page=3&q=a';
    const { result } = renderHook(() => useUrlState(schema));
    result.current[1]({ page: 4 }, { resetPage: false });
    expect(replace).toHaveBeenCalledWith('/products?page=4&q=a', { scroll: false });
  });

  it('removes keys equal to default', () => {
    search = 'q=a';
    const { result } = renderHook(() => useUrlState(schema));
    result.current[1]({ q: '' });
    expect(replace).toHaveBeenCalledWith('/products', { scroll: false });
  });

  it('removes page when set to the default 1', () => {
    search = 'page=3';
    const { result } = renderHook(() => useUrlState(schema));
    result.current[1]({ page: 1 }, { resetPage: false });
    expect(replace).toHaveBeenCalledWith('/products', { scroll: false });
  });

  it('two set() calls before a re-render both land in the final URL', () => {
    const { result } = renderHook(() => useUrlState(schema));
    act(() => {
      result.current[1]({ q: 'shoe' });
      result.current[1]({ page: 2 }, { resetPage: false });
    });
    expect(replace).toHaveBeenLastCalledWith('/products?q=shoe&page=2', { scroll: false });
  });
});
