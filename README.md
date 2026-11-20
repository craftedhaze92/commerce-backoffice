# Commerce Back-office

이커머스 운영자를 위한 백오피스(상품·주문·재고 관리) 포트폴리오 프로젝트. 현재는 기반 구조와 인증/권한(M0–M1)까지 구현되어 있다.

## 기술 스택

- 모노레포: pnpm workspace (Node 24)
- API: NestJS 12 (ESM), TypeORM, PostgreSQL 16, Vitest + Testcontainers
- Web: Next.js 16, Tailwind CSS
- 공용 계약: `@bo/contracts` (Zod 스키마, tsup 빌드)
- 인프라: docker compose (PostgreSQL, MinIO)
- CI: GitHub Actions

## 로컬 실행

사전 준비: Node 24, pnpm 10, Docker.

```bash
# 1. 환경 변수 준비
cp .env.example .env

# 2. 의존성 설치
pnpm install

# 3. DB 기동, 마이그레이션, 시드
pnpm db:up && pnpm db:migrate && pnpm db:seed

# 4. 개발 서버 (web :3000, api :4000)
pnpm dev
```

`http://localhost:3000`에서 아래 데모 계정으로 로그인할 수 있다.

> `pnpm db:up`은 PostgreSQL만 띄운다. MinIO는 M2(이미지 업로드)부터 필요하며 `pnpm db:up:storage`로 함께 기동한다.

> PostgreSQL 호스트 포트는 로컬 Postgres(5432)와 겹치지 않도록 **5433**(`PG_PORT`)을 쓴다. 포트를 바꾸면 `.env`의 `DATABASE_URL`도 함께 바꾼다.

### 데모 계정

| 이메일           | 역할    | 비밀번호    |
| ---------------- | ------- | ----------- |
| admin@demo.com   | ADMIN   | `demo1234!` |
| manager@demo.com | MANAGER | `demo1234!` |
| viewer@demo.com  | VIEWER  | `demo1234!` |

비밀번호는 `.env`의 `SEED_PASSWORD`로 바꿀 수 있다.

## 주요 스크립트

| 명령                 | 설명                                            |
| -------------------- | ----------------------------------------------- |
| `pnpm dev`           | contracts 빌드 후 api·web 개발 서버 실행        |
| `pnpm build`         | 전체 워크스페이스 빌드                          |
| `pnpm lint`          | 전체 린트                                       |
| `pnpm typecheck`     | 전체 타입 검사                                  |
| `pnpm test`          | 단위 테스트                                     |
| `pnpm test:e2e`      | API e2e 테스트 (Testcontainers, Docker 필요)    |
| `pnpm db:up`         | docker compose로 PostgreSQL·MinIO 기동          |
| `pnpm db:up:storage` | MinIO까지 함께 기동 (M2 이미지 업로드부터 필요) |
| `pnpm db:migrate`    | DB 마이그레이션 적용(API 빌드 포함)             |
| `pnpm db:seed`       | 데모 계정 시드(API 빌드 포함)                   |
| `pnpm format`        | Prettier 포맷 적용                              |
| `pnpm format:check`  | 포맷 검사 (CI에서 사용)                         |

## 설계 문서

[docs/2026-11-20-commerce-backoffice-design.md](docs/2026-11-20-commerce-backoffice-design.md)

## 설계 결정

TODO (M6에서 정리)

- 감수한 트레이드오프: 같은 refresh 토큰으로 두 탭이 동시에 갱신을 요청하면 재사용으로 간주되어 로그아웃된다.
