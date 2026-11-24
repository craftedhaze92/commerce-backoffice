import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as mswHttp, HttpResponse } from 'msw';
import { categorySalesFixture } from '@/shared/api/mocks/dashboard';
import { server } from '@/shared/testing/msw-server';
import { stubChartSize } from '@/shared/testing/stub-chart-size';
import { renderWithQuery } from '@/shared/testing/render-with-query';
import { CategorySalesChart } from './category-sales-chart';

beforeEach(() => stubChartSize());
afterEach(() => vi.restoreAllMocks());

describe('CategorySalesChart', () => {
  it('legend lists 7 entries for 8 fixture categories, last is 기타, percents with 1 digit', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderWithQuery(<CategorySalesChart days={30} />);
    const list = await screen.findByRole('list', { name: '카테고리별 매출 비율' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(7);
    expect(items[6]).toHaveTextContent('기타');
    // 8..1 × 300k, 합계 36 단위: 가전 8/36, 기타 (2+1)/36
    expect(items[0]).toHaveTextContent('가전');
    expect(items[0]).toHaveTextContent('22.2%');
    expect(items[6]).toHaveTextContent('8.3%'); // (2+1)/36
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('empty items show 기간 내 매출이 없습니다', async () => {
    server.use(
      mswHttp.get('/api/v1/dashboard/category-sales', () =>
        HttpResponse.json({ ...categorySalesFixture, total: 0, items: [] }),
      ),
    );
    renderWithQuery(<CategorySalesChart days={30} />);
    expect(await screen.findByText('기간 내 매출이 없습니다')).toBeInTheDocument();
  });

  it('shows skeleton while loading', () => {
    renderWithQuery(<CategorySalesChart days={30} />);
    expect(screen.getByTestId('category-sales-skeleton')).toBeInTheDocument();
  });

  it('error shows 다시 시도; click refetches', async () => {
    const user = userEvent.setup();
    let fail = true;
    server.use(
      mswHttp.get('/api/v1/dashboard/category-sales', () =>
        fail
          ? HttpResponse.json(
              { statusCode: 500, code: 'INTERNAL_ERROR', message: 'boom' },
              { status: 500 },
            )
          : HttpResponse.json(categorySalesFixture),
      ),
    );
    renderWithQuery(<CategorySalesChart days={30} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '카테고리별 매출을 불러오지 못했습니다',
    );
    fail = false;
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('list', { name: '카테고리별 매출 비율' })).toBeInTheDocument();
  });
});
