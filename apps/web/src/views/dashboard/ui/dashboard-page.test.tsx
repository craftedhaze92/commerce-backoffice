import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as mswHttp, HttpResponse } from 'msw';
import { Role } from '@bo/contracts';
import { dashboardSummaryFixture } from '@/shared/api/mocks/dashboard';
import { getMockSearch, setMockSearch } from '@/shared/testing/mock-navigation';
import { server } from '@/shared/testing/msw-server';
import { stubChartSize } from '@/shared/testing/stub-chart-size';
import { renderWithQuery } from '@/shared/testing/render-with-query';
import { DashboardPage } from './dashboard-page';

vi.mock('next/navigation', async () => {
  const m = await import('@/shared/testing/mock-navigation');
  return m.navigationMock;
});

/** 대시보드 API 요청의 경로+쿼리를 기록한다. 기본 핸들러가 응답한다. */
function record(path: string): string[] {
  const seen: string[] = [];
  server.use(
    mswHttp.get(path, ({ request }) => {
      seen.push(new URL(request.url).search);
      return undefined;
    }),
  );
  return seen;
}

beforeEach(() => {
  stubChartSize();
  setMockSearch('');
  server.use(
    mswHttp.get('/api/v1/auth/me', () =>
      HttpResponse.json({ id: 'u', email: 'v@demo.com', name: '뷰어', role: Role.VIEWER }),
    ),
  );
});
afterEach(() => vi.restoreAllMocks());

describe('DashboardPage', () => {
  it('renders KPI, both charts, recent orders and low stock for a viewer', async () => {
    renderWithQuery(<DashboardPage />);
    expect(screen.getByRole('heading', { name: '대시보드' })).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: '오늘 매출' })).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: '일별 매출' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '카테고리별 매출' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '최근 주문' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '재고 부족' })).toBeInTheDocument();
    expect(await screen.findByText(/뷰어님, 안녕하세요/)).toBeInTheDocument();
    expect(
      await screen.findByText(new RegExp(`기준일 ${dashboardSummaryFixture.today}`)),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '전체 보기' })).toHaveLength(2);
  });

  it('clicking 90일 writes ?days=90 and both charts request days=90; KPI request unchanged', async () => {
    const trend = record('/api/v1/dashboard/sales-trend');
    const cats = record('/api/v1/dashboard/category-sales');
    const summary = record('/api/v1/dashboard/summary');
    renderWithQuery(<DashboardPage />);
    await screen.findByRole('table', { name: '일별 매출' });
    expect(screen.getByRole('radio', { name: '30일' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.setup().click(screen.getByRole('radio', { name: '90일' }));
    expect(getMockSearch()).toBe('days=90');
    await waitFor(() => expect(trend).toContain('?days=90'));
    await waitFor(() => expect(cats).toContain('?days=90'));
    expect(screen.getByRole('radio', { name: '90일' })).toHaveAttribute('aria-checked', 'true');
    expect(summary).toEqual(['']);
  });

  it('clicking 30일 again removes ?days (default)', async () => {
    setMockSearch('days=90');
    renderWithQuery(<DashboardPage />);
    await screen.findByRole('table', { name: '일별 매출' });
    await userEvent.setup().click(screen.getByRole('radio', { name: '30일' }));
    expect(getMockSearch()).toBe('');
  });

  it('tampered ?days=14 renders with 30 and requests days=30', async () => {
    setMockSearch('days=14');
    const trend = record('/api/v1/dashboard/sales-trend');
    renderWithQuery(<DashboardPage />);
    await screen.findByRole('table', { name: '일별 매출' });
    expect(screen.getByRole('radio', { name: '30일' })).toHaveAttribute('aria-checked', 'true');
    expect(trend.every((s) => s === '?days=30' || s === '')).toBe(true);
    expect(trend.length).toBeGreaterThan(0);
  });
});
