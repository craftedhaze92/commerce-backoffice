# 커머스 백오피스 — 설계 문서

> 작성일: 2026-11-20 · 상태: 검토 대기
> 표기: **[결정]** = 사용자가 정한 것 · **[제안]** = 설계자가 정한 것(바꿔도 됨)

---

## 1. 목적과 배경

**취업용 포트폴리오.** 면접관이 "실무 어드민을 만들어 본 사람"이라고 바로 알아볼 수 있는
풀스택 프로젝트를 만든다. 화면만 있는 목업이 아니라, Nest API 서버가 끝까지 동작하고
인증·권한·페이지네이션·트랜잭션이 실제로 돌아가는 것이 핵심이다.

프론트는 기존 프로젝트 **물타기(평단구조대)** 의 패키지 구성·코드 규칙·UI(색 토큰, Shadcn
컴포넌트)를 그대로 가져와 "일관된 개발 스타일을 가진 사람"이라는 인상을 준다.

### 성공 기준

- 리뷰어가 레포를 클론하고 `docker compose up` + `pnpm dev` 두 줄로 전체를 띄울 수 있다.
- 역할별 데모 계정(ADMIN / MANAGER / VIEWER)으로 로그인해 권한 차이를 직접 확인할 수 있다.
- "동시에 두 명이 같은 주문을 확정하면?" 같은 질문에 테스트 코드로 답할 수 있다.
- README에 핵심 설계 결정과 그 이유가 정리되어 있다 (물타기 README 형식).

## 2. 목표 / 비목표 / 실패 조건

### 목표

| 영역     | 내용                                                  |
| -------- | ----------------------------------------------------- |
| 인증     | JWT 기반 로그인·로그아웃·토큰 갱신                    |
| 권한     | 3단계 RBAC, 서버·클라이언트 양쪽에서 강제             |
| 리스트   | 서버 페이지네이션 + 검색·필터·정렬, URL 동기화        |
| 대시보드 | KPI 카드 + 차트 (recharts)                            |
| 파일     | 상품 이미지 다중 업로드, 서버에서 리사이즈·썸네일     |
| 트랜잭션 | 주문 확정 시 재고 차감 (비관적 락)                    |
| 엑셀     | 현재 필터 조건 그대로 상품·주문 목록 `.xlsx` 다운로드 |

### 비목표

결제 연동, 고객용 쇼핑몰 화면, 배송사 API 연동, 다국어, 실시간 알림(WebSocket), MSA.

### 실패 조건 (동작해도 실패로 본다)

- 권한 검사가 프론트에만 있다 (API를 직접 호출하면 뚫린다).
- 재고가 음수가 되는 경로가 하나라도 있다.
- 로컬에서 띄우는 데 README 외의 지식이 필요하다.
- 기능만 많고 테스트가 없다. 트랜잭션·권한 로직에 테스트가 없으면 포트폴리오 가치가 반감된다.

## 3. 기술 스택

### 프론트 `apps/web` — 물타기 기준 **[결정]**

| 영역            | 선택                                          | 비고                                                                    |
| --------------- | --------------------------------------------- | ----------------------------------------------------------------------- |
| 프레임워크      | Next.js 16 (App Router), TypeScript strict    |                                                                         |
| 스타일          | Tailwind v4 + Shadcn UI (radix-nova, neutral) | 물타기 `globals.css` 토큰·`shared/ui` 이식                              |
| 서버 상태       | TanStack Query v5                             |                                                                         |
| 클라이언트 상태 | Zustand                                       |                                                                         |
| 폼              | react-hook-form + zod                         |                                                                         |
| 차트            | recharts                                      |                                                                         |
| 테스트          | Vitest + RTL + MSW                            |                                                                         |
| 린트            | ESLint 9 + eslint-plugin-boundaries (FSD)     |                                                                         |
| 추가            | **TanStack Table** **[제안]**                 | 정렬·컬럼 표시 제어 등 어드민 테이블용. Shadcn data-table 패턴과 맞물림 |

### 백엔드 `apps/api` **[결정]**

| 영역              | 선택                                              |
| ----------------- | ------------------------------------------------- |
| 런타임/프레임워크 | Node.js LTS + NestJS                              |
| DB                | PostgreSQL 16                                     |
| ORM               | TypeORM (`synchronize: false`, 마이그레이션 사용) |

| 영역     | 선택 **[제안]**                              | 이유                               |
| -------- | -------------------------------------------- | ---------------------------------- |
| 검증     | class-validator + class-transformer          | Nest 표준                          |
| 인증     | @nestjs/passport + passport-jwt, argon2      |                                    |
| 업로드   | Multer(메모리) + sharp                       | 서버에서 이미지 가공               |
| 스토리지 | MinIO (S3 호환, docker) + AWS SDK v3         | 배포 시 S3/R2로 엔드포인트만 교체  |
| 엑셀     | exceljs (스트리밍 WorkbookWriter)            | 대용량에서도 메모리 일정           |
| 문서     | @nestjs/swagger                              | 리뷰어가 API를 바로 눌러볼 수 있음 |
| 테스트   | Jest + Supertest, Testcontainers(PostgreSQL) | 트랜잭션·락은 실 DB로만 검증 가능  |
| 로깅     | nestjs-pino                                  |                                    |

### 저장소 구조 **[제안]**

pnpm workspace 모노레포. 리뷰어가 레포 하나로 전체를 보게 한다.

```
commerce-backoffice/
├── apps/
│   ├── web/              Next.js (물타기 FSD 구조)
│   └── api/              NestJS
├── packages/
│   └── contracts/        공유 enum·응답 타입 (Role, OrderStatus, Paginated<T> ...)
├── docker-compose.yml    postgres, minio
├── .github/workflows/    lint · typecheck · test · build
└── docs/
```

`contracts`에는 **타입과 enum만** 둔다. 검증 로직은 각 앱이 따로 갖는다(서버 class-validator,
프론트 zod). 런타임 코드를 공유하면 빌드 설정이 복잡해지는데, 그만큼의 이득이 없다.

## 4. 접근 방식 — 프론트와 API를 어떻게 연결하나

| 방식                                | 내용                         | 장점                                                   | 단점                                                                                     |
| ----------------------------------- | ---------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| A. 브라우저 → Nest 직접 호출 (CORS) | web과 api가 서로 다른 출처   | 구조 단순                                              | 쿠키가 cross-site가 되어 `SameSite=None; Secure` 필요, 로컬·배포 환경 차이로 디버깅 부담 |
| **B. Next rewrites 프록시 (선택)**  | `/api/*` → Nest로 rewrite    | 같은 출처라 httpOnly 쿠키가 자연스럽게 동작, CORS 없음 | 배포 시 web이 api 주소를 알아야 함 (env 하나)                                            |
| C. Next Route Handler BFF           | Next 서버가 모든 요청을 중계 | 토큰을 완전히 서버에 숨김                              | 모든 API를 두 번 구현, 포트폴리오 범위 대비 과함                                         |

**B를 택한다** **[제안]**. 쿠키 기반 인증을 가장 적은 코드로 안전하게 쓸 수 있고,
"왜 CORS 대신 프록시를 썼나"는 그 자체로 면접 소재가 된다.

## 5. 도메인 모델

```
User ──< RefreshToken
User ──< InventoryHistory (actor)

Category ──< Product ──1 Inventory
             Product ──< ProductImage
             Product ──< OrderItem >── Order
             Product ──< InventoryHistory
```

| 엔티티               | 주요 필드                                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`               | id, email(unique), passwordHash, name, role(`ADMIN`·`MANAGER`·`VIEWER`), isActive, createdAt                                                                |
| `RefreshToken`       | id, userId, tokenHash, familyId, expiresAt, revokedAt                                                                                                       |
| `Category`           | id, name                                                                                                                                                    |
| `Product`            | id, sku(unique), name, categoryId, price(int, 원), status(`DRAFT`·`ON_SALE`·`SOLD_OUT`·`HIDDEN`), description, createdAt, updatedAt, deletedAt(soft delete) |
| `ProductImage`       | id, productId(null 허용), objectKey, thumbKey, width, height, sortOrder, isPrimary                                                                          |
| `Inventory`          | productId(PK), quantity(`CHECK >= 0`), safetyStock, updatedAt                                                                                               |
| `Order`              | id, orderNo(unique), customerName, status, totalAmount, createdAt, confirmedAt, cancelledAt                                                                 |
| `OrderItem`          | id, orderId, productId, quantity, unitPrice(주문 시점 가격 스냅샷)                                                                                          |
| `InventoryHistory`   | id, productId, delta, reason(`ORDER_CONFIRM`·`ORDER_CANCEL`·`MANUAL_ADJUST`), refOrderId, actorId, createdAt                                                |
| `OrderStatusHistory` | id, orderId, fromStatus, toStatus, actorId, createdAt (주문 상세 타임라인용. 상태 전이와 같은 트랜잭션에서 기록)                                            |

- `orderNo`는 `ORD-20261120-0001` 형식이다 **[제안]**.
- `PENDING` 주문은 재고를 미리 잡아두지 않는다(예약 없음). 재고는 확정 시점에만 차감한다.
  그래서 확정 시점에 재고가 부족할 수 있고, 6.2의 실패 처리가 필요하다.

- 금액은 정수(원)로 저장한다. 소수 오차를 원천 차단한다.
- `Inventory.quantity`에 DB `CHECK` 제약을 건다. 코드에 버그가 있어도 DB가 마지막 방어선이 된다.

## 6. 핵심 비즈니스 로직

### 6.1 주문 상태 머신

```
PENDING ──확정──▶ CONFIRMED ──출고──▶ SHIPPED ──완료──▶ DELIVERED
   │                 │
   └──취소──▶ CANCELLED ◀──취소──┘
```

허용되지 않은 전이는 `409 Conflict`. 전이 규칙은 순수 함수 하나(`canTransition(from, to)`)로 두고
단위 테스트한다.

### 6.2 주문 확정 트랜잭션 (핵심)

`POST /orders/:id/confirm` — 하나의 트랜잭션 안에서:

1. `Order`를 `FOR UPDATE`로 잠그고 상태가 `PENDING`인지 확인 (아니면 409)
2. 주문 품목의 `Inventory` 행을 **productId 오름차순으로** `FOR UPDATE` 잠금
   - 항상 같은 순서로 잠가 교착 상태(deadlock)를 막는다.
3. 품목 하나라도 `quantity < 요청 수량`이면 전체 롤백, `422`와 부족 품목 목록 반환
4. 재고 차감 → `InventoryHistory` 기록 → `Order.status = CONFIRMED`, `confirmedAt` 기록 → `OrderStatusHistory` 기록
5. 재고가 `safetyStock` 이하가 되면 대시보드 "재고 부족"에 잡힌다 (조회 시 계산, 별도 저장 없음)

`CONFIRMED` 주문 취소는 같은 구조로 재고를 되돌린다. `PENDING` 취소는 재고 변화가 없다.

구현은 `DataSource.transaction()` + `queryRunner.manager` + `lock: { mode: 'pessimistic_write' }`.

**왜 비관적 락인가 [제안]**: 재고는 충돌이 잦은 행(인기 상품)이고, 실패 후 재시도보다 잠깐
기다리는 편이 관리자 경험에 낫다. 낙관적 락(`@VersionColumn`)과의 비교는 README에 남긴다.

### 6.3 검증할 테스트 (Testcontainers 실 DB)

- 재고 10개, 수량 6짜리 주문 두 건을 **동시에** 확정 → 정확히 하나만 성공, 최종 재고 4
- 품목 A는 충분하고 B가 부족할 때 → A도 차감되지 않음 (원자성)
- 확정된 주문을 다시 확정 → 409, 재고 변화 없음
- 확정 후 취소 → 재고 원복, 이력 2건

## 7. 인증과 권한

### 7.1 토큰 전략 [제안]

| 토큰       | 저장                                                  | 만료                       | 비고                   |
| ---------- | ----------------------------------------------------- | -------------------------- | ---------------------- |
| Access JWT | httpOnly 쿠키, `SameSite=Lax`, `Path=/`               | JWT 15분 (쿠키 수명은 7일) | payload: `sub`, `role` |
| Refresh    | httpOnly 쿠키, `SameSite=Strict`, `Path=/api/v1/auth` | 7일                        | DB에 해시로 저장       |

- Access 쿠키는 `Path=/`여야 페이지 요청(`/dashboard` 등)에도 실려 `proxy.ts`가 볼 수 있다.
  쿠키 수명을 refresh와 같게 두는 이유는, JWT가 만료돼도 쿠키가 남아 있어야 `proxy.ts`가
  로그인 화면으로 튕기지 않고 클라이언트가 refresh를 시도할 수 있기 때문이다.
  만료 판정은 Nest가 JWT의 `exp`로 한다.
- 로그아웃은 refresh 토큰을 DB에서 폐기하고 두 쿠키를 모두 지운다.

- **Refresh Token Rotation**: 갱신할 때마다 새 토큰을 발급하고 이전 토큰을 폐기한다.
  이미 폐기된 토큰이 다시 오면 탈취로 보고 같은 `familyId` 전체를 폐기한다.
- **CSRF**: 같은 출처 + `SameSite=Lax`에 더해, 상태를 바꾸는 요청에는 `X-Requested-With` 헤더를 요구한다.
- 프론트의 401 처리: API 클라이언트가 401을 받으면 refresh를 **한 번만** 시도한다.
  동시에 여러 요청이 실패해도 refresh 요청은 하나로 합친다. 실패하면 `/login?next=...`로 보낸다.

### 7.2 RBAC

| 권한                                  | ADMIN | MANAGER | VIEWER |
| ------------------------------------- | :---: | :-----: | :----: |
| 대시보드 조회                         |   ✓   |    ✓    |   ✓    |
| 상품 조회                             |   ✓   |    ✓    |   ✓    |
| 상품 등록·수정·삭제, 이미지 업로드    |   ✓   |    ✓    |   –    |
| 재고 수동 조정                        |   ✓   |    ✓    |   –    |
| 주문 조회                             |   ✓   |    ✓    |   ✓    |
| 주문 상태 변경                        |   ✓   |    ✓    |   –    |
| 엑셀 다운로드                         |   ✓   |    ✓    |   –    |
| 사용자 관리 (초대·역할 변경·비활성화) |   ✓   |    –    |   –    |

- **서버**: 전역 `JwtAuthGuard` + `RolesGuard`, 컨트롤러에 `@Roles(Role.MANAGER)` 형태.
  역할은 계층형(ADMIN ⊃ MANAGER ⊃ VIEWER)으로 비교한다.
- **프론트**: 같은 표를 `packages/contracts`의 권한 맵으로 공유해 메뉴·버튼 노출을 제어한다.
  프론트 제어는 UX용이고, 보안은 서버가 책임진다.
- **라우트 보호**: Next `proxy.ts`(Next 16에서 middleware의 새 이름)에서 쿠키가 없으면
  `/login`으로 보낸다. 실제 토큰 검증은 Nest가 한다.
- 사용자 비활성화 시 그 사용자의 refresh 토큰을 모두 폐기한다.

## 8. API 규약

- 접두사 `/api/v1`. Swagger는 `/api/docs`.
- **목록 응답**
  ```json
  { "items": [...], "meta": { "page": 1, "size": 20, "total": 342, "totalPages": 18 } }
  ```
- **목록 쿼리**: `page`, `size`(최대 100), `sort=createdAt:desc`, 그 밖의 필터.
  정렬 가능한 컬럼은 화이트리스트로 제한한다 (SQL 인젝션 방지).
- **에러 응답** (전역 ExceptionFilter)
  ```json
  { "statusCode": 422, "code": "INSUFFICIENT_STOCK", "message": "...", "details": [...] }
  ```
  프론트는 `code`로 분기한다 (물타기의 `error-contract` 패턴).

### 엔드포인트 개요

| 메서드·경로                                                                   | 권한           | 설명                                                                               |
| ----------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------- |
| `POST /auth/login` · `/auth/refresh` · `/auth/logout` · `GET /auth/me`        | -              | 인증                                                                               |
| `GET /products`                                                               | VIEWER         | 검색(name·sku), categoryId, status, minPrice·maxPrice, 재고부족 여부, 정렬, 페이지 |
| `GET /products/:id`                                                           | VIEWER         |                                                                                    |
| `POST·PATCH·DELETE /products/:id`                                             | MANAGER        | 삭제는 soft delete                                                                 |
| `POST /products/images`                                                       | MANAGER        | multipart, 이미지 → `{ id, url, thumbUrl }`                                        |
| `PATCH /products/:id/inventory`                                               | MANAGER        | 수동 조정 (사유 필수, 트랜잭션 + 이력)                                             |
| `GET /orders`                                                                 | VIEWER         | status, 기간(from·to), 주문번호·고객명 검색, 페이지                                |
| `GET /orders/:id`                                                             | VIEWER         | 품목·상태 이력 포함                                                                |
| `POST /orders/:id/confirm·ship·deliver·cancel`                                | MANAGER        | 상태 전이                                                                          |
| `GET /products/export` · `GET /orders/export`                                 | MANAGER        | 목록과 같은 필터 쿼리 → `.xlsx`                                                    |
| `GET /dashboard/summary` · `/sales-trend?days=30` · `/category-sales?days=30` | VIEWER         | 집계. 최근 주문·재고 부족은 목록 API 재사용                                        |
| `GET·POST·PATCH /users`                                                       | ADMIN          | 사용자 관리                                                                        |
| `POST /dev/orders/random`                                                     | 개발 환경 전용 | 가상 주문 생성 (데모용)                                                            |

## 9. 파일 업로드 / 이미지 처리

1. 프론트: 드래그앤드롭으로 파일을 받고, 미리보기와 진행률을 보여준다. 이미지당 개별 요청으로 올린다.
2. 서버 검증: 5MB 이하, MIME이 jpeg·png·webp일 것, **매직 바이트로 실제 형식 확인**(확장자만 믿지 않는다), 상품당 최대 10장.
3. sharp로 가공: 원본을 최대 1600px webp로, 썸네일을 320px webp로 변환하고 EXIF를 제거한다.
4. MinIO에 `products/{yyyy}/{mm}/{uuid}.webp` 형태로 저장한다. `ProductImage`는 `productId = null` 상태로 만든다.
5. 상품 저장 시 이미지 id 배열(순서, 대표 여부 포함)을 함께 보내 연결한다.
6. 고아 이미지(연결 안 된 지 24시간 지난 것)는 `@nestjs/schedule` 크론으로 정리한다. **[선택 — 시간 남으면]**
   M6에서 구현할 때 정리 대상은 세 곳이다: 저장하지 않고 떠난 업로드(`productId`가 null), PATCH로 상품에서 떼어낸 이미지, 소프트 삭제된 상품에 붙은 이미지. 셋 다 DB 행과 오브젝트 스토리지 키를 함께 지워야 한다.

## 10. 엑셀 다운로드

- `GET /orders/export?status=CONFIRMED&from=...` — **목록 API와 같은 필터 DTO와 쿼리 빌더를 재사용**한다.
  화면에 보이는 조건 그대로 내려받게 하고, 필터 로직이 두 벌로 갈라지지 않게 하기 위해서다.
- exceljs `stream.xlsx.WorkbookWriter`로 응답에 바로 스트리밍한다. 최대 10,000행이며, 넘으면 `422`와 함께 필터를 좁히라는 안내를 보낸다.
- 시트 구성: 헤더 고정(freeze), 금액 컬럼은 `#,##0` 형식, 날짜는 KST 기준.
- 파일명은 `주문목록_20261120.xlsx`이다. 한글 파일명이 깨지지 않게 `Content-Disposition`에 RFC 5987 `filename*=UTF-8''...`을 쓴다.
- 프론트는 `fetch`로 blob을 받아 다운로드한다(쿠키 인증 유지). 받는 동안 버튼은 로딩 상태로 둔다.

## 11. 프론트엔드 설계

### 11.1 구조 (물타기 FSD 규칙 그대로)

```
apps/web/
├── app/                      라우팅 껍데기
│   ├── (auth)/login/
│   └── (admin)/              사이드바 레이아웃
│       ├── dashboard/  products/  products/[id]/  products/new/
│       ├── orders/  orders/[id]/
│       └── users/
└── src/
    ├── views/        dashboard, product-list, product-edit, order-list, order-detail, user-list, login
    ├── widgets/      admin-sidebar, kpi-cards, sales-trend-chart, category-sales-chart,
    │                 low-stock-table, product-table, order-table, order-timeline
    ├── features/     auth-login, auth-logout, product-filter, order-filter, upload-images,
    │                 change-order-status, adjust-inventory, export-excel, manage-user-role
    ├── entities/     session, user, product, order, category
    └── shared/       api(fetch 클라이언트, 401 처리), ui(물타기 이식), lib, config
```

### 11.2 상태 분리 (물타기 README의 "상태 두 갈래" 원칙 확장)

| 상태                                                   | 위치                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| 서버 데이터 (목록, 상세, 현재 사용자 `/me`)            | React Query                                                             |
| 목록 필터·정렬·페이지                                  | **URL 쿼리** (`useSearchParams` + zod 파싱). 새로고침·공유해도 유지된다 |
| UI 설정 (사이드바 접힘, 테이블 컬럼 표시, 페이지 크기) | Zustand + persist                                                       |

토큰은 httpOnly 쿠키에만 있으므로 프론트 전역 상태에 두지 않는다.

### 11.3 UI

- 물타기 `globals.css` 토큰과 `src/shared/ui/*`를 그대로 옮긴다. 사이드바는 Shadcn `sidebar`를 추가한다.
- 상태 뱃지 색: `PENDING` 회색, `CONFIRMED` 파랑(brand), `SHIPPED` 남색, `DELIVERED` 초록, `CANCELLED` 빨강.
- 테이블은 로딩 스켈레톤, 빈 상태, 에러와 재시도 세 가지를 모두 갖춘다 (물타기 스켈레톤 패턴 재사용).
- 다크모드는 범위 밖이다. 물타기처럼 라이트 전용으로 하고, 토큰 구조는 유지한다.

### 11.4 화면 목록

| 화면           | 주요 요소                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 로그인         | 이메일·비밀번호, 데모 계정 빠른 선택 버튼 3개                                                                             |
| 대시보드       | KPI 4개(오늘 매출·오늘 주문·처리 대기·재고 부족), 30일 매출 라인차트, 카테고리별 매출 도넛, 최근 주문 5건, 재고 부족 상품 |
| 상품 목록      | 검색, 카테고리·상태·가격 범위·재고부족 필터, 정렬, 페이지, 엑셀, 일괄 선택 후 상태 변경 **[선택]**                        |
| 상품 등록·수정 | RHF + zod 폼, 이미지 드래그 업로드·순서 변경·대표 지정, 재고 수동 조정 다이얼로그                                         |
| 주문 목록      | 상태 탭과 기간 필터, 검색, 페이지, 엑셀                                                                                   |
| 주문 상세      | 품목·금액, 상태 타임라인, 허용된 전이 버튼만 노출, 재고 부족 실패 시 품목별 안내                                          |
| 사용자 관리    | ADMIN 전용. 목록, 역할 변경, 비활성화                                                                                     |
| 403 / 404      | 권한 없음과 없는 페이지                                                                                                   |

## 12. 개발 환경과 품질

- `docker-compose.yml`: postgres, minio(+버킷 자동 생성)
- `pnpm db:migrate`, `pnpm db:seed`: 카테고리 8개, 상품 200개, 주문 1,500건(최근 90일 분포), 역할별 데모 계정
- GitHub Actions: lint → typecheck → test(api는 Testcontainers) → build
- 커밋은 물타기 컨벤션(Conventional Commits, 한글 제목)을 따른다.
- 완료 기준: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`가 모두 통과해야 한다.

## 13. 마일스톤

각 단계가 끝날 때마다 실제로 동작하는 상태를 만든다.

| #   | 단계          | 산출물                                                                  |
| --- | ------------- | ----------------------------------------------------------------------- |
| M0  | 기반          | 모노레포, docker compose, Nest·Next 스캐폴딩, 물타기 UI·린트 이식, CI   |
| M1  | 인증·권한     | 로그인·갱신·로그아웃, Guard, `proxy.ts`, 사이드바 레이아웃, 403 페이지  |
| M2  | 상품          | CRUD, 목록 필터·정렬·페이지(URL 동기화), 이미지 업로드                  |
| M3  | 주문·트랜잭션 | 상태 머신, 확정·취소 트랜잭션, 재고 조정, 동시성 테스트, 시드·가상 주문 |
| M4  | 대시보드      | 집계 API, KPI·차트                                                      |
| M5  | 엑셀          | 상품·주문 스트리밍 export                                               |
| M6  | 마무리        | 사용자 관리, Swagger 정리, README(설계 결정·스크린샷), 배포             |

배포 **[제안]**: web은 Vercel, api와 PostgreSQL은 Railway(또는 Render), 스토리지는 Cloudflare R2.
면접관이 링크 하나로 데모를 볼 수 있게 한다.

## 14. 빌더에게 맡기는 것

- 각 라이브러리의 세부 버전 (작업 시점의 최신 안정판)
- 컴포넌트 단위 분할, 세부 쿼리 최적화와 인덱스(필터 컬럼 기준으로 추가)
- 시드 데이터의 구체적인 상품명과 분포
- `[선택]` 표시 항목(고아 이미지 정리, 일괄 상태 변경)은 M6까지 시간이 남을 때만 한다

## 15. 미정 사항

- 프로젝트·서비스 이름
- 배포까지 할지, 로컬 실행까지만 할지 (현재 계획은 배포 포함)
