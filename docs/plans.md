# 계획 및 구상

> 인프라 개선, 신규 기능, 아키텍처 변경 등 구상 중인 내용을 기록하는 공간입니다.
> 최종 갱신: 2026-04-18

## 인프라 현대화 로드맵

> 상태: 진행 중
> 작성일: 2026-04-18

### 배경

현재 인프라의 한계:
- 정적 HTML 기반 프런트엔드 — 실시간 업데이트 불가, 인증/세션 관리 불가능
- Gateway LXC에 모든 서비스가 네이티브로 설치 — 환경 재현 불가, 장애 격리 없음
- 온디맨드 서비스 추가가 관리자 수동 작업 — 비효율적
- Nginx 단일 실패지점

### Phase 1: Docker + Compose (Gateway 컨테이너화) ✅ 완료

> 목표: 선언적 인프라 관리, 환경 재현성 확보

- Gateway LXC에 Docker + Compose 설치 (nesting 활성화 필요)
- Python API 3개 순차 컨테이너화:
  - cheeze-portal-api → Dockerfile → 컨테이너 전환 → systemd 비활성화
  - cheeze-control-api → 동일
  - cheeze-ai-queue → 동일 (가장 무거운 워크로드, 격리 우선순위 높음)
- Nginx 컨테이너화 (upstream을 Docker 서비스 이름으로 변경)
- Cloudflared: Docker 불필요 — 네이티브 systemd 유지 (credentials JSON 방식, cert.pem 불필요)
- docker-compose.yml로 전체 스택 정의
- Next.js web 서비스 Docker Compose에 추가 완료

#### 영향 범위
- deploy/gateway/ 전체
- Nginx 설정 파일
- systemd 서비스 파일 → Docker Compose로 대체
- 배포 방식: git pull → docker compose up -d

#### 주의사항
- Backend Agent(homepc)는 Docker 대상 아님 (Windows 네이티브, ctypes/WTS API 의존)
- 마이그레이션 중 서비스 중단 최소화 (하나씩 전환)

### Phase 2: Next.js 프런트엔드 전환 ✅ 완료

> 목표: 실시간 UI, 인증 시스템, 관리자 현대화

- Next.js 14+ (App Router) 프로젝트 셋업
- 기술 스택: TypeScript, Tailwind CSS, shadcn/ui
- Python API는 유지 — Next.js는 BFF(Backend For Frontend) 레이어로만 사용

#### 마이그레이션 순서 (페이지 단위)
1. ~~servers.html → /servers~~ ✅ 완료
2. ~~index.html → /~~ ✅ 완료
3. ~~admin.html → /admin~~ ✅ 완료 (2026-04-18)

#### 인증 시스템
- ~~NextAuth.js 또는 자체 토큰 기반~~ → Cloudflare Access OTP 채택
- proxy.ts에서 JWT 검증 (RS256, Web Crypto API)
- API route에서 서버사이드 ADMIN_CONTROL_TOKEN 주입 (클라이언트 토큰 불필요)
- 기존 portal-control-tokens 시스템은 /servers 및 디스코드 봇용으로 유지

#### 배포
- Docker 컨테이너 (web 서비스)로 Compose에 추가
- 빌드: `npm run build` → `next start` (pm2 또는 systemd)

### Phase 3: Pterodactyl 게임서버 관리

> 목표: 임대인 셀프서비스, 관리자 수동 작업 제거
> 상태: 진행 중 (2026-04-19 구현 시작)

#### 확정된 설계 결정 (2026-04-19)

| 항목 | 결정 |
|------|------|
| Panel 서브도메인 | `panel.edelweiss0297.cloud` |
| Wings 호스트 | homepc WSL2 Ubuntu (이미 설치됨) |
| Panel ↔ Wings 통신 | Tailscale VPN (`100.86.252.21:8080`) — 외부 노출 불필요 |
| 기존 서버 처리 | 안정화 전까지 기존 방식 유지, **새 서버만 Wings로 운영** |
| Panel 포트 | `127.0.0.1:8080:80` → nginx가 panel 서브도메인으로 프록시 |
| DB | MariaDB 10.11 (Docker named volume) |
| Cache | Redis Alpine (Docker named volume) |

#### 구축 단계

**[A] 코드 작업 — Gateway Docker Compose + nginx** ← 현재 진행
- `docker-compose.yml`에 `pterodactyl-db`, `pterodactyl-cache`, `pterodactyl-panel` 추가
- nginx에 `panel.edelweiss0297.cloud` 서버 블록 추가
- `.env.example`에 Pterodactyl 환경변수 추가

**[B] Gateway 서버 수동 작업** (코드 배포 후)
```bash
# Panel 기동
docker compose up -d pterodactyl-db pterodactyl-cache pterodactyl-panel

# Panel 초기 설정 (최초 1회)
docker exec pterodactyl-panel php artisan migrate --seed --force
docker exec -it pterodactyl-panel php artisan p:user:make
```

**[C] homepc WSL2 수동 작업**
```bash
# WSL2 Ubuntu에서 Docker Engine 설치
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Wings 설치
mkdir -p /etc/pterodactyl
curl -L -o /usr/local/bin/wings \
  "https://github.com/pterodactyl/wings/releases/latest/download/wings_linux_amd64"
chmod u+x /usr/local/bin/wings

# Panel에서 Node 생성 후 config.yml 다운로드
# Wings 기동
wings --debug
# systemd 서비스 등록 (안정화 후)
```

**[D] Next.js 코드 작업** (Panel 정상 가동 후)
- `/admin`에 Pterodactyl 탭 추가 (Panel iframe 또는 API 직접 연동)
- `/servers` 카드 Pterodactyl Client API 폴링으로 교체
- 서비스 대여 신청 폼 추가

#### 인프라
- Gateway에 Pterodactyl Panel (Docker 컨테이너)
- homepc에 Docker(WSL2) + Pterodactyl Wings
- Egg 구성: Minecraft Vanilla, Modpack 템플릿

#### 역할 구조
- **임대인(서버 운영자)**: `/admin` 내 Pterodactyl 탭에서 서버 생성·제어·메타 정보(운영시간 등) 관리
- **이용자**: `/servers` 페이지에서 서버 상태·정보 확인 (읽기 전용)
  - Pterodactyl API 폴링 → 서버 카드 실시간 반영
  - 켜기/끄기 버튼 제거 (Pterodactyl이 담당)
  - **서비스 대여 신청 패널 추가**: 새 서버 임대를 원하는 이용자가 신청 폼 제출

#### API 레이어 변화
- `cheeze-portal-api` — 서버 제어 엔드포인트 대부분 제거 (Pterodactyl이 대체), 잔여 공개 facade만 유지 또는 전체 폐기 검토
- `cheeze-control-api` — **유지** (Pterodactyl이 대체 불가한 homepc 전용: hibernate/WOL/WTS 유저 감지)
- `portal-control-tokens.json` 시스템 — 제거 대상

#### 현재 방식과 비교
- 현재: 유저 요청 → 관리자 수동 검토/배치/연동
- 이후: 임대인 → Pterodactyl(/admin) → 서버 생성(Egg 선택) → 자동 프로비저닝 → `/servers` 카드에 반영

#### 주의사항
- Wings는 Docker 기반 — homepc WSL2 Ubuntu에 Docker Engine 설치 필요 (Docker Desktop 불필요)
- 리소스 한도 설정 필수 (CPU, RAM, 디스크, 포트)
- Next.js API route에서 Pterodactyl REST API 폴링으로 서버 정보 읽기
- Panel `APP_KEY`는 최초 배포 전 반드시 생성: `openssl rand -base64 32`
- Wings는 Panel과 같은 도메인이 아닌 별도 FQDN 또는 Tailscale IP로 node 등록

### Phase 4: 서비스 확장 + WSL + k3s 도입

> 목표: 게임 서버 외 다양한 서비스 제공, 컨테이너 오케스트레이션 안정화

- Portainer 도입 (Docker 웹 관리 UI)
- 게임 외 서비스 추가 (웹앱, DB 등)

#### WSL + k3s (homepc) 도입 계획

> 상태: 구상 중 — Phase 3 안정화 후 진행

- **목표**: Pterodactyl(게임 전용)을 넘어 다양한 서비스(웹앱, DB, 봇, 미디어 서버 등)를 homepc에서 운영
- **선택 이유**: 풀 K8s 대신 k3s (경량, 단일 바이너리, 컨트롤 플레인 ~512MB)
- **WSL2 + k3s 구성**: homepc Windows → WSL2 → k3s 단일 노드
- **Gateway 연동**: Cloudflare Tunnel → nginx → homepc k3s 서비스 (Tailscale VPN 경유)

#### k3s 도입 전제 조건
- Phase 3 Pterodactyl Wings(WSL2 Docker)가 안정적으로 운영되어야 함
- homepc RAM 여유 확인 (k3s 컨트롤 플레인 ~512MB + 서비스 워크로드)
- 게임 서버 리소스와 k3s 워크로드 간 자원 경합 모니터링 필요

#### 풀 K8s는 현 시점 불필요
- 단일 노드에서 etcd + 컨트롤 플레인만 ~2GB (과잉)
- 멀티노드/멀티테넌트 운영 안정화 후 재검토

---

## 아키텍처 목표 상태

```
[인터넷]
    ↓
[Cloudflare Tunnel]
    ↓
[Gateway LXC — Docker Compose]
  ├── nginx (리버스 프록시)
  ├── web (Next.js SSR + BFF)
  ├── portal-api (Python, 공개 facade)
  ├── control-api (Python, 내부 제어)
  ├── ai-queue (Python, Ollama 프록시)
  ├── cloudflared (터널)
  └── pterodactyl-panel (게임서버 관리 UI)

[homepc (Windows, Tailscale VPN)]
  ├── Backend Agent (네이티브, 하이버네이트/WOL)
  ├── Pterodactyl Wings (Docker/WSL2, 게임서버 호스팅)
  ├── Ollama (AI 모델)
  └── Minecraft 서버들 (Wings 관리 또는 기존 방식)
```

## 변경 이력

### 2026-04-18: 초기 스캐폴딩 완료

**점검 및 정리:**
- 루트 구버전 cheeze-backend-agent.py 삭제 (deploy/backend/가 정본)
- .gitignore 정리 (배포 아티팩트, Java 빌드, Docker env, Node.js 제외)
- Gateway 잔여 임시 디렉터리 처리
- Backend agent 테스트 3건 통과 확인

**버그 수정:**
- AI Queue 내부 인증 헤더 이름 수정 (X-Cheeze-Internal-Secret → X-Cheeze-Internal-Token)

**파이프라인 점검:**
- 프런트엔드→백엔드 전체 API 경로 매핑 완료
- 사용되지 않는 엔드포인트 식별 (POST /host/wake, GET /registry 등)
- 인증 흐름 4계층 분석 완료

**Phase 1 스캐폴드 (Docker):**
- docker-compose.yml (5개 서비스: nginx, portal-api, control-api, ai-queue, cloudflared)
- Dockerfile x 3 (Python API용)
- Nginx 설정 (Docker 서비스 이름 기반)
- Rocky Linux 9 Docker 설치 스크립트
- 환경변수 템플릿 (.env.example)

**Phase 2 스캐폴드 (Next.js):**
- Next.js 14+ 프로젝트 생성 (App Router, TypeScript, Tailwind CSS)
- 빌드 검증 완료
- 기존 정적 파일과 공존 구조 확인

### 2026-04-18: Phase 2 Next.js 페이지 마이그레이션 완료

**마이그레이션 완료 (3/3 페이지):**
- servers.html → /servers
- index.html → /
- admin.html → /admin (Cloudflare Access OTP 인증)

**admin.html → /admin 마이그레이션 상세:**
- proxy.ts: Cloudflare Access JWT 검증 (RS256, Web Crypto API, 외부 패키지 없음)
- Admin API route handlers 7개 (status, audit, ip-labels, console, service action)
- 서버사이드 ADMIN_CONTROL_TOKEN 주입 (클라이언트 토큰 불필요)
- 탭 구조: 서비스(완료), 감사 로그(완료), 절전 관리(placeholder), 모니터링(placeholder)
- 컴포넌트 6개: ServiceStatusGrid, ServiceControlGrid, ServerConsole, AuditLogSection, IpLabelManager, AuditLogTab

**남은 작업:**
- 절전 관리 탭 구현 (/idle/status, /hibernate/debug, /no-sleep)
- 메인 페이지(`/`) 개인정보 처리 방침 모달 추가
  - 구현 방식: 별도 페이지 대신 모달 (초기 방문 시 표시, 동의 여부 localStorage/쿠키 기록)
  - 재동의 트리거: 처리 방침 내용 변경 시 버전 비교로 재표시
  - 동의 기록: 클라이언트 측 timestamp + 버전 저장 (서버 기록은 Phase 3 이후 검토)
  - 내용 초안: Claude가 작성 예정 (수집 항목, 보유 기간, 제3자 제공 여부 등 한국 개인정보보호법 기준)

**완료:**
- ADMIN_CONTROL_TOKEN 환경변수 설정 ✅ (deploy/docker/.env에 nextjs-admin 토큰 등록 완료)
- 모니터링 탭 정상 동작 ✅ (Docker named volume → 직접 바인드 마운트 전환으로 401 해결, 2026-04-19)
- 온디맨드 서비스에서 Ollama AI 카드 제거 ✅ (services.ts에서 ollama 항목 삭제, ondemand 카드 description 수정, 2026-04-19)

### 2026-04-19: Phase 3 코드 스캐폴딩 시작

**확정된 설계:**
- Panel 서브도메인: `panel.edelweiss0297.cloud`
- Wings: homepc WSL2 Ubuntu (Docker Engine 설치 필요)
- Panel ↔ Wings 통신: Tailscale VPN (공인 인터넷 미사용)
- 기존 서버 유지, 새 서버만 Wings 적용

**코드 변경:**
- `docker-compose.yml`: pterodactyl-db(MariaDB 10.11), pterodactyl-cache(Redis), pterodactyl-panel 추가
- `nginx/conf.d/default.conf`: panel.edelweiss0297.cloud 서버 블록 추가 (WebSocket 지원 포함)
- `.env.example`: PTERO_APP_KEY, PTERO_DB_* 변수 추가

**다음 단계 (서버 수동 작업):**
1. `.env`에 PTERO_* 값 설정 (`openssl rand -base64 32`로 APP_KEY 생성)
2. `docker compose up -d pterodactyl-db pterodactyl-cache pterodactyl-panel`
3. `docker exec pterodactyl-panel php artisan migrate --seed --force`
4. `docker exec -it pterodactyl-panel php artisan p:user:make`
5. cloudflared config.yml에 panel 서브도메인 ingress 추가 또는 와일드카드로 커버 확인

### 2026-04-19: Phase 3 아키텍처 설계 확정

**설계 결정:**
- `/servers` 역할 분리: 켜기/끄기 제어 제거 → 읽기 전용 정보 허브로 전환
- `/servers`에 서비스 대여 신청 패널 추가 예정 (Phase 3)
- Pterodactyl Panel → `/admin` 탭으로 통합 (임대인 전용)
- `cheeze-portal-api` 대부분 제거 대상, `cheeze-control-api`는 homepc Backend Agent용으로 유지
- `/servers` 카드 데이터: Next.js API route → Pterodactyl REST API 폴링

**보류 결정:**
- `/servers`에 Cloudflare Access OTP 적용 안 함 (현재 토큰 방식 유지, Phase 3에서 Pterodactyl 자체 인증으로 대체)

### 2026-04-19: Phase 3 운영 반영 및 관리자 연동

**실제 반영 완료:**
- `panel.edelweiss0297.cloud`가 Cloudflare Tunnel ingress 누락으로 404를 반환하던 문제 해결
  - `/etc/cloudflared/config.yml`에 `panel.edelweiss0297.cloud` 라우팅 추가
- Pterodactyl Panel 초기화 완료
  - `php artisan migrate --seed --force`
  - 관리자 계정 생성 및 로그인 테스트 성공
- `/admin`에 `Pterodactyl` 탭 추가
  - 패널 연결 상태
  - Application API 키 설정 여부
  - 서버 목록 / 노드 목록 조회

**운영 구조 정리:**
- Gateway 혼합 배포(web만 Docker, portal-api는 systemd)를 제거
- Gateway 앱 계층을 Docker Compose 기준으로 통일
  - `web`
  - `portal-api`
  - `control-api`
  - `ai-queue`
  - `nginx`
  - `pterodactyl-panel`
  - `pterodactyl-db`
  - `pterodactyl-cache`
- `cloudflared`와 Discord 봇만 네이티브 systemd 유지

**운영 규칙 확정:**
- 기존 서버 제어 방식은 유지
- Pterodactyl은 신규 서버부터 순차 적용
- `/servers`는 안정화 전까지 기존 시작/종료 UX 유지

**후속 작업:**
1. homepc WSL2에서 Wings 설치 및 노드 등록 — `docs/operations/wings-setup.md` 참조
   - homepc Tailscale IP: `100.86.252.21`
   - Panel 노드 FQDN: `100.86.252.21`, Daemon Port: `8080`, SFTP: `2022`, SSL: No
   - 연결 방식: Windows Tailscale + WSL2 localhost 자동 포워딩 (portproxy 불필요)
2. 신규 서버 1개를 Pterodactyl로 실제 프로비저닝 (Wings 노드 등록 후)
3. 안정화 후 `/servers` 공개 페이지 병행 노출 검토

### 2026-04-19: /servers 대여 신청 패널 추가

**구현 완료:**
- `/servers` 페이지 하단에 `서버 대여 신청` 패널 추가
- 신규 서버 요청은 기존 시작/종료 흐름과 분리해 별도 접수
- Next.js Route Handler(`/api/server-rental`)가 Discord 웹훅으로 신청 내용을 전달

**입력 항목:**
- 신청자 이름
- 연락 수단
- 희망 서버 유형
- 예상 동시 접속 인원
- 희망 일정
- 추가 메모

**운영 조건:**
- `SERVER_RENTAL_WEBHOOK_URL` 환경변수 설정 필요
- 웹훅 미설정 시 폼은 오류를 명확히 반환하여 “접수된 척”하지 않음

**의도:**
- 기존 서버는 그대로 운영
- 신규 서버 수요만 먼저 수집
- Pterodactyl/Wings 안정화 전까지 공개 페이지의 역할을 “기존 제어 + 신규 요청 접수”로 유지

### 2026-04-19: 임대인 패널 접속 버튼 및 Cloudflare Access 보호

**구현 완료:**
- `/servers` 페이지 하단에 임대인 전용 섹션 추가
  - "패널 접속" 버튼 → `/panel-access` 경유 → `panel.edelweiss0297.cloud` redirect
- `/panel-access` Next.js 페이지 신규 추가 (`PTERODACTYL_PANEL_URL` 환경변수 기반 redirect)
- `proxy.ts` matcher에 `/panel-access` 추가 → Cloudflare Access JWT 검증 적용

**인증 흐름:**
```
버튼 클릭 → /panel-access → Cloudflare Access OTP (미인증 시) → JWT 쿠키 발급 → proxy.ts 검증 → panel.edelweiss0297.cloud redirect
```

**운영 조건:**
- Cloudflare Zero Trust → Access → Applications에 `edelweiss0297.cloud/panel-access` 경로 보호 정책 등록 필요
- 정책 미등록 시 버튼은 표시되나 OTP 없이 누구나 접근 가능

**파일:**
- `web/src/app/panel-access/page.tsx` (신규)
- `web/src/proxy.ts`
- `web/src/app/servers/page.tsx`

### 2026-04-19: 대여 신청 패널 모달 전환

**변경 내용:**
- `RentalRequestPanel` — 페이지 하단 인라인 섹션 → 모달 오버레이로 전환
  - `isOpen` / `onClose` props 추가
  - ESC 키 닫기, 배경 클릭 닫기, 스크롤 잠금 처리
  - `role="dialog"`, `aria-modal`, `aria-labelledby` 접근성 속성 추가
- `RentalRequestButton` (신규) — 모달 열림 상태 관리 클라이언트 컴포넌트
- `/servers` 페이지 — 제목 우측에 "+ 대여 신청" 버튼 배치, 하단 인라인 패널 제거

**파일:**
- `web/src/components/servers/RentalRequestPanel.tsx`
- `web/src/components/servers/RentalRequestButton.tsx` (신규)
- `web/src/app/servers/page.tsx`

### 2026-04-19: Phase 3 코드 검수 및 보안 수정

**검수 결과 요약 (code-reviewer):**
- 스펙 준수: PASS — plans.md 설계 결정 모두 구현 확인
- CRITICAL 1건, HIGH 2건, MEDIUM 2건 수정

**수정 완료:**

| 심각도 | 항목 | 수정 내용 |
|--------|------|-----------|
| CRITICAL | `/api/server-rental` 레이트 리밋 없음 | IP 기반 슬라이딩 윈도우 (3회/10분) 추가 |
| HIGH | `TRUSTED_PROXIES=*` | Docker bridge CIDR `172.16.0.0/12`로 제한 |
| HIGH | MariaDB healthcheck 없음 | `healthcheck.sh` 기반 healthcheck 추가, panel 의존성 `service_healthy`로 변경 |
| MEDIUM | webhook fetch try-catch 누락 | 네트워크 오류 시 502 반환하도록 try-catch 추가 |
| MEDIUM | SleepManagementTab 데드코드 | 대체된 `conditionLabel` / `conditionDetail` 함수 제거 |

**파일:**
- `web/src/app/api/server-rental/route.ts`
- `deploy/docker/docker-compose.yml`
- `web/src/components/admin/SleepManagementTab.tsx`

---

### 2026-04-19: 서비스 신청 모달 봇/인젝션 방어 강화

> 상태: 완료

**배경:** 디스코드 웹훅 엔드포인트가 봇 대량 대입 및 인젝션 공격에 노출될 수 있어 추가 방어 레이어 적용.

**적용된 보호책:**

| 방어 | 구현 |
|------|------|
| 허니팟 필드 | 폼에 숨겨진 `website` 필드 추가. 봇이 채우면 조용히 201 반환(Discord 미전송) |
| 서버 유형 화이트리스트 | `desiredServer` 값을 5개 허용 옵션으로 제한, 외부 값 400 차단 |
| 스팸 패턴 감지 | URL 패턴(`http://`, `www.`) 및 반복 문자(`(.)\1{5,}`) 감지 시 400 반환 |
| 최소 길이 검사 | 이름 2자 미만, 연락처 3자 미만 차단 |
| 기존 레이트 리밋 유지 | IP당 3회/10분 슬라이딩 윈도우 (Phase 3 검수 시 적용) |
| Discord mention 차단 | `allowed_mentions: { parse: [] }` (Phase 3 검수 시 적용) |

**파일:**
- `web/src/app/api/server-rental/route.ts`
- `web/src/components/servers/RentalRequestPanel.tsx`

---

### 2026-04-19: 메인 페이지 개인정보처리방침 모달 추가

> 상태: 완료

**구현 내용:**
- 최초 방문 시 자동으로 개인정보처리방침 모달 표시
- "동의합니다" 클릭 시 localStorage에 버전·타임스탬프 기록 (재방문 시 미표시)
- "나중에 보기" 클릭 시 모달 닫힘, 다음 방문 시 재표시
- 푸터 "개인정보 처리방침" 링크로 언제든 재열람 가능
- 한국 개인정보보호법 기준 5개 항목 (수집 항목, 목적, 보유 기간, 제3자 제공, 이용자 권리)
- ESC 키 닫기, 스크롤 잠금, 접근성(role="dialog", aria-modal) 적용

---

### 2026-04-19: 개인 학습 플랫폼 (/learn) 구축

> 상태: 완료

**배경:** AWS SAA-C03, Cisco CCNA 200-301 등 국제 자격증 준비를 위한 CBT 방식 문제 풀이 플랫폼 추가.

**구현 내용:**

| 구성 요소 | 설명 |
|-----------|------|
| 문제 데이터 | JSON 파일 기반 정적 데이터 (DB 불필요) — AWS SAA-C03 15문제, CCNA 200-301 10문제 |
| 진도 추적 | `useProgress` 훅 + localStorage (정답/오답/열람 기록, 시험별 독립 저장) |
| 시험 허브 | `/learn` — 시험 목록, 진도 표시 |
| 시험 상세 | `/learn/[exam]` — 메타 정보, 진도 요약, 초기화 |
| 퀴즈 엔진 | `/learn/[exam]/quiz` — 타이머, 문제 셔플, 정답 피드백, 해설, 합격/불합격 판정 |

**타이머:** 시험별 제한 시간(timeLimit 분) 카운트다운, 0 도달 시 자동 종료. 타이머 ON/OFF 토글 제공.

**결과 화면:** 점수(%), 합격 기준 대비 판정, 소요 시간, 다시 풀기 버튼.

**파일:**
- `web/src/lib/quiz/types.ts` — QuizQuestion, ExamMeta, ProgressRecord 타입
- `web/src/lib/quiz/useProgress.ts` — 진도 훅
- `web/src/data/questions/aws-saa-c03.json` — AWS 문제 데이터
- `web/src/data/questions/ccna-200-301.json` — CCNA 문제 데이터
- `web/src/data/questions/index.ts` — 시험 레지스트리 (getAllExams, getExamQuestions, getExamMeta)
- `web/src/components/learn/ExamCard.tsx`, `ExamList.tsx` — 시험 카드 컴포넌트
- `web/src/app/learn/layout.tsx`, `page.tsx`, `[exam]/page.tsx`, `[exam]/quiz/page.tsx`
- `web/src/lib/services.ts` — `/learn` 서비스 항목 추가 (color: #6366f1, featured: true)

**파일:**
- `web/src/components/privacy/usePrivacyConsent.ts` (신규) — localStorage 훅 (PRIVACY_VERSION='1.0')
- `web/src/components/privacy/PrivacyPolicyModal.tsx` (신규) — 모달 UI
- `web/src/app/page.tsx` — 훅·모달 통합
- `web/src/components/layout/Footer.tsx` — "개인정보 처리방침" 링크 추가

---

## 사용법

이 디렉토리에 계획 문서를 자유롭게 추가하세요.

### 파일 명명 규칙 (권장)

- `YYYY-MM-주제.md` — 날짜별 계획 (예: `2026-04-monitoring.md`)
- `feature-주제.md` — 기능 단위 계획 (예: `feature-auto-hibernate.md`)
- `infra-주제.md` — 인프라 변경 계획 (예: `infra-unprivileged-lxc.md`)

### 문서 템플릿

각 계획 문서는 자유 형식이지만, 다음 구조를 참고하세요:

```markdown
# [계획 제목]

> 상태: 구상 중 | 설계 중 | 진행 중 | 완료 | 보류
> 작성일: YYYY-MM-DD
> 목표일: (선택)

## 배경

왜 이 작업이 필요한가?

## 목표

무엇을 달성하려 하는가?

## 구현 방안

어떻게 구현할 것인가?

## 영향 범위

어떤 시스템/문서에 영향을 미치는가?

## 메모

자유 형식 메모, 참고 링크, 아이디어 등
```
