# /admin 어드민 패널 구현 노트

> 최종 업데이트: 2026-04-18
> 대상: 향후 유지보수 시 참고할 구현 결정 및 트러블슈팅 히스토리

---

## 목차

1. [전체 구현 흐름](#1-전체-구현-흐름)
2. [Cloudflare Access 인증 구현](#2-cloudflare-access-인증-구현)
3. [Next.js 16 middleware.ts 문제](#3-nextjs-16-middlewarets-문제)
4. [Admin API 경로 오류](#4-admin-api-경로-오류)
5. [모니터링 — Backend PC CPU 측정](#5-모니터링--backend-pc-cpu-측정)
6. [모니터링 — Gateway VM 리소스](#6-모니터링--gateway-vm-리소스)
7. [포털 API 토큰 설정](#7-포털-api-토큰-설정)
8. [nginx → Next.js 헤더 전달 문제](#8-nginx--nextjs-헤더-전달-문제)
9. [배포 구조 주의사항](#9-배포-구조-주의사항)

---

## 1. 전체 구현 흐름

admin.html (레거시, Tailscale 전용) → `/admin` Next.js (Cloudflare Access 인증)으로 마이그레이션.

**구현 순서:**
1. Next.js 프로젝트 생성 (`web/`)
2. 4탭 구현 (서비스, 감사 로그, 절전 관리, 모니터링)
3. proxy.ts Cloudflare Access JWT 검증 미들웨어 작성
4. Gateway에 Node.js v20 설치 + 빌드 + systemd 서비스 등록
5. nginx `home.conf`에 `/admin`, `/_next/`, `/api/admin/` 라우팅 추가
6. 코드 리뷰 후 보안 수정 (경로 오류, 폴링 중복 등)
7. 배포 및 인증 트러블슈팅

---

## 2. Cloudflare Access 인증 구현

### 인증 방식

`proxy.ts`가 Next.js 16의 미들웨어 역할을 합니다. Cloudflare Access가 인증된 요청에 JWT를 `CF_Authorization` 쿠키로 전달하면, proxy.ts가 이를 검증합니다.

### 트러블슈팅: JWT가 헤더가 아닌 쿠키에 있음

**증상:** `Unauthorized` 반복 발생.

**원인:** proxy.ts 초기 구현이 `Cf-Access-Jwt-Assertion` 헤더만 읽었는데, 실제 Cloudflare Access는 `CF_Authorization` **쿠키**로 JWT를 전달하고 있었습니다. 헤더는 도달하지 않았습니다.

**수정:**
```ts
const jwtToken =
  request.headers.get('Cf-Access-Jwt-Assertion') ||
  request.cookies.get('CF_Authorization')?.value
```

### 트러블슈팅: AUD 불일치

**증상:** JWT 검증 실패.

**원인:** proxy.ts의 `ALLOWED_AUD`에 Cloudflare Access 대시보드의 Application UUID(`9bc9a0b2-...`)를 사용했으나, JWT 페이로드의 실제 `aud` 값은 별도의 hex 문자열입니다.

| 위치 | 값 |
|------|-----|
| 대시보드 Application ID | `9bc9a0b2-09e1-4ce5-8dc3-ccc3ebfebd13` (UUID) |
| JWT `aud` 클레임 (실제) | `5217e5d9279113aa89c0a6653f4dbac925c04c951fd15c5508647a63d0b17ccc` (hex) |

**확인 방법:** `/api/debug-cf` 임시 엔드포인트로 요청 헤더를 덤프, `CF_Authorization` 쿠키를 디코딩하여 확인.

**수정:** `ALLOWED_AUD`를 JWT 실제 값으로 교체.

### 트러블슈팅: 이메일 대소문자

**증상:** `zoop784@naver.com`으로 로그인 시 Unauthorized.

**원인:** proxy.ts에 `'Zoop784@naver.com'` (대문자 Z)로 저장, Cloudflare JWT는 소문자로 반환.

**수정:**
```ts
const ALLOWED_EMAILS = ['zoop784@naver.com', 'azdazd0101@gmail.com']
// ...
if (!ALLOWED_EMAILS.includes((payload.email as string).toLowerCase())) {
```

### 세션 캐시 초기화

인증 실패 후 재시도 시 반드시 로그아웃 후 재접속:
```
edelweiss0297.cloud/cdn-cgi/access/logout
```

---

## 3. Next.js 16 middleware.ts 문제

**증상:** `npm run build` 실패.
```
Error: Both middleware file "./src/src/middleware.ts" and proxy file
"./src/src/proxy.ts" are detected. Please use "./src/src/proxy.ts" only.
```

**원인:** Next.js 16에서는 `proxy.ts`가 미들웨어 역할을 직접 담당합니다. 코드 리뷰에서 "proxy.ts가 미들웨어로 연결되지 않았다"고 판단하여 `middleware.ts`를 추가했으나, Next.js 16은 `proxy.ts`를 자동으로 미들웨어로 인식하므로 충돌 발생.

**수정:** `middleware.ts` 삭제. `proxy.ts`만 유지.

> **규칙:** Next.js 16에서 `proxy.ts`는 미들웨어 파일입니다. `middleware.ts`를 별도로 만들지 마세요.

---

## 4. Admin API 경로 오류

**증상:** 어드민 탭에서 데이터가 로드되지 않음. curl 직접 테스트는 성공.

**원인:** 모든 Next.js admin API 라우트가 포털 API를 잘못된 경로로 호출하고 있었습니다.

| 잘못된 경로 | 올바른 경로 |
|------------|------------|
| `http://127.0.0.1:11437/api/control/admin/status` | `http://127.0.0.1:11437/admin/status` |
| `http://127.0.0.1:11437/api/control/services/{id}/{action}` | `http://127.0.0.1:11437/services/{id}/{action}` |

**원인 분석:** `CONTROL_API_URL`이 포털 API(11437)를 가리키는데, 포털 API의 라우트는 `/admin/...`이지 `/api/control/admin/...`이 아닙니다. `/api/control/`는 nginx가 외부에서 포털 API로 프록시할 때 사용하는 nginx 경로입니다.

**수정:**
```bash
# web/src/app/api/admin/ 전체
sed -i 's|/api/control/admin/|/admin/|g' **/*.ts
sed -i 's|/api/control/services/|/services/|g' **/*.ts
```

---

## 5. 모니터링 — Backend PC CPU 측정

**증상:** 모니터링 탭에서 CPU `"error": "WinError 2 지정된 파일을 찾을 수 없습니다"`.

**원인:** `_get_system_resources()`가 `wmic cpu get LoadPercentage`를 사용하는데, Windows 11에서 `wmic.exe`가 제거되었습니다.

**수정:** PowerShell `Get-CimInstance`로 교체.

```python
# 변경 전
out = subprocess.check_output(
  ["wmic", "cpu", "get", "LoadPercentage", "/value"],
  ...
)

# 변경 후
out = subprocess.check_output(
  ["powershell", "-NoProfile", "-Command",
   "(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average"],
  timeout=5, text=True, creationflags=0x08000000,
)
```

---

## 6. 모니터링 — Gateway VM 리소스

**증상:** `/admin/gateway/resources` 호출 시 `"name 'shutil' is not defined"`.

**원인:** `cheeze-control-api.py`의 `collect_gateway_disk()` 함수가 `shutil.disk_usage()`를 사용하는데, `shutil`이 임포트 목록에 누락됨.

**수정:**
```python
import shutil  # 추가
```

**추가 주의사항:** `/opt/cheeze-control/cheeze-control-api.py`가 실제 실행 파일입니다. git repo(`/var/www/home/deploy/gateway/`)를 수정 후 반드시 수동으로 복사해야 합니다:
```bash
\cp /var/www/home/deploy/gateway/cheeze-control-api.py /opt/cheeze-control/
systemctl restart cheeze-control-api
```

---

## 7. 포털 API 토큰 설정

### 토큰 구조

포털 API는 SHA-256 해시 기반 토큰 레지스트리를 사용합니다 (`/opt/cheeze-control/portal-control-tokens.json`). 평문 토큰은 저장되지 않으므로 분실 시 복구 불가합니다.

### Next.js 어드민 토큰

| 항목 | 값 |
|------|-----|
| token_id | `nextjs-admin` |
| role | `admin` |
| 평문 저장 위치 | `/var/www/home/web/.env.local` (ADMIN_CONTROL_TOKEN) |

### 새 토큰 생성 절차

```bash
# 1. 토큰 생성
NEW_TOKEN=$(openssl rand -hex 32)
NEW_HASH=$(python3 -c "import hashlib; print(hashlib.sha256('$NEW_TOKEN'.encode()).hexdigest())")

# 2. 레지스트리에 추가
python3 -c "import json; f=open('/opt/cheeze-control/portal-control-tokens.json'); d=json.load(f); f.close(); d['tokens'].append({'token_id':'TOKEN_ID','label':'LABEL','role':'admin','token_hash':'$NEW_HASH','allowed_services':['*'],'allowed_actions':['*'],'expires_at':None,'revoked_at':None}); open('/opt/cheeze-control/portal-control-tokens.json','w').write(json.dumps(d,indent=2))"

# 3. 포털 API 재시작 (레지스트리 리로드)
systemctl restart cheeze-portal-api
```

---

## 8. nginx → Next.js 헤더 전달 문제

**증상:** `Cf-Access-Jwt-Assertion` 헤더가 Next.js에 도달하지 않음.

**원인 분석:** Cloudflare Access가 해당 헤더를 오리진으로 전달하지 않고, 쿠키(`CF_Authorization`)만 사용하는 것으로 확인. nginx의 `proxy_set_header` 추가는 효과 없었음.

**최종 해결:** 헤더 대신 쿠키에서 JWT를 읽도록 proxy.ts 수정 (§2 참조).

**nginx에 추가한 설정 (현재 유지):**
```nginx
proxy_set_header Cf-Access-Jwt-Assertion $http_cf_access_jwt_assertion;
```
헤더가 있을 때 전달하도록 유지. 쿠키 fallback이 주 경로.

---

## 9. 배포 구조 주의사항

### Git repo vs 실행 파일 분리

| 구분 | 경로 |
|------|------|
| Git repo (소스) | `/var/www/home/deploy/gateway/` |
| 실제 실행 파일 | `/opt/cheeze-control/` |

git pull은 소스만 업데이트합니다. **Python 서비스 파일은 반드시 수동으로 cp 후 재시작해야 합니다.** CI/CD(`deploy.yml`)가 이를 자동화합니다.

### Next.js 빌드 필수

코드 변경 후 재시작만 하면 "Could not find a production build" 오류 발생. 반드시:
```bash
cd /var/www/home/web && npm run build && systemctl restart cheeze-nextjs
```

### Backend Agent 실행 경로

| 항목 | 값 |
|------|-----|
| Git repo 소스 | `D:\Project\deploy\backend\cheeze-backend-agent.py` |
| 실제 실행 경로 | `D:\Servers\Control\backend-agent\cheeze-backend-agent.py` |
| 실행 방식 | `Start-Process python` (별도 Windows 서비스 없음) |

코드 수정 후 실행 경로로 파일을 복사하고 프로세스를 재시작해야 합니다.
