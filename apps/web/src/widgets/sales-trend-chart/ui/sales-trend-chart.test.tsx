import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as mswHttp, HttpResponse } from 'msw';
import { salesTrendFixture } from '@/shared/api/mocks/dashboard';
import { formatWon } from '@/shared/lib/format-won';
import { server } from '@/shared/testing/msw-server';
import { stubChartSize } from '@/shared/testing/stub-chart-size';
import { renderWithQuery } from '@/shared/testing/render-with-query';
import { SalesTrendChart } from './sales-trend-chart';

beforeEach(() => stubChartSize());
afterEach(() => vi.restoreAllMocks());

describe('SalesTrendChart', () => {
  it('sr-only table has one row per point with formatted revenue; header shows total and range', async () => {
    renderWithQuery(<SalesTrendChart days={7} />);
    const fx = salesTrendFixture(7);
    const table = await screen.findByRole('table', { name: '일별 매출' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(1 + 7);
    const last = fx.points[6];
    expect(within(rows[7]).getByText(formatWon(last.revenue))).toBeInTheDocument();
    expect(within(rows[7]).getByText(`${last.orders}건`)).toBeInTheDocument();
    expect(screen.getByText(formatWon(fx.total))).toBeInTheDocument();
    expect(screen.getByText(`${fx.from} ~ ${fx.to}`)).toBeInTheDocument();
  });

  it('all-zero trend shows 기간 내 매출이 없습니다', async () => {
    server.use(
      mswHttp.get('/api/v1/dashboard/sales-trend', () => {
        const fx = salesTrendFixture(7);
        return HttpResponse.json({
          ...fx,
          total: 0,
          points: fx.points.map((p) => ({ ...p, revenue: 0, orders: 0 })),
        });
      }),
    );
    renderWithQuery(<SalesTrendChart days={7} />);
    expect(await screen.findByText('기간 내 매출이 없습니다')).toBeInTheDocument();
  });

  it('shows skeleton while loading', () => {
    renderWithQuery(<SalesTrendChart days={7} />);
    expect(screen.getByTestId('sales-trend-skeleton')).toBeInTheDocument();
  });

  it('error shows 다시 시도; click refetches', async () => {
    const user = userEvent.setup();
    let fail = true;
    server.use(
      mswHttp.get('/api/v1/dashboard/sales-trend', () =>
        fail
          ? HttpResponse.json(
              { statusCode: 500, code: 'INTERNAL_ERROR', message: 'boom' },
              { status: 500 },
            )
          : HttpResponse.json(salesTrendFixture(7)),
      ),
    );
    renderWithQuery(<SalesTrendChart days={7} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('매출 추이를 불러오지 못했습니다');
    fail = false;
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('table', { name: '일별 매출' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('no console.warn/error while rendering', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderWithQuery(<SalesTrendChart days={30} />);
    await screen.findByRole('table', { name: '일별 매출' });
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
