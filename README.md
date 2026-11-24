# Commerce Back-office

이커머스 운영자를 위한 백오피스(상품·주문·재고 관리) 포트폴리오 프로젝트. 현재는 기반 구조, 인증/권한, 상품·이미지 관리, 주문·재고(M0–M3)까지 구현되어 있다.

## 기술 스택

- 모노레포: pnpm workspace (Node 24)
- API: NestJS 12 (ESM), TypeORM, PostgreSQL 16, Vitest + Testcontainers
- Web: Next.js 16, Tailwind CSS
- 공용 계약: `@bo/contracts` (API·Web이 함께 쓰는 TS 타입·enum, tsup 빌드)
- 저장소: S3 호환 오브젝트 스토리지 (로컬 s3mock / 배포 R2·S3)
- 인프라: docker compose (PostgreSQL, s3mock)
- CI: GitHub Actions

## 로컬 실행

사전 준비: Node 24, pnpm 10, Docker.

```bash
# 1. 환경 변수 준비
cp .env.example .env

# 2. 의존성 설치
pnpm install

# 3. DB·스토리지 기동, 마이그레이션, 시드 (스토리지는 이미지 업로드에만 필요하다. 시드에는 필요 없다)
pnpm db:up:storage && pnpm db:migrate && pnpm db:seed
# 시드 주문(1,500건)은 재고와 재고 이력에 반영되지 않는다.

# 4. 개발 서버 (web :3000, api :4000)
pnpm dev
```

`http://localhost:3000`에서 아래 데모 계정으로 로그인할 수 있다.

> `pnpm db:up`은 PostgreSQL만, `pnpm db:up:storage`는 PostgreSQL과 s3mock(`adobe/s3mock`, 호스트 포트 9090, 버킷 `bo-media`)을 띄우고 헬스체크가 통과할 때까지 기다린 뒤 반환한다. 상품 이미지 업로드는 스토리지가 있어야 동작한다. 처음 MinIO를 썼으나 이미지를 더 이상 받을 수 없어 s3mock으로 바꿨다.

> 이미지는 Web의 `/media/*` 요청을 `MEDIA_ORIGIN`(기본 `http://localhost:9090/bo-media`)으로 rewrite해 제공한다. s3mock 호스트 포트는 `S3MOCK_PORT`로 바꿀 수 있고, 바꾸면 `S3_ENDPOINT`와 `MEDIA_ORIGIN`도 함께 바꾼다.

> PostgreSQL 호스트 포트는 로컬 Postgres(5432)와 겹치지 않도록 **5433**(`PG_PORT`)을 쓴다. 포트를 바꾸면 `.env`의 `DATABASE_URL`도 함께 바꾼다.

### 데모 계정

| 이메일           | 역할    | 비밀번호    |
| ---------------- | ------- | ----------- |
| admin@demo.com   | ADMIN   | `demo1234!` |
| manager@demo.com | MANAGER | `demo1234!` |
| viewer@demo.com  | VIEWER  | `demo1234!` |

비밀번호는 `.env`의 `SEED_PASSWORD`로 바꿀 수 있다. 로그인 화면의 데모 계정 버튼은 고정 비밀번호 `demo1234!`를 쓰므로, 이를 바꾸면 버튼 로그인은 실패한다(기본 `SEED_PASSWORD`와 일치).

> Web의 rewrite 대상인 `API_ORIGIN`(`/api/*`)과 `MEDIA_ORIGIN`(`/media/*`)은 Next가 `apps/web/.env*` 또는 프로세스 환경 변수에서 읽는다. 루트 `.env`는 Next가 로드하지 않는다(`.env.example`의 두 값은 참고용이다). rewrite는 `next.config.ts`가 평가될 때(`next dev` 시작, `next build`) 정해지므로 값을 바꾸면 Web을 다시 시작(프로덕션은 다시 빌드)해야 한다. 기본값이 로컬 환경과 일치하므로 보통 설정할 필요가 없다.

## 주요 스크립트

| 명령                 | 설명                                         |
| -------------------- | -------------------------------------------- |
| `pnpm dev`           | contracts 빌드 후 api·web 개발 서버 실행     |
| `pnpm build`         | 전체 워크스페이스 빌드                       |
| `pnpm lint`          | 전체 린트                                    |
| `pnpm typecheck`     | 전체 타입 검사                               |
| `pnpm test`          | 단위 테스트                                  |
| `pnpm test:e2e`      | API e2e 테스트 (Testcontainers, Docker 필요) |
| `pnpm db:up`         | docker compose로 PostgreSQL 기동             |
| `pnpm db:up:storage` | s3mock까지 함께 기동 (이미지 업로드에 필요)  |
| `pnpm db:migrate`    | DB 마이그레이션 적용(API 빌드 포함)          |
| `pnpm db:seed`       | 데모 계정 시드(API 빌드 포함)                |
| `pnpm format`        | Prettier 포맷 적용                           |
| `pnpm format:check`  | 포맷 검사 (CI에서 사용)                      |

## 주요 기능 (M2 상품·이미지)

- 상품 목록: 필터·정렬·페이지를 URL 쿼리와 동기화해 새로고침해도 유지된다.
- 상품 등록·수정·삭제 (역할별 권한 적용, 뷰어는 읽기 전용).
- 이미지 업로드·리사이즈: 업로드한 이미지를 WebP로 변환해 저장하고 `/media/{key}`로 제공한다.

## 주요 기능 (M3 주문·재고)

- 주문 목록: 상태 탭, KST 기간 프리셋(오늘·7일·30일), 주문번호·고객 검색을 URL 쿼리와 동기화한다. 개발 편의용 가상 주문 생성 버튼이 있다.
- 주문 상세: 품목, 상태 타임라인, 상태 전이(확정·배송·완료·취소). 전이는 한 트랜잭션에서 주문 행과 재고를 함께 바꾼다. 재고가 부족하면 품목별로 안내하고(422), 다른 사용자가 먼저 상태를 바꿨으면 충돌 안내(409)를 보여준다.
- 재고: 상품 화면에서 입고·출고로 재고를 수동 조정하고, 모든 재고 변동(주문 확정·취소, 수동 조정)을 이력으로 확인한다. 이력의 주문번호는 주문 상세로 연결된다.

## 주요 기능 (M4 대시보드)

- KPI 카드 4개: 오늘 매출·오늘 주문·처리 대기·재고 부족. 오늘 매출과 오늘 주문은 전일 대비 증감률을 보이고, 전일 실적이 0이면 "전일 실적 없음"으로 표시한다.
  - 오늘 매출: `CONFIRMED`·`SHIPPED`·`DELIVERED` 주문의 합계를 확정 시각(`confirmedAt`) 기준 KST 날짜로 센다. `PENDING`과 확정 후 취소된 주문은 빠진다.
  - 오늘 주문: 오늘 접수(`createdAt`)된 주문 수. 상태는 가리지 않는다(취소 포함).
  - 처리 대기: 확정 대기(`PENDING`)와 출고 대기(`CONFIRMED`) 건수. 기간과 무관한 현재 상태다.
  - 재고 부족: 안전 재고 이하이고 삭제되지 않은 상품 수. 상품 목록의 `lowStock=true`와 같은 조건이라 카드를 누르면 같은 숫자의 목록으로 간다.
- 매출 추이 라인차트와 카테고리별 매출 도넛. 기간 토글(7일·30일·90일)은 `?days=`로 URL에 남는다. 매출 없는 날도 0으로 채운다. 매출이 있는 카테고리가 6개를 넘으면 상위 6개와 "기타"로 묶는다.
- 최근 주문 5건과 재고 부족 상품 5건.
- API: `GET /api/v1/dashboard/summary`, `/dashboard/sales-trend?days=`, `/dashboard/category-sales?days=` (모두 VIEWER 이상).

## 설계 문서

[docs/2026-11-20-commerce-backoffice-design.md](docs/2026-11-20-commerce-backoffice-design.md)

## 설계 결정

TODO (M6에서 정리)

- 이미지는 업로드 후 미연결 상태로 저장했다가 상품 저장 시 트랜잭션으로 연결한다.
- 주문 확정은 비관적 락으로 처리한다. 재고 행을 productId 순으로 `FOR UPDATE` 잠근다. 낙관적 락(`@VersionColumn`)과 비교하면, 충돌이 잦은 인기 상품에서 재시도가 폭주하는 대신 짧게 기다리고, 잠금 순서를 고정해 교착을 막는다.
- 재고 변경은 `InventoryLedger` 한 곳으로만 한다. 이력 누락을 구조적으로 막는다.
- 상품 수정은 `FOR NO KEY UPDATE`로 잠근다. 재고 이력·주문 품목의 외래 키 확인(`FOR KEY SHARE`)과 충돌하지 않게 해 주문 확정과의 교착을 막는다(동시 실험에서 재현 후 수정, 결정적 회귀 테스트 포함).
- 감수한 트레이드오프: 두 탭이 같은 refresh 토큰으로 동시에 갱신하면 늦은 쪽 요청은 재사용으로 간주되어 토큰 패밀리 전체가 폐기되고 인증 쿠키 두 개가 모두 삭제된다. 진 탭은 즉시 `/login?reason=expired`로 이동하고, 쿠키는 탭끼리 공유되므로 다른 탭도 다음 요청·이동 때 로그인 화면으로 보내진다. 리다이렉트 루프는 생기지 않는다. 짧은 유예 구간(grace window)으로 나중에 완화할 수 있다.
- 매출은 확정 시각(`confirmedAt`) 기준, KST 날짜 버킷이다. 접수가 아니라 확정이 매출이고, 확정 후 취소는 빠진다. 시각은 `CLOCK`으로 주입해 자정 경계를 테스트로 고정했다.
- 재고 부족·최근 주문은 전용 API 없이 목록 API(`/orders?size=5`, `/products?lowStock=true`)를 재사용한다. 대시보드와 목록의 숫자가 갈라지지 않게 하려는 것이다.
