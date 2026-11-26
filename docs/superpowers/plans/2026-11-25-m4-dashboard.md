# M4 대시보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**

- 대시보드 집계 API 세 개(요약·매출 추이·카테고리별 매출)를 만든다.
- 어드민 첫 화면에 KPI 4개, 매출 라인차트, 카테고리 도넛, 최근 주문 5건, 재고 부족 상품을 그린다.
- 핵심은 **집계 숫자가 다른 화면과 어긋나지 않는 것**이다. KST 자정 경계, 큰 금액 합계, 빈 날짜 채우기, 취소 주문 제외를 실제 DB 테스트로 증명한다.

**Architecture:**

- **`dashboard/` 모듈 신설 (읽기 전용 집계)**
  - 다른 도메인 파일(엔티티 포함)을 import하지 않고 `DataSource.query` SQL로 `orders`·`order_items`·`products`·`categories`·`inventories`를 읽는다. `inventory/`와 같은 방식이다.
  - 현재 시각은 `CLOCK` 토큰(`() => Date`)으로 주입받는다. e2e는 시각을 고정해 KST 자정 경계를 결정적으로 검증한다.
- **최근 주문·재고 부족 목록은 새 API를 만들지 않는다.** 기존 `GET /orders?size=5`와 `GET /products?lowStock=true&sort=stock:asc&size=5`를 재사용한다.
  - 설계서 §8의 `GET /dashboard/low-stock`은 만들지 않는다. 같은 조건을 두 벌로 두면 상품 목록의 "재고 부족" 필터와 숫자가 갈라질 수 있기 때문이다.
- **Web**
  - `entities/dashboard`: 쿼리 키와 훅 3개
  - 위젯: `kpi-cards`, `sales-trend-chart`, `category-sales-chart`, `recent-orders`, `low-stock-table`
  - `views/dashboard`: 기간 토글(7·30·90일, URL `?days=`)과 레이아웃

**Tech Stack:** 기존 스택 그대로다. 차트는 이미 설치된 `recharts@3.11`을 쓴다. 새 라이브러리는 없다.

**Spec:** `docs/2026-11-20-commerce-backoffice-design.md`

- §6.2-5 재고 부족은 조회 시 계산(`quantity <= safetyStock`)
- §8 `GET /dashboard/summary` · `/sales-trend?days=30` · `/category-sales`
- §11.1 위젯 목록, §11.3 UI(스켈레톤·빈 상태·재시도), §11.4 대시보드 화면

프로젝트 규칙은 `CLAUDE.md`를 따른다.

**선행 조건:** 브랜치 `feat/m4-dashboard`. M3가 병합된 `main`(5db16d9)에서 시작한다.

**범위 밖:**

- 엑셀(M5), 사용자 관리·Swagger 정리·배포(M6)
- 실시간 갱신(폴링·WebSocket). 화면에 들어올 때와 창에 포커스가 돌아올 때 다시 읽는 것으로 충분하다.
- 집계 캐시·머티리얼라이즈드 뷰. 주문 1,500건 규모에서는 인덱스로 충분하다.

## Global Constraints

- 공통 규칙은 `CLAUDE.md`를 따른다. 이 섹션은 M4 고유 값만 적는다.
- **매출 인정:**
  - 상태가 `CONFIRMED`·`SHIPPED`·`DELIVERED`인 주문의 `totalAmount`를 `confirmedAt` 시각 기준으로 센다.
  - `PENDING`과 `CANCELLED`(확정 후 취소 포함)는 매출이 아니다.
  - 계약에 `REVENUE_STATUSES`로 한 번만 정의하고, SQL은 이 배열을 파라미터로 받는다.
- **날짜:**
  - 모든 "하루"는 KST(+09:00 고정) 00:00 이상, 다음 날 00:00 미만이다.
  - "오늘"은 서버의 `CLOCK` 기준이다. 웹은 브라우저 시계로 오늘을 계산하지 않고 응답의 `today`·`from`·`to`를 표시한다(hydration mismatch와 해외 접속 어긋남 방지).
  - SQL의 일별 버킷은 `("confirmedAt" AT TIME ZONE 'Asia/Seoul')::date`다.
- **기간:** `days`는 `7`·`30`·`90` 중 하나, 기본 `30`. 그 밖은 400 `VALIDATION_FAILED`다. 기간은 오늘을 포함한 `days`일(from = 오늘 − (days − 1))이다.
- **금액 합계:**
  - PostgreSQL `SUM(integer)`은 `bigint`이고 `pg`는 이를 **문자열**로 돌려준다. 모든 합계·카운트는 SQL에서 `::bigint`(카운트는 `::int`)로 캐스팅한 뒤 TS에서 `Number()`로 바꾼다. 응답 JSON의 금액은 항상 number다.
  - 품목 금액은 `oi.quantity::bigint * oi."unitPrice"`로 곱한다(int4 곱셈 오버플로 방지).
  - 합계가 int4 범위(2,147,483,647)를 넘어도 정확해야 한다.
- **처리 대기:** `PENDING`(확정 대기)과 `CONFIRMED`(출고 대기) 건수를 따로 준다. 기간과 무관하게 현재 상태 기준이다.
- **재고 부족:** 상품 목록의 `lowStock=true`와 같은 조건이다. `p."deletedAt" IS NULL AND i.quantity <= i."safetyStock"`, 상품 상태는 가리지 않는다.
- **오늘 주문:** 오늘 `createdAt`인 주문 수이고, 상태는 가리지 않는다(취소 포함, "접수 건수").
- **전일 대비:** `changeRate(current, previous)` = `(current − previous) / previous × 100`. `previous`가 0이면 `null`이고, 화면은 "전일 실적 없음"을 보인다.
- **권한:** 대시보드 API 3개는 모두 VIEWER 이상(`dashboard:read`)이다. 비로그인은 401이다.
- **카테고리 도넛:** 색은 7개다. `--color-sector-1..6`을 카테고리 **이름순**으로 배정하고, `--color-sector-7`(보라)은 "기타" 전용이다. 매출이 있는 카테고리가 7개를 넘으면 매출 상위 6개를 남기고 나머지를 "기타" 하나로 합친다.
- **라벨:** KPI 제목은 오늘 매출·오늘 주문·처리 대기·재고 부족이다. 기간 토글은 7일·30일·90일이다.

## Review Focus

1. **KST 자정 경계**: 시각을 2026-11-21 00:30 KST(= 2026-11-20T15:30:00Z)로 고정한다. 그러면 11-20 23:59 KST에 확정된 주문은 오늘이 아니라 어제 매출이다. 11-21 00:00 KST에 확정된 주문은 오늘 매출이다. UTC 날짜로 자르면 9시간이 어긋난다. → Task 1, Task 2
2. **int4를 넘는 합계**: 오늘 1,500,000,000원짜리 확정 주문 두 건이 있으면 `todayRevenue`는 `3000000000`(number)이다. 문자열 `"3000000000"`이나 500이 아니다. 매출 추이와 카테고리 매출도 같다. → Task 1, Task 2
3. **빈 날짜 채우기**: 매출이 없는 날도 `{ revenue: 0, orders: 0 }` 점으로 나온다. `points.length === days`이고 날짜는 오름차순이며 빠진 날이 없다. 빈 DB에서도 모든 값이 0이다(`null` 없음). → Task 2, Task 4
4. **취소 주문 제외와 숫자 일치**: 확정 후 취소된 주문과 PENDING 주문은 매출에서 빠진다. 같은 기간의 `salesTrend.total`은 `categorySales.total`과 같고 Σ points.revenue와도 같다. → Task 2
5. **재고 부족 숫자 일치**: KPI의 `lowStockCount`는 `GET /products?lowStock=true`의 `meta.total`과 같다. 소프트 삭제된 상품은 빠진다. 카드를 누르면 바로 그 목록으로 간다. → Task 1, Task 5

---

## File Structure

```
packages/contracts/src/
  dashboard.ts          REVENUE_STATUSES, SALES_TREND_DAYS, SalesTrendDays, DEFAULT_SALES_TREND_DAYS,
                        DashboardSummary, SalesTrendPoint, SalesTrend, CategorySalesItem, CategorySales,
                        changeRate
  dashboard.test.ts
  index.ts              (+ export * from './dashboard')
apps/api/src/
  common/clock.ts       CLOCK, Clock
  common/kst-range.ts   (+ kstDateOf, addKstDays)
  dashboard/
    dashboard.module.ts · dashboard.controller.ts · dashboard.service.ts
    dto/period.query.ts
  orders/order.entity.ts                 (+ @Index('IDX_orders_confirmed', ['confirmedAt']))
  database/migrations/<ts>-AddOrdersConfirmedAtIndex.ts
  app.module.ts                          (+ DashboardModule)
apps/api/test/
  setup-app.ts                           (+ options.providers 오버라이드)
  dashboard.e2e-spec.ts
apps/web/src/
  shared/api/mocks/dashboard.ts          fixtures + dashboardHandlers
  shared/testing/msw-server.ts           (+ dashboardHandlers)
  entities/dashboard/                    query-keys, use-dashboard-summary, use-sales-trend, use-category-sales
  widgets/kpi-cards/ · widgets/sales-trend-chart/ · widgets/category-sales-chart/
  widgets/recent-orders/ · widgets/low-stock-table/
  views/dashboard/                       (교체) dashboard-page, dashboard-params
  app/(admin)/dashboard/page.tsx         (Suspense)
```

---

### Task 1: 대시보드 계약과 요약 API

**Files:**

- Create: `packages/contracts/src/dashboard.ts`(+test), `apps/api/src/common/clock.ts`, `apps/api/src/dashboard/{dashboard.module,dashboard.controller,dashboard.service}.ts`, `apps/api/src/database/migrations/<ts>-AddOrdersConfirmedAtIndex.ts`, `apps/api/test/dashboard.e2e-spec.ts`
- Modify: `packages/contracts/src/index.ts`, `apps/api/src/common/kst-range.ts`(+spec), `apps/api/src/orders/order.entity.ts`, `apps/api/src/app.module.ts`, `apps/api/test/setup-app.ts`, `CLAUDE.md`

**Interfaces:**

- Consumes: `kstDayRange`(common), `Roles`, `OrderStatus`, `Role`
- Produces:
  - 계약:
    ```ts
    export const REVENUE_STATUSES: readonly OrderStatus[]; // CONFIRMED, SHIPPED, DELIVERED
    export const SALES_TREND_DAYS = [7, 30, 90] as const;
    export type SalesTrendDays = (typeof SALES_TREND_DAYS)[number];
    export const DEFAULT_SALES_TREND_DAYS: SalesTrendDays; // 30
    export interface DashboardSummary {
      today: string; // 'YYYY-MM-DD' (KST)
      todayRevenue: number;
      yesterdayRevenue: number;
      todayOrders: number;
      yesterdayOrders: number;
      pendingCount: number;
      toShipCount: number;
      lowStockCount: number;
    }
    export function changeRate(current: number, previous: number): number | null;
    ```
    `SalesTrendPoint`·`SalesTrend`·`CategorySalesItem`·`CategorySales`도 여기서 함께 선언한다(형태는 Task 2의 Produces).
  - `CLOCK: unique symbol`, `type Clock = () => Date`. `DashboardModule`이 `{ provide: CLOCK, useValue: () => new Date() }`를 등록한다.
  - `kstDateOf(at: Date): string`(KST 날짜 `YYYY-MM-DD`), `addKstDays(day: string, n: number): string`
  - `createTestApp({ env?, providers?: Array<{ provide: unknown; useValue: unknown }> })`. `providers`는 `Test.createTestingModule(...).overrideProvider(p.provide).useValue(p.useValue)`로 적용한다.
  - `DashboardService.summary(): Promise<DashboardSummary>`. 주문 지표는 `COUNT(*) FILTER (...)`·`SUM(...) FILTER (...)`를 쓴 SQL 한 번으로 구하고, 재고 부족은 한 번 더 조회한다.
  - `GET /dashboard/summary` → `DashboardSummary`, `@Roles(Role.VIEWER)`
  - `orders."confirmedAt"` 인덱스 `IDX_orders_confirmed`. 마이그레이션은 TypeORM CLI로 생성한 뒤 검토한다.

- [ ] **Step 1: 실패하는 테스트**

```ts
// dashboard.test.ts (contracts)
it('REVENUE_STATUSES is exactly CONFIRMED·SHIPPED·DELIVERED', ...);
it('changeRate(150, 100) → 50; changeRate(50, 100) → -50; changeRate(0, 0) → null; changeRate(10, 0) → null', ...);
// kst-range.spec.ts
it('kstDateOf(2026-11-20T15:30:00Z) → 2026-11-21; kstDateOf(2026-11-20T14:59:59Z) → 2026-11-20', ...);
it('addKstDays(2026-03-01, -1) → 2026-02-28; addKstDays(2026-12-31, 1) → 2027-01-01', ...);
// dashboard.e2e-spec.ts — CLOCK = () => new Date('2026-11-20T15:30:00Z') (KST 11-21 00:30)
it('empty DB → all zeros, today 2026-11-21', ...);
it('confirmed at 11-20 23:59 KST is yesterdayRevenue; at 11-21 00:00 KST is todayRevenue', ...);
it('PENDING and CANCELLED (even with confirmedAt) are excluded from revenue', ...);
it('two confirmed orders of 1_500_000_000 today → todayRevenue === 3_000_000_000 (number)', ...);
it('todayOrders counts createdAt today in any status, including CANCELLED', ...);
it('pendingCount / toShipCount count current PENDING / CONFIRMED regardless of date', ...);
it('lowStockCount equals GET /products?lowStock=true meta.total; soft-deleted excluded', ...);
it('viewer 200; no cookie 401', ...);
```

- [ ] **Step 2: 실패 확인.** `pnpm --filter @bo/contracts test && pnpm --filter api test && pnpm --filter api test:e2e -- dashboard` → FAIL
- [ ] **Step 3: 구현.** 계약을 빌드(`pnpm --filter @bo/contracts build`)한 뒤 API를 구현한다. `CLAUDE.md` API 구조 문단에 한 줄을 더한다: "`dashboard/`는 읽기 전용 집계 모듈이다. 다른 도메인 파일을 import하지 않고 SQL로 조회하며, 현재 시각은 `CLOCK`으로 주입받는다."
- [ ] **Step 4: 통과 확인.** `pnpm --filter @bo/contracts test && pnpm --filter api test && pnpm --filter api test:e2e && pnpm --filter api lint && pnpm typecheck` → PASS
- [ ] **Step 5: 커밋.** `feat: 대시보드 요약 집계 API 추가`

---

### Task 2: 매출 추이·카테고리별 매출 API

**Files:**

- Create: `apps/api/src/dashboard/dto/period.query.ts`
- Modify: `apps/api/src/dashboard/{dashboard.controller,dashboard.service}.ts`, `apps/api/test/dashboard.e2e-spec.ts`

**Interfaces:**

- Consumes: `CLOCK`, `kstDateOf`, `addKstDays`, `kstDayRange`, `REVENUE_STATUSES`, `SALES_TREND_DAYS`(Task 1)
- Produces:
  - `PeriodQuery { days: SalesTrendDays }`. 문자열을 숫자로 바꾼 뒤 `@IsIn(SALES_TREND_DAYS)`로 검사하고, 없으면 기본 30이다.
  - 계약 타입(Task 1에서 선언):
    ```ts
    export interface SalesTrendPoint {
      date: string;
      revenue: number;
      orders: number;
    } // orders = 그날 매출 인정 주문 수
    export interface SalesTrend {
      days: SalesTrendDays;
      from: string;
      to: string;
      total: number;
      points: SalesTrendPoint[];
    }
    export interface CategorySalesItem {
      categoryId: string;
      categoryName: string;
      revenue: number;
      quantity: number;
    }
    export interface CategorySales {
      days: SalesTrendDays;
      from: string;
      to: string;
      total: number;
      items: CategorySalesItem[];
    }
    ```
  - `GET /dashboard/sales-trend?days=` → `SalesTrend`
    - `generate_series(from::date, to::date, '1 day')`에 일별 집계를 LEFT JOIN해 빈 날을 0으로 채운다. `points`는 날짜 오름차순이다.
  - `GET /dashboard/category-sales?days=` → `CategorySales`
    - `order_items → products → categories`를 JOIN한다. 소프트 삭제된 상품의 매출도 원래 카테고리로 센다.
    - 매출이 0인 카테고리는 뺀다. 정렬은 `revenue DESC, categoryName ASC`다.

- [ ] **Step 1: 실패하는 테스트**

```ts
// dashboard.e2e-spec.ts (CLOCK 고정은 Task 1과 같다)
it('default days=30: 30 points from 2026-10-23 to 2026-11-21, ascending, zero-filled', ...);
it('days=7 bucket by KST: confirmed 11-20 23:59 KST lands on 2026-11-20, 11-21 00:00 KST on 2026-11-21', ...);
it('order confirmed before the window is excluded; first day of window is included', ...);
it('cancelled-after-confirm and PENDING excluded from trend and category', ...);
it('trend.total === Σ points.revenue === categorySales.total for the same days', ...);
it('category revenue sums beyond int4 as number (2 × 1_500_000_000)', ...);
it('soft-deleted product revenue still counted under its category', ...);
it('categories sorted revenue desc; zero-revenue category omitted', ...);
it.each(['days=0', 'days=14', 'days=abc'])('400 for %s on both endpoints', ...);
it('viewer 200; no cookie 401 on both endpoints', ...);
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인.** `pnpm --filter api test:e2e && pnpm --filter api lint && pnpm --filter api typecheck` → PASS
- [ ] **Step 5: 커밋.** `feat: 매출 추이와 카테고리별 매출 집계 API 추가`

---

### Task 3: Web 대시보드 엔티티·목 데이터·KPI 카드

**Files:**

- Create: `apps/web/src/shared/api/mocks/dashboard.ts`(+test), `apps/web/src/entities/dashboard/{model/query-keys.ts,model/use-dashboard-summary.ts,model/use-sales-trend.ts,model/use-category-sales.ts,index.ts}`, `apps/web/src/widgets/kpi-cards/{ui/kpi-cards.tsx,ui/kpi-cards.test.tsx,index.ts}`
- Modify: `apps/web/src/shared/testing/msw-server.ts`

**Interfaces:**

- Consumes: `http`, `ApiError`, 계약 타입(Task 1·2), `formatWon`, `Card`, `Skeleton`
- Produces:
  - `dashboardKeys = { all: ['dashboard'], summary: () => ['dashboard','summary'], salesTrend: (days) => ['dashboard','sales-trend',days], categorySales: (days) => ['dashboard','category-sales',days] }`
  - `useDashboardSummary(): UseQueryResult<DashboardSummary, ApiError>`, `useSalesTrend(days)`, `useCategorySales(days)`
    - 세 훅 모두 `staleTime: 0`, `retry: false`다. 주문 전이·재고 조정 뒤 대시보드로 돌아오면 다시 읽게 하려는 것이다. 다른 feature에서 `dashboardKeys`를 invalidate하지 않는다.
    - 기간 훅은 `placeholderData: keepPreviousData`를 써서 기간을 바꿀 때 차트가 비지 않게 한다.
  - 목: `dashboardSummaryFixture`, `salesTrendFixture(days)`(결정적, 일부 0인 날 포함, `to = '2026-11-21'`), `categorySalesFixture`(8개 카테고리), `dashboardHandlers`(잘못된 `days`면 400). `msw-server`의 기본 핸들러에 넣는다.
  - `<KpiCards />`
    - 4개 카드: 오늘 매출(`formatWon`), 오늘 주문(`N건`), 처리 대기(`pendingCount + toShipCount`건, 보조 "확정 대기 N · 출고 대기 N"), 재고 부족(`N개`).
    - 오늘 매출·오늘 주문에는 전일 대비를 붙인다. `changeRate` 결과를 소수 1자리로 보이고, 증가는 "▲", 감소는 "▼" 기호를 함께 쓴다(색만으로 구분하지 않는다). `null`이면 "전일 실적 없음"을 보인다.
    - 처리 대기는 `/orders?status=PENDING`, 재고 부족은 `/products?lowStock=true`로 가는 링크다.
    - 로딩 중에는 카드 4개 모양의 스켈레톤, 에러면 메시지와 "다시 시도"(refetch)를 보인다.

- [ ] **Step 1: 실패하는 테스트**

```ts
// mocks/dashboard.test.ts
it('salesTrendFixture(days) has days points, ascending, ending 2026-11-21', ...);
// kpi-cards.test.tsx
it('renders 오늘 매출 ₩…, 오늘 주문 N건, 처리 대기 total with breakdown, 재고 부족 N개', ...);
it('shows ▲ 50.0% / ▼ 25.0% against yesterday; 전일 실적 없음 when yesterday is 0', ...);
it('처리 대기 links to /orders?status=PENDING; 재고 부족 links to /products?lowStock=true', ...);
it('skeleton while loading; 500 shows error and 다시 시도 refetches', ...);
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인.** `pnpm --filter web test && pnpm --filter web lint && pnpm --filter web typecheck` → PASS
- [ ] **Step 5: 커밋.** `feat: 대시보드 엔티티와 KPI 카드 추가`

---

### Task 4: 매출 추이·카테고리 도넛 차트

**Files:**

- Create: `apps/web/src/widgets/sales-trend-chart/{ui/sales-trend-chart.tsx,ui/sales-trend-chart.test.tsx,index.ts}`, `apps/web/src/widgets/category-sales-chart/{lib/group-slices.ts,lib/group-slices.test.ts,ui/category-sales-chart.tsx,ui/category-sales-chart.test.tsx,index.ts}`

**Interfaces:**

- Consumes: `useSalesTrend`, `useCategorySales`(Task 3), `ChartTooltip`, `EMPTY_CARD`/`EMPTY_MESSAGE`(shared/ui), `formatWon`·`formatWonCompact`·`formatPercent`, `kst()`
- Produces:
  - `<SalesTrendChart days={SalesTrendDays} />`
    - recharts `LineChart`(매출). X축 눈금은 `M/D`, Y축은 `formatWonCompact`, 툴팁은 `ChartTooltip`(날짜, 매출, "N건")이다.
    - 카드 제목 옆에 기간 합계(`formatWon(total)`)와 `from ~ to`를 표시한다.
    - 차트와 같은 데이터를 `sr-only` 표(`<caption>일별 매출</caption>`)로도 그린다. 스크린리더용이고, 테스트는 이 표로 값을 확인한다.
    - `total === 0`이면 "기간 내 매출이 없습니다" 빈 상태를 보인다.
  - `groupCategorySlices(items: CategorySalesItem[], maxSlices = 7): CategorySlice[]`
    - `CategorySlice = { key: string; label: string; revenue: number; ratio: number; color: string }`. `ratio`는 0–100이다.
    - 7개 이하면 그대로, 넘으면 상위 6개 + `{ key: 'etc', label: '기타' }`(나머지 합).
    - 색은 "기타"를 뺀 슬라이스의 **이름순**으로 sector-1..6을 배정하고, "기타"는 항상 sector-7이다. 매출 순위가 바뀌어도 카테고리 색은 그대로다.
  - `<CategorySalesChart days={SalesTrendDays} />`
    - recharts `PieChart` 도넛과 범례(카테고리명, 비율 `formatPercent(…, {digits:1})`)를 그린다. 툴팁은 금액이다. 물타기 `sector-chart`의 모양을 따른다(조각 색은 데이터의 `fill`, `Cell` 미사용).
    - 매출이 없으면 "기간 내 매출이 없습니다"를 보인다.
  - 두 차트 모두 `ResponsiveContainer`에 `initialDimension`을 준다. jsdom에서 크기 0 경고가 나지 않게 하려는 것이다.
  - 두 차트 모두 로딩 스켈레톤, 에러와 "다시 시도"를 갖춘다.

- [ ] **Step 1: 실패하는 테스트**

```ts
// group-slices.test.ts
it('≤7 items: unchanged order, ratios sum to 100', ...);
it('8 items: top 6 + 기타 with summed revenue; 기타 last', ...);
it('colors follow label order, 기타 always sector-7; swapping revenue ranks keeps colors', ...);
it('empty → []', ...);
// sales-trend-chart.test.tsx
it('sr-only table has one row per point with formatted revenue; header shows total and range', ...);
it('all-zero trend shows 기간 내 매출이 없습니다', ...);
it('error shows 다시 시도; click refetches', ...);
it('no console.warn/error while rendering (vi.spyOn)', ...);
// category-sales-chart.test.tsx
it('legend lists 7 entries for 8 fixture categories, last is 기타, percents with 1 digit', ...);
it('empty items show 기간 내 매출이 없습니다', ...);
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인.** `pnpm --filter web test && pnpm --filter web lint && pnpm --filter web typecheck` → PASS. 테스트 출력에 recharts 경고가 없어야 한다.
- [ ] **Step 5: 커밋.** `feat: 매출 추이 라인차트와 카테고리 도넛 추가`

---

### Task 5: 최근 주문·재고 부족 위젯과 대시보드 화면 조립

**Files:**

- Create: `apps/web/src/widgets/recent-orders/{ui/recent-orders.tsx,ui/recent-orders.test.tsx,index.ts}`, `apps/web/src/widgets/low-stock-table/{ui/low-stock-table.tsx,ui/low-stock-table.test.tsx,index.ts}`, `apps/web/src/views/dashboard/model/dashboard-params.ts`(+test), `apps/web/src/views/dashboard/ui/dashboard-page.test.tsx`
- Modify: `apps/web/src/views/dashboard/ui/dashboard-page.tsx`, `apps/web/src/views/dashboard/index.ts`, `apps/web/app/(admin)/dashboard/page.tsx`

**Interfaces:**

- Consumes: `useOrders`·`OrderStatusBadge`·`DEFAULT_ORDER_*`(entities/order), `useProducts`·`DEFAULT_PRODUCT_*`(entities/product), `useUrlState`, `ToggleGroup`, `formatWon`, `formatKstDateTime`, 위젯(Task 3·4), `useSessionMe`
- Produces:
  - `<RecentOrders />`: `useOrders({ ...기본값, size: 5, sort: 'createdAt:desc' })`. 행마다 주문번호(`/orders/:id` 링크), 고객명, 상태 뱃지, 금액, 접수 시각을 보인다. 머리에 "전체 보기" → `/orders` 링크를 둔다.
  - `<LowStockTable />`: `useProducts({ ...기본값, lowStock: true, sort: 'stock:asc', size: 5 })`. 행마다 상품명(`/products/:id` 링크), SKU, 재고/안전재고를 보인다. 머리에 "전체 보기" → `/products?lowStock=true` 링크를 둔다. 비어 있으면 "재고 부족 상품이 없습니다"를 보인다.
  - 두 위젯 모두 로딩 스켈레톤, 빈 상태, 에러와 "다시 시도"를 갖춘다.
  - `dashboardSchema`(zod): `days`는 `7|30|90`, 그 밖은 `.catch(30)`이다. 기본값이면 URL에서 지운다(`useUrlState` 규칙).
  - `DashboardPage`
    - 머리: 제목 "대시보드", 인사말(`me.name`), 기준일(`summary.today`).
    - 1행 `KpiCards`, 2행 `SalesTrendChart`(넓게) + `CategorySalesChart`, 3행 `RecentOrders` + `LowStockTable`. 모바일은 한 열로 쌓는다.
    - 기간 토글(7일·30일·90일)은 두 차트에만 적용되고 `?days=`에 남는다. KPI는 항상 오늘 기준이다.
  - `app/(admin)/dashboard/page.tsx`는 `useSearchParams` 때문에 `Suspense`로 감싼다.

- [ ] **Step 1: 실패하는 테스트**

```ts
// dashboard-params.test.ts
it('?days=90 → 90; ?days=14 / ?days=abc / none → 30', ...);
// recent-orders.test.tsx
it('requests /api/v1/orders?size=5 and renders 5 rows linking to detail', ...);
it('empty → 주문이 없습니다; error → 다시 시도', ...);
// low-stock-table.test.tsx
it('requests lowStock=true&sort=stock:asc&size=5; shows stock/safetyStock; 전체 보기 → /products?lowStock=true', ...);
it('empty → 재고 부족 상품이 없습니다', ...);
// dashboard-page.test.tsx
it('renders KPI, both charts, recent orders and low stock for a viewer', ...);
it('clicking 90일 writes ?days=90 and both charts request days=90; KPI request unchanged', ...);
it('tampered ?days=14 renders with 30 and requests days=30', ...);
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인.** `pnpm --filter web test && pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web build` → PASS
- [ ] **Step 5: 커밋.** `feat: 대시보드 화면에 최근 주문·재고 부족과 기간 토글 추가`

---

### Task 6: 문서와 전체 검증

**Files:**

- Modify: `README.md`, `docs/2026-11-20-commerce-backoffice-design.md`(§8 한 줄)

**Interfaces:**

- Produces: 문서만.

- [ ] **Step 1: 문서 갱신**
  - README에 대시보드 기능 소개(KPI 4개 정의, 기간 토글)를 추가한다.
  - README **설계 결정**에 두 bullet을 넣는다.
    - "매출은 확정 시각(`confirmedAt`) 기준, KST 날짜 버킷 — 접수가 아니라 확정이 매출이고, 확정 후 취소는 빠진다. 시각은 `CLOCK`으로 주입해 자정 경계를 테스트로 고정"
    - "재고 부족·최근 주문은 전용 API 없이 목록 API 재사용 — 대시보드와 목록의 숫자가 갈라지지 않게"
  - 설계서 §8 표의 대시보드 행에서 `/low-stock`을 빼고, 목록 API를 재사용한다고 적는다.
- [ ] **Step 2: 전체 검증.** `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm build && pnpm format:check` → 모두 PASS
- [ ] **Step 3: 커밋.** `docs: 대시보드 집계 기준과 설계 결정 문서화`
- [ ] **Step 4: (컨트롤러) 브라우저 수동 확인** (`pnpm db:seed` 데이터, 사용자 `pnpm dev`와 겹치지 않는 포트)
  - 뷰어로 로그인하면 대시보드의 KPI 4개, 차트 2개, 최근 주문, 재고 부족이 모두 그려진다.
  - 기간 토글이 `?days=`에 남고 새로고침해도 유지된다.
  - 재고 부족 KPI 숫자와 카드를 눌러 간 상품 목록의 총 건수가 같다.
  - 매니저로 PENDING 주문 하나를 확정하고 대시보드로 돌아오면, 오늘 매출과 처리 대기가 바로 바뀐다.
  - 콘솔에 hydration 오류와 recharts 경고가 없다.
