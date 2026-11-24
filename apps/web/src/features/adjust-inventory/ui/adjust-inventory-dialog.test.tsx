import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { productDetailFixture } from '@/shared/api/mocks/products';
import { renderWithQuery } from '@/shared/testing/render-with-query';
import { server } from '@/shared/testing/msw-server';
import { AdjustInventoryDialog } from './adjust-inventory-dialog';

const ID = productDetailFixture.id;
const STOCK = 10;

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  renderWithQuery(<AdjustInventoryDialog productId={ID} currentStock={STOCK} />);
  await user.click(screen.getByRole('button', { name: '재고 조정' }));
  return screen.findByRole('dialog', { name: '재고 조정' });
}

describe('AdjustInventoryDialog', () => {
  it('previews stock after adjustment for 입고 (default) and 출고', async () => {
    const user = userEvent.setup();
    await openDialog(user);
    expect(screen.getByRole('radio', { name: '입고' })).toBeChecked();
    await user.type(screen.getByLabelText('수량'), '5');
    expect(screen.getByText('조정 후 재고 15개')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '출고' }));
    expect(screen.getByText('조정 후 재고 5개')).toBeInTheDocument();
  });

  it('출고 more than current stock shows inline error and disables submit', async () => {
    const user = userEvent.setup();
    await openDialog(user);
    await user.click(screen.getByRole('radio', { name: '출고' }));
    await user.type(screen.getByLabelText('수량'), '11');
    await user.type(screen.getByLabelText('사유'), '파손');
    expect(screen.getByRole('alert')).toHaveTextContent('현재 재고(10개)보다 많이 뺄 수 없습니다');
    expect(screen.getByRole('button', { name: '조정' })).toBeDisabled();
  });

  it('입고 5 sends PATCH {delta, note}, closes and resets', async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.patch('/api/v1/products/:id/inventory', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...productDetailFixture, stock: STOCK + 5 });
      }),
    );
    await openDialog(user);
    await user.type(screen.getByLabelText('수량'), '5');
    await user.type(screen.getByLabelText('사유'), '  실사 결과 반영  ');
    await user.click(screen.getByRole('button', { name: '조정' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(body).toEqual({ delta: 5, note: '실사 결과 반영' });
    // 다시 열면 초기화되어 있다
    await user.click(screen.getByRole('button', { name: '재고 조정' }));
    expect(await screen.findByLabelText('수량')).toHaveValue(null);
    expect(screen.getByLabelText('사유')).toHaveValue('');
  });

  it('validates empty amount and note on submit', async () => {
    const user = userEvent.setup();
    await openDialog(user);
    await user.click(screen.getByRole('button', { name: '조정' }));
    expect(await screen.findByText('수량을 입력하세요')).toBeInTheDocument();
    expect(screen.getByText('사유를 입력하세요')).toBeInTheDocument();
  });

  it('422 shows server shortage message with available stock', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch('/api/v1/products/:id/inventory', () =>
        HttpResponse.json(
          {
            statusCode: 422,
            code: 'INSUFFICIENT_STOCK',
            message: 'x',
            details: [{ productId: ID, sku: 's', name: 'n', requested: 8, available: 4 }],
          },
          { status: 422 },
        ),
      ),
    );
    await openDialog(user);
    await user.click(screen.getByRole('radio', { name: '출고' }));
    await user.type(screen.getByLabelText('수량'), '8');
    await user.type(screen.getByLabelText('사유'), '출고');
    await user.click(screen.getByRole('button', { name: '조정' }));
    expect(await screen.findByText('재고가 부족합니다 (현재 4개)')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('other error shows generic message', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch('/api/v1/products/:id/inventory', () =>
        HttpResponse.json({ statusCode: 500, code: 'INTERNAL', message: 'x' }, { status: 500 }),
      ),
    );
    await openDialog(user);
    await user.type(screen.getByLabelText('수량'), '1');
    await user.type(screen.getByLabelText('사유'), '입고');
    await user.click(screen.getByRole('button', { name: '조정' }));
    expect(await screen.findByText('재고를 조정하지 못했습니다')).toBeInTheDocument();
  });
});
