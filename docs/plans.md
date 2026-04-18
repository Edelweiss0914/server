# 계획 및 구상

> 인프라 개선, 신규 기능, 아키텍처 변경 등 구상 중인 내용을 기록하는 공간입니다.
> 최종 갱신: 2026-04-18

## 인프라 현대화 로드맵

> 상태: 설계 중
> 작성일: 2026-04-18

### 배경

현재 인프라의 한계:
- 정적 HTML 기반 프런트엔드 — 실시간 업데이트 불가, 인증/세션 관리 불가능
- Gateway LXC에 모든 서비스가 네이티브로 설치 — 환경 재현 불가, 장애 격리 없음
- 온디맨드 서비스 추가가 관리자 수동 작업 — 비효율적
- Nginx 단일 실패지점

### Phase 1: Docker + Compose (Gateway 컨테이너화)

> 목표: 선언적 인프라 관리, 환경 재현성 확보

- Gateway LXC에 Docker + Compose 설치 (nesting 활성화 필요)
- Python API 3개 순차 컨테이너화:
  - cheeze-portal-api → Dockerfile → 컨테이너 전환 → systemd 비활성화
  - cheeze-control-api → 동일
  - cheeze-ai-queue → 동일 (가장 무거운 워크로드, 격리 우선순위 높음)
- Nginx 컨테이너화 (upstream을 Docker 서비스 이름으로 변경)
- Cloudflared 컨테이너화 (공식 이미지, 토큰 env 주입)
- docker-compose.yml로 전체 스택 정의

#### 영향 범위
- deploy/gateway/ 전체
- Nginx 설정 파일
- systemd 서비스 파일 → Docker Compose로 대체
- 배포 방식: git pull → docker compose up -d

#### 주의사항
- Backend Agent(homepc)는 Docker 대상 아님 (Windows 네이티브, ctypes/WTS API 의존)
- 마이그레이션 중 서비스 중단 최소화 (하나씩 전환)

### Phase 2: Next.js 프런트엔드 전환

> 목표: 실시간 UI, 인증 시스템, 관리자 현대화

- Next.js 14+ (App Router) 프로젝트 셋업
- 기술 스택: TypeScript, Tailwind CSS, shadcn/ui
- Python API는 유지 — Next.js는 BFF(Backend For Frontend) 레이어로만 사용

#### 마이그레이션 순서 (페이지 단위)
1. servers.html → /servers (가장 독립적, SSE 실시간 업데이트 내장)
2. index.html → / (Ollama 상태, AI 인터페이스)
3. admin.html → /admin (인증 미들웨어 추가)

#### 인증 시스템
- NextAuth.js 또는 자체 토큰 기반
- 기존 portal-control-tokens 시스템과 통합
- 세션 기반 접근 제어

#### 배포
- Docker 컨테이너 (web 서비스)로 Compose에 추가
- 빌드: `npm run build` → `next start` (pm2 또는 systemd)

### Phase 3: Pterodactyl 게임서버 관리

> 목표: 유저 셀프서비스, 관리자 수동 작업 제거

- Gateway에 Pterodactyl Panel (Docker 컨테이너)
- homepc에 Docker(WSL2) + Pterodactyl Wings
- Egg 구성: Minecraft Vanilla, Modpack 템플릿
- CHEEZE 웹(Next.js)에서 Pterodactyl API 연동
- 유저 인증/인가 → 격리된 환경에서 서버 관리

#### 현재 방식과 비교
- 현재: 유저 요청 → 관리자 수동 검토/배치/연동
- 이후: 유저 → Pterodactyl 패널 로그인 → 서버 생성(Egg 선택) → 자동 프로비저닝

#### 주의사항
- Wings는 Docker 기반 — homepc에 Docker Desktop 또는 WSL2 Docker Engine 필요
- 리소스 한도 설정 필수 (CPU, RAM, 디스크, 포트)

### Phase 4: 서비스 확장

> 목표: 게임 서버 외 서비스 제공, 운영 경험 축적

- Portainer 도입 (Docker 웹 관리 UI)
- 게임 외 서비스 추가 (웹앱, DB 등)
- K8s 필요성 재평가:
  - 현 시점에서 미니PC 1대에 K8s는 과잉 (etcd + 컨트롤 플레인만 ~2GB RAM)
  - 학습 목적이라면 별도 환경(클라우드 무료 티어, k3s on VPS)에서 진행 권장
  - 프로덕션 도입은 노드 확장/멀티테넌트 운영 안정화 후 재검토

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
