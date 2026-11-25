# 배포 절차 (공개 데모)

공개 데모를 아래 구성으로 배포하는 절차다.

```
브라우저 ──> Vercel (apps/web, Next)
              ├─ /api/*   rewrite ──> Railway api 서비스 (apps/api) ──> Railway PostgreSQL
              └─ /media/* rewrite ──> Cloudflare R2 공개 URL
                                      ↑ api는 S3 API로 R2에 업로드한다
```

> 클라우드 콘솔의 메뉴 이름과 화면 구성은 바뀔 수 있다. 이 문서의 단계는 작성 시점의 화면을 기준으로 한다.

브라우저는 Vercel 도메인만 상대한다. 인증 쿠키(`bo_at`, `bo_rt`)도 Vercel 도메인의 1st-party 쿠키로 저장된다.

> **사용자가 직접 할 일:** Cloudflare·Railway·Vercel 계정 생성, 결제 수단 등록, 약관 동의, 그리고 비밀 값(`JWT_SECRET`, R2 액세스 키 등) 생성과 입력은 사용자가 각 서비스 콘솔에서 직접 한다. 이 문서의 URL과 값은 모두 자리표시자(`<...>`)다. 실제 값을 저장소에 커밋하지 않는다.

순서는 R2 → Railway → Vercel이다. 앞 단계에서 나온 값이 다음 단계의 환경 변수가 된다.

## 1. Cloudflare R2 (이미지 저장소)

1. Cloudflare 대시보드 → **R2 Object Storage**에서 버킷을 만든다. 예: `bo-media`. 이 이름이 `S3_BUCKET`이다.
2. 버킷 → **Settings → Public access**에서 공개 URL을 연다. 둘 중 하나를 고른다.
   - `r2.dev` 서브도메인 허용. 주소는 `https://pub-<hash>.r2.dev` 형태다. 데모 용도로 충분하다.
   - 커스텀 도메인 연결(`https://media.<your-domain>`).

   이 공개 URL이 Vercel의 `MEDIA_ORIGIN`이다. 공개 URL은 버킷 루트를 가리키므로 뒤에 버킷 이름을 붙이지 않는다.

3. **R2 → Manage R2 API Tokens → Create API token**에서 권한 **Object Read & Write**, 대상은 위 버킷 하나로 제한한 토큰을 만든다. 생성 화면에 한 번만 보이는 값을 옮겨 둔다.
   - Access Key ID → `S3_ACCESS_KEY_ID`
   - Secret Access Key → `S3_SECRET_ACCESS_KEY`
   - S3 엔드포인트 `https://<account-id>.r2.cloudflarestorage.com` → `S3_ENDPOINT`

## 2. Railway (PostgreSQL + api)

### 2-1. 프로젝트와 PostgreSQL

1. Railway에서 새 프로젝트를 만들고 GitHub 저장소를 연결한다.
2. **+ New → Database → PostgreSQL**을 추가한다. 서비스 이름이 `Postgres`라면 api 서비스에서 `${{Postgres.DATABASE_URL}}`로 참조할 수 있다(사설 네트워크 주소).

### 2-2. api 서비스

저장소에서 서비스를 하나 만들고 **Settings**를 아래처럼 채운다. Root Directory는 비워 둔다(저장소 루트). 워크스페이스 전체를 설치해야 `@bo/contracts`를 빌드할 수 있기 때문이다.

| 항목               | 값                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Build Command      | `pnpm install --frozen-lockfile && pnpm --filter @bo/contracts build && pnpm --filter api build` |
| Pre-deploy Command | `pnpm --filter api db:migrate`                                                                   |
| Start Command      | `node apps/api/dist/main.js`                                                                     |
| Healthcheck Path   | `/api/v1/health`                                                                                 |
| Networking         | **Generate Domain**으로 공개 도메인을 만든다. 예: `https://<railway-app>.up.railway.app`         |

- Node는 24를 쓴다. 빌더가 다른 버전을 고르면 서비스 변수로 버전을 지정한다(예: Railpack은 `RAILPACK_NODE_VERSION=24`).
- pnpm 버전은 루트 `package.json`의 `packageManager`를 따른다.
- `PORT`는 Railway가 넣어 준다. 직접 지정하지 않는다.
- Pre-deploy는 빌드가 끝난 이미지에서 돈다. `db:migrate`는 `apps/api/dist/database/cli-data-source.js`로 마이그레이션을 적용하고, 이 파일도 아래 환경 변수 검증(`validateEnv`)을 통과해야 한다.

### 2-3. 환경 변수 (api 서비스 → Variables)

| 변수                     | 값 예시                                         | 비고                                                                                       |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `NODE_ENV`               | `production`                                    | 쿠키에 `Secure`가 붙는다. `.env.example`의 `JWT_SECRET` 예시 값을 거부한다.                |
| `DATABASE_URL`           | `${{Postgres.DATABASE_URL}}`                    | Railway 참조 변수                                                                          |
| `JWT_SECRET`             | `openssl rand -base64 48` 출력                  | 사용자가 로컬에서 생성해 붙여 넣는다. 32자 이상이어야 한다.                                |
| `ACCESS_TTL_SEC`         | `900`                                           | 생략하면 기본값                                                                            |
| `REFRESH_TTL_SEC`        | `604800`                                        | 생략하면 기본값                                                                            |
| `WEB_ORIGIN`             | `https://<vercel-app>.vercel.app`               | 3단계에서 정해지는 Vercel 주소. CORS 허용 출처다.                                          |
| `TRUST_PROXY`            | `1`                                             | 5단계에서 실제 홉 수를 확인해 조정한다.                                                    |
| `LOGIN_THROTTLE_LIMIT`   | `10`                                            | (IP, 이메일)마다 허용 횟수. 생략하면 10                                                    |
| `LOGIN_THROTTLE_TTL_SEC` | `600`                                           | 생략하면 600초                                                                             |
| `DEMO_MODE`              | `true`                                          | 데모 계정의 역할·활성 상태 변경을 막는다.                                                  |
| `SEED_PASSWORD`          | `demo1234!`                                     | 시드 데모 계정 비밀번호. README의 데모 비밀번호와 같아야 로그인 화면 빠른 선택이 동작한다. |
| `S3_ENDPOINT`            | `https://<account-id>.r2.cloudflarestorage.com` | 1단계                                                                                      |
| `S3_REGION`              | `auto`                                          | R2는 `auto`를 쓴다.                                                                        |
| `S3_BUCKET`              | `bo-media`                                      | 1단계 버킷 이름                                                                            |
| `S3_ACCESS_KEY_ID`       | `<R2 Access Key ID>`                            | 1단계                                                                                      |
| `S3_SECRET_ACCESS_KEY`   | `<R2 Secret Access Key>`                        | 1단계                                                                                      |
| `S3_FORCE_PATH_STYLE`    | `true`                                          | R2는 path-style을 지원한다.                                                                |

로그인 시도 카운터는 프로세스 메모리에 둔다(`@nestjs/throttler` 기본 저장소). api 인스턴스가 하나일 때만 정확하고, 재시작하면 초기화된다. 인스턴스를 늘리려면 Redis 같은 공유 저장소로 바꿔야 한다.

### 2-4. 최초 1회 시드

데모 데이터(계정 3개, 카테고리·상품, 주문 1,500건)는 한 번만 넣으면 된다. 시드는 멱등이라 다시 돌려도 중복되지 않는다.

1. api 서비스의 Pre-deploy Command를 잠시 `pnpm --filter api db:migrate && pnpm --filter api db:seed`로 바꾸고 다시 배포한다.
2. 배포 로그에서 `Seeded ... orders`(또는 `Orders already present, skipped`)를 확인한다.
3. Pre-deploy Command를 `pnpm --filter api db:migrate`로 되돌린다.

Railway CLI를 쓴다면 `railway ssh`로 서비스 컨테이너에 들어가 `pnpm --filter api db:seed`를 실행해도 된다.

## 3. Vercel (apps/web)

1. Vercel에서 같은 저장소로 새 프로젝트를 만든다(Framework Preset: Next.js).
2. **Root Directory**를 `apps/web`으로 지정한다. Vercel이 pnpm 워크스페이스를 감지해 저장소 루트에서 설치한다.
3. **Build Command**를 `pnpm --filter @bo/contracts build && pnpm build`로 바꾼다. Web은 빌드된 `@bo/contracts`(`dist/`)를 import하므로 먼저 빌드해야 한다.
4. **Environment Variables** (Production):

   | 변수           | 값                                                   |
   | -------------- | ---------------------------------------------------- |
   | `API_ORIGIN`   | `https://<railway-app>.up.railway.app` (끝 `/` 없이) |
   | `MEDIA_ORIGIN` | `https://pub-<hash>.r2.dev` (1단계 공개 URL)         |

   두 값은 `apps/web/next.config.ts`의 rewrite 대상이다. rewrite는 빌드할 때 정해지므로 값을 바꾸면 **다시 배포(재빌드)**해야 한다.

5. 배포가 끝나면 나온 주소(`https://<vercel-app>.vercel.app`)를 Railway api의 `WEB_ORIGIN`에 넣고 api를 다시 배포한다.

## 4. 배포 후 점검 목록

Vercel 주소에서 확인한다.

- [ ] **로그인:** 로그인 화면의 데모 계정 빠른 선택(admin·manager·viewer)으로 로그인되고, 새로고침해도 세션이 유지된다.
- [ ] **쿠키:** 개발자 도구 → Application → Cookies에서 `bo_at`(HttpOnly, Lax, `Path=/`)과 `bo_rt`(HttpOnly, Strict, `Path=/api/v1/auth`)에 **Secure**가 붙어 있다.
- [ ] **로그인 제한:** 틀린 비밀번호로 `LOGIN_THROTTLE_LIMIT`회를 넘기면 429와 안내 문구가 나오고, 응답에 `Retry-After` 헤더가 있다. 다른 이메일은 막히지 않는다.
- [ ] **이미지:** MANAGER 이상으로 상품 이미지를 업로드하면 R2 버킷에 오브젝트가 생기고, 목록·상세에서 `/media/...` 이미지가 보인다.
- [ ] **엑셀:** 상품·주문 목록의 엑셀 다운로드가 `.xlsx` 파일로 받아지고 열린다.
- [ ] **API 문서:** `https://<vercel-app>.vercel.app/api/docs`(또는 Railway 주소의 `/api/docs`)에서 Swagger가 열린다.
- [ ] **데모 보호:** ADMIN 데모 계정으로 다른 데모 계정의 역할을 바꾸면 거부된다(`DEMO_MODE=true`).

## 5. `TRUST_PROXY` 홉 수 확인

로그인 제한은 `req.ip`를 키로 쓴다. `TRUST_PROXY`는 Express가 `X-Forwarded-For`의 오른쪽에서 몇 개를 믿을지 정한다.

- 너무 작으면 `req.ip`가 프록시 주소가 된다. 모든 사용자가 같은 IP로 묶여, 한 사람이 어떤 이메일로 제한을 넘기면 그 이메일은 모든 사용자에게 막힌다.
- 너무 크면 클라이언트가 보낸 `X-Forwarded-For` 값을 믿게 된다. 헤더를 바꿔 가며 제한을 우회할 수 있다.

이 구성은 요청이 Vercel과 Railway 엣지를 거쳐 오므로 2가 될 가능성이 크다. 그래도 추측하지 말고 아래처럼 확인한다.

1. `TRUST_PROXY=1`로 배포한 상태에서, `apps/api/src/main.ts`의 `configureApp(app, env);` 바로 아래에 **임시로** 로그를 넣고 배포한다.

   ```ts
   app.use((req: import('express').Request, _res: unknown, next: () => void) => {
     console.log('[ip-check]', req.ip, req.headers['x-forwarded-for']);
     next();
   });
   ```

2. 브라우저로 Vercel 주소에서 로그인을 한 번 시도하고, Railway 로그의 `[ip-check]` 줄을 본다.
   - 본인의 공인 IP(공인 IP 확인 서비스로 미리 알아 둔다)가 `x-forwarded-for`의 오른쪽에서 몇 번째인지 센다. 그 순번이 `TRUST_PROXY` 값이다. 예: `<내 IP>, <Vercel IP>`면 2다.
   - `req.ip`가 본인 IP와 같아질 때까지 값을 맞추고 다시 배포한다.
3. 위조 확인: `curl -X POST https://<vercel-app>.vercel.app/api/v1/auth/login -H 'X-Requested-With: fetch' -H 'Content-Type: application/json' -H 'X-Forwarded-For: 203.0.113.9' -d '{"email":"x@example.com","password":"x"}'`를 보내고, 로그의 `req.ip`가 `203.0.113.9`가 **아닌지** 확인한다.
   - 한계: Vercel을 거치지 않고 Railway 주소로 직접 보내면 홉이 하나 적다. `TRUST_PROXY=2`라면 이 경로에서는 위조한 값이 `req.ip`가 될 수 있다. `TRUST_PROXY=2`에서는 Railway 도메인을 아는 사람이라면 누구든 `X-Forwarded-For`의 가장 왼쪽 값을 계속 바꿔 가며 로그인 제한을 완전히 우회할 수 있다(IP 하나를 위조하는 데서 그치지 않는다). 같은 위조 curl을 Vercel이 아니라 Railway 도메인으로 직접 보내 로그의 `req.ip`가 위조한 값이 되는지 확인해 본다. 공개 데모에서는 이 한계를 받아들인다. 막아야 한다면 Vercel에서만 붙이는 비밀 헤더를 api가 확인하는 식으로 직접 접근을 차단한다.
4. 확인이 끝나면 임시 로그를 **지우고** 다시 배포한다. IP는 개인정보이므로 남겨 두지 않는다.
