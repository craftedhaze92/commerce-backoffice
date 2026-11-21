# Commerce Back-office

이커머스 운영자를 위한 백오피스(상품·주문·재고 관리) 포트폴리오 프로젝트. 현재는 기반 구조, 인증/권한, 상품·이미지 관리(M0–M2)까지 구현되어 있다.

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

# 3. DB·스토리지 기동, 마이그레이션, 시드 (상품 이미지가 있어 스토리지가 필요하다)
pnpm db:up:storage && pnpm db:migrate && pnpm db:seed

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

> Web의 `/api/v1` 프록시 대상 `API_ORIGIN`은 Next가 `apps/web/.env*`에서 읽는다. 루트 `.env`는 Next가 로드하지 않으며, 기본값(`http://localhost:4000`)이 로컬 API와 일치하므로 보통 설정할 필요가 없다.

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

## 설계 문서

[docs/2026-11-20-commerce-backoffice-design.md](docs/2026-11-20-commerce-backoffice-design.md)

## 설계 결정

TODO (M6에서 정리)

- 이미지는 업로드 후 미연결 상태로 저장했다가 상품 저장 시 트랜잭션으로 연결한다.
- 감수한 트레이드오프: 두 탭이 같은 refresh 토큰으로 동시에 갱신하면 늦은 쪽 요청은 재사용으로 간주되어 토큰 패밀리 전체가 폐기되고 인증 쿠키 두 개가 모두 삭제된다. 진 탭은 즉시 `/login?reason=expired`로 이동하고, 쿠키는 탭끼리 공유되므로 다른 탭도 다음 요청·이동 때 로그인 화면으로 보내진다. 리다이렉트 루프는 생기지 않는다. 짧은 유예 구간(grace window)으로 나중에 완화할 수 있다.
