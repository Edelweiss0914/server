# /admin 어드민 패널 구현 노트

> 최종 업데이트: 2026-04-19
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
10. [모니터링 401 — Docker Named Volume LXC 마운트 실패](#10-모니터링-401--docker-named-volume-lxc-마운트-실패)
11. [Pterodactyl 관리자 탭 추가](#11-pterodactyl-관리자-탭-추가)
12. [Gateway 혼합 배포 해소](#12-gateway-혼합-배포-해소)

---

## 1. 전체 구현 흐름

admin.html (레거시, Tailscale 전용) → `/admin` Next.js (Cloudflare Access 인증)으로 마이그레이션.

**구현 순서:**
1. Next.js 프로젝트 생성 (`web/`)
2. 4탭 구현 (서비스, 감사 로그, 절전 관리, 모니터링)
3. proxy.ts Cloudflare Access JWT 검증 미들웨어 작성
4. Gateway에 Docker Compose 기반 `web` 서비스 등록
5. nginx `home.conf`에 `/admin`, `/_next/`, `/api/admin/` 라우팅 추가
6. 코드 리뷰 후 보안 수정 (경로 오류, 폴링 중복 등)
7. 배포 및 인증 트러블슈팅
8. Pterodactyl 관리자 탭 추가 및 Gateway Compose-only 전환

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
| Portal 데이터/토큰/감사 로그 | `/opt/cheeze-control/` (컨테이너 bind mount) |

현재 Gateway 앱 계층은 `docker-compose.yml`이 단일 진실 공급원이다. `portal-api`, `control-api`, `ai-queue`, `web`, `nginx`, `pterodactyl-panel`은 모두 Docker Compose로 실행되며, `cloudflared`와 Discord 봇만 systemd로 남아 있다.

> **규칙:** `cheeze-portal-api.service`, `cheeze-control-api.service`, `cheeze-ai-queue.service`, `cheeze-nextjs.service`를 다시 활성화하지 말 것. 혼합 배포 상태가 되면 포트 충돌과 `502 Bad Gateway`가 재발한다.

### Next.js 빌드 필수

코드 변경 후 재시작만 하면 "Could not find a production build" 오류 발생. 반드시 Docker 이미지를 다시 빌드해야 한다:
```bash
cd /var/www/home/deploy/docker
docker compose build web
docker compose up -d --no-deps web
```

### Backend Agent 실행 경로

| 항목 | 값 |
|------|-----|
| Git repo 소스 | `D:\Project\deploy\backend\cheeze-backend-agent.py` |
| 실제 실행 경로 | `D:\Servers\Control\backend-agent\cheeze-backend-agent.py` |
| 실행 방식 | `Start-Process python` (별도 Windows 서비스 없음) |

코드 수정 후 실행 경로로 파일을 복사하고 프로세스를 재시작해야 합니다.

---

## 10. 모니터링 401 — Docker Named Volume LXC 마운트 실패

**발생일:** 2026-04-19

**증상:** 어드민 패널 모니터링 탭 → `/admin/system/resources` 호출 시 `401 Unauthorized`. 토큰값은 올바르나 portal-api가 `{"error": "invalid token"}` 반환.

### 원인 분석

**1단계: `CHEEZE_PORTAL_CONTROL_TOKEN` 미설정**

Portal API의 `authorize_admin()` 함수는 인증을 두 단계로 처리합니다:

```
1. CHEEZE_PORTAL_CONTROL_TOKEN 환경변수 → hmac.compare_digest() 직접 비교
2. /opt/cheeze-control/portal-control-tokens.json → SHA-256 해시 조회
```

`.env`에 `CHEEZE_PORTAL_CONTROL_TOKEN`이 없어 ①이 스킵됨. ② 레지스트리 조회로 넘어가야 하는데 아래 문제로 파일 접근 불가.

**2단계: Proxmox LXC에서 Docker Named Volume 바인드 마운트 미작동**

```yaml
# 기존 구성 — driver_opts bind 방식
volumes:
  portal-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /opt/cheeze-control
```

Proxmox LXC(nesting=1)에서 이 방식은 호스트 경로를 마운트하지 않고 **빈 볼륨**을 생성합니다. 컨테이너 내부 `/opt/cheeze-control/`에 파일이 없어 레지스트리 조회 실패 → 401.

### 수정 내역

**docker-compose.yml — named volume → 직접 바인드 마운트 전환 (커밋 `0d35d6c`)**

```yaml
# 수정 후
portal-api:
  volumes:
    - /opt/cheeze-control:/opt/cheeze-control
# volumes: 섹션의 portal-data 정의 삭제
```

**서버 `.env` — 즉각 조치 (레거시 토큰 우회)**

```
CHEEZE_PORTAL_CONTROL_TOKEN=<raw_token_value>
```

named volume 문제로 레지스트리 접근이 안 될 때 임시로 즉시 복구 가능. docker-compose.yml 수정 이후에도 유지 (보조 인증 경로).

### 기존 named volume 정리 절차

```bash
docker compose down                    # 컨테이너 중지 (volume 점유 해제)
docker volume rm docker_portal-data   # named volume 삭제
git pull origin main                   # 수정된 docker-compose.yml 반영
docker compose up -d portal-api        # 재시작
docker exec cheeze-portal-api ls -la /opt/cheeze-control/
# portal-control-tokens.json 등 파일 확인 → 마운트 성공
```

### 교훈

- **LXC에서 `driver_opts` bind mount는 사용하지 않는다.** 직접 바인드 마운트(`- /host/path:/container/path`)만 사용.
- `docker volume rm`은 컨테이너가 실행 중이면 실패(`volume is in use`). `docker compose down` 후 삭제.

---

## 11. Pterodactyl 관리자 탭 추가

**발생일:** 2026-04-19

**목표:** 기존 `/servers` 제어 흐름은 유지한 채, `/admin`에서 Pterodactyl 운영 진입점과 상태 확인을 병행 제공.

### 구현 범위

- `/admin` 탭 목록에 `Pterodactyl` 추가
- `/api/admin/pterodactyl` Route Handler 추가
- `web/src/lib/pterodactyl.ts`에 패널/애플리케이션 API 통신 레이어 추가
- `PTERODACTYL_PANEL_URL`, `PTERODACTYL_PANEL_INTERNAL_URL`, `PTERODACTYL_APPLICATION_API_KEY` 환경변수 추가

### 동작 방식

1. Panel 기본 상태 확인
   - `PTERODACTYL_PANEL_INTERNAL_URL`로 내부 헬스 확인
   - 기본값: `http://pterodactyl-panel`

2. Application API 확인
   - `Authorization: Bearer <PTERODACTYL_APPLICATION_API_KEY>`
   - `Accept: Application/vnd.pterodactyl.v1+json`
   - `/api/application/servers`
   - `/api/application/nodes`

3. 관리자 UI 노출
   - 패널 연결 상태
   - Application API 키 설정 여부
   - 등록된 서버 목록
   - 등록된 노드 목록
   - 운영 원칙 안내

### 운영 원칙

- 기존 Minecraft 서버 제어는 `portal-api / control-api` 경로 유지
- Pterodactyl은 신규 서버부터 순차 적용
- `/servers` 페이지는 안정화 전까지 기존 시작/종료 기능 유지

### Application API 키 발급 경로

```text
panel.edelweiss0297.cloud
→ Admin Panel
→ Application API
→ Create New
```

> **주의:** Client API 키가 아니라 **Application API 키**가 필요하다.

---

## 12. Gateway 혼합 배포 해소

**발생일:** 2026-04-19

**증상:** `/admin/status`, `/admin/system` 등 어드민 API가 `502 Bad Gateway` 반환. `panel`은 정상인데 모니터링과 기존 관리자 기능이 동시에 죽음.

### 직접 원인

Gateway가 다음과 같이 반쯤 Docker, 반쯤 systemd로 실행되고 있었다.

- `web`: Docker
- `portal-api`: systemd
- `control-api`: systemd 또는 Docker 혼재
- `ai-queue`: systemd 또는 Docker 혼재
- `nginx`: Docker host network
- `cloudflared`: systemd

이 상태에서 `web`이 `http://portal-api:11437` 또는 `http://127.0.0.1:11437` 중 하나를 보게 되면, 환경에 따라 이름 해석 실패 또는 포트 충돌이 발생했다.

### 최종 해결

Gateway 앱 계층을 **Compose-only**로 통일했다.

- `web`
- `portal-api`
- `control-api`
- `ai-queue`
- `nginx`
- `pterodactyl-panel`
- `pterodactyl-db`
- `pterodactyl-cache`

다음 서비스는 stop/disable 대상으로 고정:

- `cheeze-portal-api.service`
- `cheeze-control-api.service`
- `cheeze-ai-queue.service`
- `cheeze-nextjs.service`

### 운영 명령

최초 전환:

```bash
cd /var/www/home/deploy/docker
bash ./migrate-gateway-to-compose.sh
```

일반 배포:

```bash
docker compose build web
docker compose up -d --no-deps web
```

### 검증 명령

```bash
docker compose ps
curl -fsS http://127.0.0.1:11436/healthz
curl -fsS http://127.0.0.1:11437/healthz
curl -fsS http://127.0.0.1:11435/healthz
curl -I http://127.0.0.1:3000/api/admin/status
curl -I http://127.0.0.1:3000/api/admin/system
curl -I http://127.0.0.1:3000/api/admin/pterodactyl
```

### 교훈

- 혼합 배포는 임시 우회가 가능해 보여도 결국 장애 재발로 이어진다.
- Gateway 앱 계층은 Compose 하나로 통일하고, `cloudflared`와 Discord 봇만 예외로 남기는 것이 운영상 가장 단순하다.
- 모니터링 401 발생 시 먼저 `docker exec <container> ls -la /opt/cheeze-control/`로 파일 가시성을 확인한다.

> 상세 트러블슈팅 절차: [troubleshooting.md §3.13](../operations/troubleshooting.md#313-docker-named-volume-lxc-마운트-실패-모니터링-401)
