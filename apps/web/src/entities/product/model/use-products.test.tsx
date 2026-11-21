import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/shared/testing/msw-server';
import { QueryTestProvider } from '@/shared/testing/render-with-query';
import { useProducts } from './use-products';
import { useProduct } from './use-product';
import { productKeys } from './query-keys';
import { productDetailFixture } from '@/shared/api/mocks/products';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryTestProvider>{children}</QueryTestProvider>
);
const params = { page: 1, size: 5, q: '', lowStock: false, sort: 'createdAt:desc' } as const;

describe('product queries', () => {
  it('productKeys are stable', () => {
    expect(productKeys.all).toEqual(['products']);
    expect(productKeys.list(params)).toEqual(['products', 'list', params]);
    expect(productKeys.detail('x')).toEqual(['products', 'detail', 'x']);
  });

  it('useProducts fetches with the query string', async () => {
    let url = '';
    server.use(
      http.get('/api/v1/products', ({ request }) => {
        url = request.url;
        return HttpResponse.json({
          items: [],
          meta: { page: 1, size: 5, total: 0, totalPages: 0 },
        });
      }),
    );
    const { result } = renderHook(() => useProducts(params), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(new URL(url).search).toBe('?size=5');
  });

  it('useProduct is disabled without id and fetches with id', async () => {
    const { result: idle } = renderHook(() => useProduct(undefined), {
      wrapper,
    });
    expect(idle.current.fetchStatus).toBe('idle');
    const { result } = renderHook(() => useProduct(productDetailFixture.id), {
      wrapper,
    });
    await waitFor(() => expect(result.current.data?.id).toBe(productDetailFixture.id));
  });
});
