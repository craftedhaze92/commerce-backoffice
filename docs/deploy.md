# 배포 절차 (공개 데모, 무료 구성)

공개 데모를 비용 없이 배포하는 절차다. 세 서비스 모두 무료 플랜만 쓴다.

```
브라우저 ──> Vercel Hobby (apps/web, Next)
              └─ /api/*   rewrite ──> Render Free 웹 서비스 (apps/api) ──> Neon Free (PostgreSQL)
```

> 클라우드 서비스의 메뉴 이름, 화면 구성, 무료 한도는 바뀔 수 있다. 이 문서는 작성 시점(2026-11) 기준이다. 시작하기 전에 각 서비스의 요금 페이지에서 한도를 다시 확인한다.

브라우저는 Vercel 도메인만 상대한다. 인증 쿠키(`bo_at`, `bo_rt`)도 Vercel 도메인의 1st-party 쿠키로 저장된다.

> **사용자가 직접 할 일:** Neon·Render·Vercel 계정 생성, 약관 동의, 그리고 비밀 값(`JWT_SECRET`, DB 접속 문자열 등) 생성과 입력은 사용자가 각 서비스 콘솔에서 직접 한다. 이 문서의 URL과 값은 모두 자리표시자(`<...>`)다. 실제 값을 저장소에 커밋하지 않는다.

순서는 Neon → Render → Vercel이다. 앞 단계에서 나온 값이 다음 단계의 환경 변수가 된다.

## 0. 무료 구성의 한계

| 영역          | 서비스       | 결제 수단 | 알아 둘 점                                                                                                                                                  |
| ------------- | ------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| web           | Vercel Hobby | 필요 없음 | 개인·비상업 용도 플랜이다.                                                                                                                                  |
| api           | Render Free  | 필요 없음 | 15분 동안 요청이 없으면 잠들고, 다음 요청에서 깨어나는 데 1분 정도 걸린다. Pre-deploy Command와 셸 접속을 쓸 수 없다. 월 750 인스턴스 시간(잠든 시간 제외). |
| DB            | Neon Free    | 필요 없음 | 기간 제한 없는 무료 플랜이다. 유휴 시 컴퓨트가 멈췄다가 첫 쿼리에 다시 켜진다. 월 한도를 넘으면 다음 달까지 컴퓨트가 멈춘다.                                |
| 이미지 저장소 | 없음 (선택)  | -         | 기본 구성에서는 **상품 이미지 업로드를 쓰지 않는다.** 이미지가 필요하면 [6. 선택: 이미지 저장소](#6-선택-이미지-저장소)를 따른다.                           |

- Render Free는 한도를 넘어도 결제 수단이 없으면 과금 대신 서비스가 그달 말까지 정지된다. 결제 수단을 등록하지 않으면 요금이 나오지 않는다.
- Render Free Postgres는 **쓰지 않는다.** 생성 30일 뒤 만료되고, 유예 기간이 지나면 데이터와 함께 삭제된다. DB는 Neon에 둔다.
- 데모는 api가 잠든 뒤 첫 접속이 느리다. 첫 요청이 실패하면 잠시 뒤 새로고침한다.
- 이미지 정리 크론(매일 04:00 KST)은 api가 잠들어 있으면 돌지 않는다. 기본 구성에는 이미지가 없으므로 문제가 되지 않는다.

## 1. Neon (PostgreSQL)

1. Neon에서 프로젝트를 만든다. Postgres 버전은 **16**, 리전은 Render 서비스와 가까운 곳(예: AWS Singapore 또는 US East)을 고른다.
2. 프로젝트 대시보드의 **Connect**에서 접속 문자열을 복사한다.
   - **Pooled connection은 끈다**(직접 연결 문자열, 호스트에 `-pooler`가 없는 것). 데모 사용자 생성 제한이 트랜잭션 단위 advisory lock을 쓰고, api가 자체 커넥션 풀을 가진다.
   - 형태: `postgresql://<user>:<password>@<endpoint>.<region>.aws.neon.tech/<db>?sslmode=require`
   - 이 값이 `DATABASE_URL`이다. `sslmode=require`를 지우지 않는다.

### 1-1. 마이그레이션과 시드 (로컬에서 1회)

Render Free에는 Pre-deploy Command와 셸이 없다. 마이그레이션은 api 시작 명령에서 매번 돌지만(2단계), **시드는 로컬에서 한 번** 넣는다. 데모 데이터는 계정 3개, 카테고리·상품, 주문 1,500건이다. 시드는 멱등이라 다시 돌려도 중복되지 않는다.

저장소 루트에서 실행한다. 셸에서 준 `DATABASE_URL`이 루트 `.env`의 값보다 우선한다. 나머지 값(`JWT_SECRET`, `SEED_PASSWORD` 등)은 로컬 `.env`에서 읽는다. URL에 `?`와 `&`가 있으므로 작은따옴표로 감싼다.

```bash
pnpm --filter @bo/contracts build && pnpm --filter api build
```

```bash
DATABASE_URL='<Neon 접속 문자열>' pnpm --filter api db:migrate
```

```bash
DATABASE_URL='<Neon 접속 문자열>' pnpm --filter api db:seed
```

출력에서 `Seeded ... orders`(또는 `Orders already present, skipped`)를 확인한다. 시드 계정 비밀번호는 로컬 `.env`의 `SEED_PASSWORD`를 따르므로, README의 데모 비밀번호(`demo1234!`)와 같은지 먼저 확인한다.

> 셸 기록에 접속 문자열이 남는 것이 싫다면 명령 앞에 공백을 하나 두거나(zsh `HIST_IGNORE_SPACE` 설정 시), 실행 후 기록에서 지운다.

## 2. Render (apps/api)

1. Render에서 **New → Web Service**를 만들고 GitHub 저장소를 연결한다.
2. **Instance Type**은 **Free**를 고른다.
3. 아래처럼 설정한다. Root Directory는 비워 둔다(저장소 루트). 워크스페이스 전체를 설치해야 `@bo/contracts`를 빌드할 수 있기 때문이다.

| 항목              | 값                                                                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language          | Node                                                                                                                                                                                         |
| Build Command     | `export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 && NODE_ENV=development corepack pnpm install --frozen-lockfile && corepack pnpm --filter @bo/contracts build && corepack pnpm --filter api build` |
| Start Command     | `cd apps/api && node ./node_modules/typeorm/cli.js migration:run -d dist/database/cli-data-source.js && node dist/main.js`                                                                   |
| Health Check Path | `/api/v1/health`                                                                                                                                                                             |

- `corepack pnpm`은 루트 `package.json`의 `packageManager`(pnpm 10.29.1)를 받아 실행한다. Render 빌드 환경은 `/usr/bin`이 읽기 전용이라 `corepack enable`이 `EROFS: read-only file system` 오류로 실패하므로 쓰지 않는다. `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`은 pnpm을 내려받을 때 확인 질문을 끈다.
- 설치 단계의 `NODE_ENV=development`는 devDependencies(Nest CLI, TypeScript)를 설치하기 위해서다. 서비스 변수의 `NODE_ENV=production`이 설치에 적용되면 빌드 도구가 빠져 빌드가 실패한다.
- 시작 명령은 마이그레이션을 먼저 적용한 뒤 서버를 띄운다. 적용할 마이그레이션이 없으면 바로 넘어간다. 시작 시점에 `pnpm`을 부르지 않고 `node`로 직접 실행한다.
- `PORT`는 Render가 넣어 준다. 직접 지정하지 않는다.
- 배포가 끝나면 `https://<render-app>.onrender.com` 주소가 나온다. 3단계에서 쓴다.

### 2-1. 환경 변수 (Environment)

| 변수                     | 값 예시                           | 비고                                                                                       |
| ------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------ |
| `NODE_VERSION`           | `24`                              | Render의 Node 버전 지정. 다른 방법보다 우선한다.                                           |
| `NODE_ENV`               | `production`                      | 쿠키에 `Secure`가 붙는다. `.env.example`의 `JWT_SECRET` 예시 값을 거부한다.                |
| `DATABASE_URL`           | `<Neon 접속 문자열>`              | 1단계                                                                                      |
| `JWT_SECRET`             | `openssl rand -base64 48` 출력    | 사용자가 로컬에서 생성해 붙여 넣는다. 32자 이상이어야 한다.                                |
| `ACCESS_TTL_SEC`         | `900`                             | 생략하면 기본값                                                                            |
| `REFRESH_TTL_SEC`        | `604800`                          | 생략하면 기본값                                                                            |
| `WEB_ORIGIN`             | `https://<vercel-app>.vercel.app` | 3단계에서 정해지는 Vercel 주소. CORS 허용 출처다.                                          |
| `TRUST_PROXY`            | `1`                               | 5단계에서 실제 홉 수를 확인해 조정한다.                                                    |
| `LOGIN_THROTTLE_LIMIT`   | `10`                              | (IP, 이메일)마다 허용 횟수. 생략하면 10                                                    |
| `LOGIN_THROTTLE_TTL_SEC` | `600`                             | 생략하면 600초                                                                             |
| `DEMO_MODE`              | `true`                            | 데모 계정의 모든 변경(이름 포함)을 막고, 사용자 수를 20명으로 제한한다.                    |
| `SEED_PASSWORD`          | `demo1234!`                       | 시드 데모 계정 비밀번호. README의 데모 비밀번호와 같아야 로그인 화면 빠른 선택이 동작한다. |
| `S3_ACCESS_KEY_ID`       | `unused`                          | 이미지 저장소를 쓰지 않을 때의 자리 값. 비어 있으면 api가 기동하지 않는다.                 |
| `S3_SECRET_ACCESS_KEY`   | `unused`                          | 위와 같다.                                                                                 |

`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE`은 넣지 않는다. 기동할 때 저장소에 접속하지 않으므로 자리 값으로도 api는 정상 동작한다. 이 상태에서 상품 이미지를 올리면 저장에 실패해 에러가 난다. 시드 데이터에는 이미지가 없으므로 다른 화면에는 영향이 없다.

로그인 시도 카운터는 프로세스 메모리에 둔다(`@nestjs/throttler` 기본 저장소). api 인스턴스가 하나일 때만 정확하고, 재시작하거나 잠들었다 깨면 초기화된다.

## 3. Vercel (apps/web)

1. Vercel(Hobby)에서 같은 저장소로 새 프로젝트를 만든다(Framework Preset: Next.js).
2. **Root Directory**를 `apps/web`으로 지정한다. Vercel이 pnpm 워크스페이스를 감지해 저장소 루트에서 설치한다.
3. **Build Command**를 `pnpm --filter @bo/contracts build && pnpm build`로 바꾼다. Web은 빌드된 `@bo/contracts`(`dist/`)를 import하므로 먼저 빌드해야 한다.
4. **Environment Variables** (Production):

   | 변수         | 값                                                |
   | ------------ | ------------------------------------------------- |
   | `API_ORIGIN` | `https://<render-app>.onrender.com` (끝 `/` 없이) |

   `apps/web/next.config.ts`의 rewrite 대상이다. rewrite는 빌드할 때 정해지므로 값을 바꾸면 **다시 배포(재빌드)**해야 한다. 이미지 저장소를 쓰지 않으면 `MEDIA_ORIGIN`은 넣지 않는다.

5. 배포가 끝나면 나온 주소(`https://<vercel-app>.vercel.app`)를 Render api의 `WEB_ORIGIN`에 넣는다. 환경 변수를 저장하면 Render가 다시 배포한다.

## 4. 배포 후 점검 목록

Vercel 주소에서 확인한다. api가 잠들어 있으면 첫 요청이 느리므로, 먼저 `https://<render-app>.onrender.com/api/v1/health`를 열어 깨워 둔다.

- [ ] **로그인:** 로그인 화면의 데모 계정 빠른 선택(admin·manager·viewer)으로 로그인되고, 새로고침해도 세션이 유지된다.
- [ ] **쿠키:** 개발자 도구 → Application → Cookies에서 `bo_at`(HttpOnly, Lax, `Path=/`)과 `bo_rt`(HttpOnly, Strict, `Path=/api/v1/auth`)에 **Secure**가 붙어 있다.
- [ ] **로그인 제한:** 틀린 비밀번호로 `LOGIN_THROTTLE_LIMIT`회를 넘기면 429와 안내 문구가 나오고, 응답에 `Retry-After` 헤더가 있다. 다른 이메일은 막히지 않는다.
- [ ] **대시보드·목록:** 대시보드 차트와 상품·주문 목록이 시드 데이터로 채워진다.
- [ ] **엑셀:** 상품·주문 목록의 엑셀 다운로드가 `.xlsx` 파일로 받아지고 열린다.
- [ ] **API 문서:** `https://<vercel-app>.vercel.app/api/docs`(또는 Render 주소의 `/api/docs`)에서 Swagger가 열린다.
- [ ] **데모 보호:** ADMIN 데모 계정으로 다른 데모 계정의 역할을 바꾸면 거부된다(`DEMO_MODE=true`).
- [ ] **이미지(6단계를 한 경우만):** MANAGER 이상으로 상품 이미지를 업로드하면 버킷에 오브젝트가 생기고, 목록·상세에서 `/media/...` 이미지가 보인다.

## 5. `TRUST_PROXY` 홉 수 확인

로그인 제한은 `req.ip`를 키로 쓴다. `TRUST_PROXY`는 Express가 `X-Forwarded-For`의 오른쪽에서 몇 개를 믿을지 정한다.

- 너무 작으면 `req.ip`가 프록시 주소가 된다. 모든 사용자가 같은 IP로 묶여, 한 사람이 어떤 이메일로 제한을 넘기면 그 이메일은 모든 사용자에게 막힌다.
- 너무 크면 클라이언트가 보낸 `X-Forwarded-For` 값을 믿게 된다. 헤더를 바꿔 가며 제한을 우회할 수 있다.

이 구성은 요청이 Vercel과 Render 앞단 프록시를 거쳐 오므로 1보다 클 가능성이 크다. 추측하지 말고 아래처럼 확인한다.

1. `TRUST_PROXY=1`로 배포한 상태에서, `apps/api/src/main.ts`의 `configureApp(app, env);` 바로 아래에 **임시로** 로그를 넣고 배포한다.

   ```ts
   app.use((req: import('express').Request, _res: unknown, next: () => void) => {
     console.log('[ip-check]', req.ip, req.headers['x-forwarded-for']);
     next();
   });
   ```

2. 브라우저로 Vercel 주소에서 로그인을 한 번 시도하고, Render 대시보드 **Logs**의 `[ip-check]` 줄을 본다.
   - 본인의 공인 IP(공인 IP 확인 서비스로 미리 알아 둔다)가 `x-forwarded-for`의 오른쪽에서 몇 번째인지 센다. 그 순번이 `TRUST_PROXY` 값이다. 예: `<내 IP>, <Vercel IP>`면 2다.
   - `req.ip`가 본인 IP와 같아질 때까지 값을 맞추고 다시 배포한다.
3. 위조 확인: `curl -X POST https://<vercel-app>.vercel.app/api/v1/auth/login -H 'X-Requested-With: fetch' -H 'Content-Type: application/json' -H 'X-Forwarded-For: 203.0.113.9' -d '{"email":"x@example.com","password":"x"}'`를 보내고, 로그의 `req.ip`가 `203.0.113.9`가 **아닌지** 확인한다.
   - 한계: Vercel을 거치지 않고 Render 주소로 직접 보내면 홉이 하나 적다. `TRUST_PROXY`가 2 이상이면 Render 도메인을 아는 사람은 누구든 `X-Forwarded-For`의 가장 왼쪽 값을 계속 바꿔 가며 로그인 제한을 완전히 우회할 수 있다(IP 하나를 위조하는 데서 그치지 않는다). 같은 위조 curl을 Render 도메인으로 직접 보내 로그의 `req.ip`가 위조한 값이 되는지 확인해 본다. 공개 데모에서는 이 한계를 받아들인다. 막아야 한다면 Vercel에서만 붙이는 비밀 헤더를 api가 확인하는 식으로 직접 접근을 차단한다.
4. 확인이 끝나면 임시 로그를 **지우고** 다시 배포한다. IP는 개인정보이므로 남겨 두지 않는다.

## 6. 선택: 이미지 저장소

상품 이미지 업로드까지 공개하려면 S3 호환 저장소가 필요하다. 코드는 그대로 두고 환경 변수만 채운다. 아래는 Cloudflare R2 기준이다.

> **비용:** R2를 처음 켤 때 구독 화면에서 **결제 수단 등록과 약관 동의**를 요구한다. 무료 한도(Standard 클래스 저장 10GB/월, Class A 100만 건, Class B 1,000만 건) 안에서는 $0이고, 넘으면 과금된다. 결제 수단 등록 자체를 피하려면 이 단계를 건너뛴다.

1. Cloudflare 대시보드 → **R2 Object Storage**에서 구독을 활성화하고 버킷을 만든다. 예: `bo-media`. 스토리지 클래스는 무료 한도가 적용되는 **Standard**다. 이 이름이 `S3_BUCKET`이다.
2. 버킷 → **Settings → Public access**에서 `r2.dev` 서브도메인을 허용한다. 주소는 `https://pub-<hash>.r2.dev` 형태이고, 이 값이 Vercel의 `MEDIA_ORIGIN`이다. 공개 URL은 버킷 루트를 가리키므로 뒤에 버킷 이름을 붙이지 않는다.
3. **R2 → Manage R2 API Tokens → Create API token**에서 권한 **Object Read & Write**, 대상은 위 버킷 하나로 제한한 토큰을 만든다. 생성 화면에 한 번만 보이는 값을 옮겨 둔다.
4. Render api 환경 변수를 바꾼다.

   | 변수                   | 값                                              |
   | ---------------------- | ----------------------------------------------- |
   | `S3_ENDPOINT`          | `https://<account-id>.r2.cloudflarestorage.com` |
   | `S3_REGION`            | `auto`                                          |
   | `S3_BUCKET`            | `bo-media`                                      |
   | `S3_ACCESS_KEY_ID`     | `<R2 Access Key ID>`                            |
   | `S3_SECRET_ACCESS_KEY` | `<R2 Secret Access Key>`                        |
   | `S3_FORCE_PATH_STYLE`  | `true`                                          |

5. Vercel에 `MEDIA_ORIGIN=https://pub-<hash>.r2.dev`를 추가하고 다시 배포한다.

이미지를 쓰면 고아 이미지 정리 크론이 의미를 갖는다. Render Free는 잠들어 있는 동안 크론이 돌지 않으므로, 정리는 api가 깨어 있는 날의 04:00 KST에만 일어난다.
