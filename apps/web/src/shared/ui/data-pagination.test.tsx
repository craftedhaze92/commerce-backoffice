import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataPagination } from './data-pagination';

describe('DataPagination', () => {
  it('disables prev on first page and next on last page', () => {
    const { rerender } = render(<DataPagination page={1} totalPages={3} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음' })).toBeEnabled();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    rerender(<DataPagination page={3} totalPages={3} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: '이전' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
  });

  it('shows 1 / 1 and disables both when totalPages is 0', () => {
    render(<DataPagination page={1} totalPages={0} onPageChange={vi.fn()} />);
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
  });

  it('calls onPageChange with neighbouring pages', async () => {
    const onPageChange = vi.fn();
    render(<DataPagination page={2} totalPages={3} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByRole('button', { name: '이전' }));
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3);
  });
});
