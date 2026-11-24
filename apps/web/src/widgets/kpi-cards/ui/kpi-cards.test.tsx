import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as mswHttp, HttpResponse } from 'msw';
import { dashboardSummaryFixture } from '@/shared/api/mocks/dashboard';
import { server } from '@/shared/testing/msw-server';
import { renderWithQuery } from '@/shared/testing/render-with-query';
import { KpiCards } from './kpi-cards';

const card = (title: string) => screen.getByRole('group', { name: title });

describe('KpiCards', () => {
  it('renders 오늘 매출 ₩…, 오늘 주문 N건, 처리 대기 total with breakdown, 재고 부족 N개', async () => {
    renderWithQuery(<KpiCards />);
    expect(await screen.findByText('₩1,500,000')).toBeInTheDocument();
    expect(within(card('오늘 매출')).getByText('₩1,500,000')).toBeInTheDocument();
    expect(within(card('오늘 주문')).getByText('12건')).toBeInTheDocument();
    expect(within(card('처리 대기')).getByText('8건')).toBeInTheDocument();
    expect(within(card('처리 대기')).getByText('확정 대기 5 · 출고 대기 3')).toBeInTheDocument();
    expect(within(card('재고 부족')).getByText('4개')).toBeInTheDocument();
  });

  it('shows ▲ 50.0% / ▼ 25.0% against yesterday; 전일 실적 없음 when yesterday is 0', async () => {
    renderWithQuery(<KpiCards />);
    expect(
      await within(await screen.findByRole('group', { name: '오늘 매출' })).findByText(/▲ 50\.0%/),
    ).toBeInTheDocument();
    expect(within(card('오늘 주문')).getByText(/▼ 25\.0%/)).toBeInTheDocument();
  });

  it('shows 전일 실적 없음 when yesterday is 0', async () => {
    server.use(
      mswHttp.get('/api/v1/dashboard/summary', () =>
        HttpResponse.json({
          ...dashboardSummaryFixture,
          yesterdayRevenue: 0,
          yesterdayOrders: 0,
        }),
      ),
    );
    renderWithQuery(<KpiCards />);
    await screen.findByText('₩1,500,000');
    expect(within(card('오늘 매출')).getByText('전일 실적 없음')).toBeInTheDocument();
    expect(within(card('오늘 주문')).getByText('전일 실적 없음')).toBeInTheDocument();
  });

  it('처리 대기 links to /orders?status=PENDING; 재고 부족 links to /products?lowStock=true', async () => {
    renderWithQuery(<KpiCards />);
    await screen.findByText('₩1,500,000');
    expect(within(card('처리 대기')).getByRole('link')).toHaveAttribute(
      'href',
      '/orders?status=PENDING',
    );
    expect(within(card('재고 부족')).getByRole('link')).toHaveAttribute(
      'href',
      '/products?lowStock=true',
    );
  });

  it('skeleton while loading; 500 shows error and 다시 시도 refetches', async () => {
    const user = userEvent.setup();
    let fail = true;
    server.use(
      mswHttp.get('/api/v1/dashboard/summary', () =>
        fail
          ? HttpResponse.json(
              { statusCode: 500, code: 'INTERNAL_ERROR', message: 'boom' },
              { status: 500 },
            )
          : HttpResponse.json(dashboardSummaryFixture),
      ),
    );
    renderWithQuery(<KpiCards />);
    expect(screen.getAllByTestId('kpi-skeleton')).toHaveLength(4);
    expect(await screen.findByRole('alert')).toHaveTextContent('요약 정보를 불러오지 못했습니다');
    fail = false;
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('₩1,500,000')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
