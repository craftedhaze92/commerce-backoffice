import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { orderFixtures } from '@/shared/api/mocks/orders';
import { OrderTable } from './order-table';

const baseProps = {
  data: orderFixtures.slice(0, 5),
  isPending: false,
  isError: false,
  onRetry: vi.fn(),
  sort: 'createdAt:desc',
  onSortChange: vi.fn(),
};

describe('OrderTable', () => {
  it('renders rows with link, badge, won and KST datetime', () => {
    render(<OrderTable {...baseProps} />);
    expect(screen.getAllByRole('row')).toHaveLength(6);
    const first = orderFixtures[0];
    expect(screen.getByRole('link', { name: first.orderNo })).toHaveAttribute(
      'href',
      `/orders/${first.id}`,
    );
    const row = within(screen.getAllByRole('row')[1]);
    expect(row.getByText(first.customerName)).toBeInTheDocument();
    expect(row.getByText('접수')).toBeInTheDocument();
    expect(row.getByText('₩31,000')).toBeInTheDocument();
    // 2026-01-01T00:00:00Z → 09:00 KST
    expect(row.getByText('2026.01.01 09:00')).toBeInTheDocument();
  });

  it('amount header cycles totalAmount:asc → desc → createdAt:desc', async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    const props = { ...baseProps, onSortChange };
    const { rerender } = render(<OrderTable {...props} sort="createdAt:desc" />);
    await user.click(screen.getByRole('button', { name: /금액/ }));
    expect(onSortChange).toHaveBeenLastCalledWith('totalAmount:asc');
    rerender(<OrderTable {...props} sort="totalAmount:asc" />);
    expect(screen.getByRole('columnheader', { name: /금액/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await user.click(screen.getByRole('button', { name: /금액/ }));
    expect(onSortChange).toHaveBeenLastCalledWith('totalAmount:desc');
    rerender(<OrderTable {...props} sort="totalAmount:desc" />);
    await user.click(screen.getByRole('button', { name: /금액/ }));
    expect(onSortChange).toHaveBeenLastCalledWith('createdAt:desc');
  });

  it('date header sorts by createdAt and customer is not sortable', async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    render(<OrderTable {...baseProps} sort="totalAmount:asc" onSortChange={onSortChange} />);
    await user.click(screen.getByRole('button', { name: /주문일시/ }));
    expect(onSortChange).toHaveBeenLastCalledWith('createdAt:asc');
    expect(screen.queryByRole('button', { name: /고객/ })).not.toBeInTheDocument();
  });

  it('shows empty state', () => {
    render(<OrderTable {...baseProps} data={[]} />);
    expect(screen.getByText('조건에 맞는 주문이 없습니다')).toBeInTheDocument();
  });

  it('shows error with retry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<OrderTable {...baseProps} data={undefined} isError onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('주문 목록을 불러오지 못했습니다');
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows aria-busy skeleton rows while pending', () => {
    render(<OrderTable {...baseProps} data={undefined} isPending />);
    const rows = screen.getAllByTestId('order-skeleton-row');
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveAttribute('aria-busy', 'true');
  });
});
