import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { productFixtures } from '@/shared/api/mocks/products';
import { useColumnVisibility } from '../model/column-visibility-store';
import { ProductTable } from './product-table';

function setup(over: Partial<React.ComponentProps<typeof ProductTable>> = {}) {
  const onSortChange = vi.fn();
  const onRetry = vi.fn();
  render(
    <ProductTable
      data={productFixtures.slice(0, 5)}
      isPending={false}
      isError={false}
      onRetry={onRetry}
      sort="createdAt:desc"
      onSortChange={onSortChange}
      {...over}
    />,
  );
  return { onSortChange, onRetry };
}

describe('ProductTable', () => {
  beforeEach(() => {
    useColumnVisibility.getState().reset();
    window.localStorage.clear();
  });

  it('renders rows, low stock badge, formatted price', () => {
    setup();
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(6);
    expect(screen.getByRole('link', { name: '테스트 상품 1' })).toHaveAttribute(
      'href',
      `/products/${productFixtures[0].id}`,
    );
    expect(screen.getByText('SKU-0001')).toBeInTheDocument();
    expect(screen.getByText('₩11,000')).toBeInTheDocument();
    expect(screen.getByText('2026.02.01')).toBeInTheDocument();
    // 5번째 상품은 재고 부족
    const row5 = within(rows[5]);
    expect(row5.getByText('부족')).toBeInTheDocument();
    expect(within(rows[1]).queryByText('부족')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: '테스트 상품 1' })).toBeInTheDocument();
    // 4번째는 썸네일 없음
    expect(screen.queryByRole('img', { name: '테스트 상품 4' })).not.toBeInTheDocument();
  });

  it('clicking 가격 header cycles price:asc → price:desc → createdAt:desc via onSortChange', async () => {
    const user = userEvent.setup();
    const a = setup({ sort: 'createdAt:desc' });
    await user.click(screen.getByRole('button', { name: /가격/ }));
    expect(a.onSortChange).toHaveBeenLastCalledWith('price:asc');
  });

  it('cycles from price:asc to price:desc and from price:desc to default', async () => {
    const user = userEvent.setup();
    const a = setup({ sort: 'price:asc' });
    await user.click(screen.getByRole('button', { name: /가격/ }));
    expect(a.onSortChange).toHaveBeenLastCalledWith('price:desc');
  });

  it('price:desc resets to createdAt:desc', async () => {
    const user = userEvent.setup();
    const a = setup({ sort: 'price:desc' });
    await user.click(screen.getByRole('button', { name: /가격/ }));
    expect(a.onSortChange).toHaveBeenLastCalledWith('createdAt:desc');
  });

  it('exposes aria-sort on headers', () => {
    setup({ sort: 'price:asc' });
    expect(screen.getByRole('columnheader', { name: /가격/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    expect(screen.getByRole('columnheader', { name: /재고/ })).toHaveAttribute('aria-sort', 'none');
  });

  it('shows empty state', () => {
    setup({ data: [] });
    expect(screen.getByText('조건에 맞는 상품이 없습니다')).toBeInTheDocument();
  });

  it('shows error with retry', async () => {
    const user = userEvent.setup();
    const { onRetry } = setup({ isError: true, data: undefined });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('shows skeleton while pending', () => {
    setup({ isPending: true, data: undefined });
    expect(screen.getAllByTestId('product-skeleton-row').length).toBeGreaterThan(0);
    expect(screen.queryByText('조건에 맞는 상품이 없습니다')).not.toBeInTheDocument();
  });

  it('hiding 카테고리 column persists in store and removes the column', async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.getByRole('columnheader', { name: '카테고리' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '컬럼' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: '카테고리' }));
    expect(screen.queryByRole('columnheader', { name: '카테고리' })).not.toBeInTheDocument();
    expect(useColumnVisibility.getState().visible.category).toBe(false);
    expect(window.localStorage.getItem('bo:product-table-columns')).toContain('"category":false');
    expect(screen.getByRole('columnheader', { name: /상품명/ })).toBeInTheDocument();
  });
});
