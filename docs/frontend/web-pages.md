# CHEEZE 프론트엔드 구조

> 최종 업데이트: 2026-04-18

## 목차

1. [파일 구조 개요](#1-파일-구조-개요)
2. [페이지별 기능 및 UI 구조](#2-페이지별-기능-및-ui-구조)
   - [index.html — 메인 홈페이지](#21-indexhtml--메인-홈페이지)
   - [servers.html — 온디맨드 서버](#22-servershtml--온디맨드-서버)
   - [admin.html — 관리자 대시보드](#23-adminhtml--관리자-대시보드)
3. [JavaScript 모듈 구조](#3-javascript-모듈-구조)
4. [CSS 디자인 시스템](#4-css-디자인-시스템)
5. [API 연동](#5-api-연동)
6. [서비스 카탈로그 구조](#6-서비스-카탈로그-구조)
7. [상태 관리 및 폴링 전략](#7-상태-관리-및-폴링-전략)

---

## 1. 파일 구조 개요

```
/
├── index.html          # 메인 홈페이지
├── servers.html        # 온디맨드 서버 제어
├── admin.html          # 관리자 대시보드 (Tailscale 전용)
├── js/
│   ├── services.js     # 서비스 카탈로그 + APP_CONFIG
│   ├── app.js          # 홈페이지 로직 (검색, AI, 제어)
│   └── servers.js      # 서버 페이지 로직 (폴링, 제어 흐름)
└── css/
    └── style.css       # 디자인 시스템 (CSS 변수, 다크 모드)
```

모든 정적 파일은 `/var/www/home/`에서 Nginx가 서빙하며, `git pull`로 즉시 반영됩니다.

---

## 2. 페이지별 기능 및 UI 구조

### 2.1 index.html — 메인 홈페이지

**브랜딩:** Edelweiss (꽃 로고, 흰꽃 테마)

**주요 섹션:**

| 섹션 ID | 기능 |
|---------|------|
| `quickAccess` / `quickGrid` | `featured: true` 서비스 빠른 접근 아이콘 그리드 |
| `searchInput` | 실시간 서비스 검색 인풋 |
| `resultsSection` / `resultsGrid` | 검색 결과 카드 목록 |
| `controlSection` / `controlGrid` | 온디맨드 서비스 제어 카드 |
| `aiSection` | AI 채팅 영역 |
| `aiPromptCard` | 사용자 질문 표시 카드 |
| `aiResponseCard` | AI 응답 카드 (스트리밍) |
| `aiFollowupForm` | 후속 질문 입력 폼 |

**인터랙션:**
- `/` 키 누르면 검색 인풋에 자동 포커스
- 검색어 입력 시 점수 기반 실시간 필터링 (debounce 없이 즉시)
- 다크/라이트 테마 토글 버튼 (헤더 우측)
- AI 채팅: 단일 JSON 응답 (`/ai/api/generate`), 후속 질문 지원, 취소/타임아웃 처리

**테마 지속성:**
- `localStorage('edelweiss-theme')`에 저장
- 시스템 기본값(`prefers-color-scheme`) 우선 적용 후 사용자 선택으로 덮어씀

---

### 2.2 servers.html — 온디맨드 서버

**목적:** 온디맨드 서비스(Minecraft 등)를 시작/중지하고 실시간 상태를 확인

**주요 UI 요소:**

| 요소 | 설명 |
|------|------|
| 서비스 카드 | 서비스별 상태 뱃지, 플레이어 수, 제어 버튼 |
| 상태 뱃지 | `offline` / `waking` / `starting` / `running` / `stopping` / `error` |
| 플레이어 수 | 실행 중일 때만 표시 |
| `<dialog id="tokenDialog">` | 토큰 입력 모달 (눈 아이콘으로 표시/숨김 토글) |

**상태 레이블:**

```javascript
{ offline: '꺼짐', waking: '깨우는 중', starting: '켜는 중',
  running: '가동 중', stopping: '종료 중', error: '오류' }
```

---

### 2.3 admin.html — 관리자 대시보드 (레거시)

**접근 제한:** Tailscale IP (`100.75.209.83`) 전용. 공개 사이트에서는 404.

**주요 기능:**

| 기능 | 설명 |
|------|------|
| 서비스 상태 그리드 | 전체 서비스 현황 및 개별 제어 버튼 |
| 감사 로그 테이블 | 페이지네이션, IP/결과/서비스별 필터, 새로고침 |
| IP 라벨 관리 | IP → 이름 매핑 추가/삭제 |
| 서버 콘솔 | 멀티 탭 (서비스별), 구문 강조, 명령어 히스토리 (↑↓ 키) |

**관리자 인증:** 페이지 로드 시 토큰 입력 다이얼로그 표시. `admin` 역할 토큰 필요.

> **참고:** Next.js `/admin`으로 마이그레이션 완료. 아래 2.4 참조.

### 2.4 /admin — Next.js 관리자 대시보드

**접근 제한:** Cloudflare Access OTP 인증 (이메일 기반). proxy.ts에서 JWT 검증.

**기술 스택:** Next.js 16 (App Router), TypeScript, Tailwind CSS v4

**파일 구조:**

```
web/src/
├── proxy.ts                        # Cloudflare Access JWT 검증 (RS256, SubtleCrypto)
├── app/admin/
│   ├── layout.tsx                  # 어드민 레이아웃 (Server Component)
│   └── page.tsx                    # 탭 네비게이션 (Client Component)
├── components/admin/
│   ├── ServiceStatusGrid.tsx       # 서비스 상태 카드 (10s/2s 적응형 폴링)
│   ├── ServiceControlGrid.tsx      # 서비스 제어 (시작/종료, optimistic UI)
│   ├── ServerConsole.tsx           # 터미널 UI (3s 폴링, 명령어 히스토리)
│   ├── AuditLogSection.tsx         # 감사 로그 테이블 (5s 실시간 폴링)
│   ├── IpLabelManager.tsx          # IP 라벨 CRUD
│   └── AuditLogTab.tsx             # 감사 로그 + IP 라벨 컨테이너
├── app/api/admin/
│   ├── status/route.ts             # GET: 서비스 상태
│   ├── audit/route.ts              # GET: 감사 로그 (limit/offset)
│   ├── ip-labels/route.ts          # GET/POST: IP 라벨
│   ├── ip-labels/[ip]/route.ts     # DELETE: IP 라벨 삭제
│   └── services/[id]/
│       ├── console/route.ts        # GET/POST: 서버 콘솔
│       └── [action]/route.ts       # POST: 서비스 시작/종료
└── lib/admin-labels.ts             # 상태/액션/결과/토큰 한글 라벨 유틸
```

**탭 구조:**

| 탭 | 상태 | 주요 컴포넌트 |
|----|------|--------------|
| 서비스 | 구현 완료 | ServiceStatusGrid + ServerConsole + ServiceControlGrid |
| 감사 로그 | 구현 완료 | AuditLogSection + IpLabelManager |
| 절전 관리 | 구현 완료 | SleepManagementTab — /idle/status, /hibernate/debug, /no-sleep |
| 모니터링 | 구현 완료 | MonitoringTab — Backend PC + Gateway VM CPU/RAM/디스크 (10s 폴링) |

**인증 방식:**
- Cloudflare Access OTP 이메일 인증 → JWT를 `CF_Authorization` 쿠키로 수신
- `proxy.ts`에서 RS256 JWT 서명 검증 (SubtleCrypto API)
- AUD 검증: `5217e5d9279113aa89c0a6653f4dbac925c04c951fd15c5508647a63d0b17ccc`
- 허용 이메일 목록: `zoop784@naver.com`, `azdazd0101@gmail.com`
- API route에서 서버사이드 `ADMIN_CONTROL_TOKEN` 주입 → Portal API 어드민 엔드포인트 호출

**API 경로 구조:**

| Next.js API | Portal API | 설명 |
|-------------|-----------|------|
| `/api/admin/status` | `/admin/status` | 서비스 전체 상태 |
| `/api/admin/audit` | `/admin/audit` | 감사 로그 |
| `/api/admin/ip-labels` | `/admin/ip-labels` | IP 라벨 CRUD |
| `/api/admin/idle` | `/admin/idle/status` | 유휴 상태 |
| `/api/admin/hibernate` | `/admin/hibernate/debug` | 절전 디버그 |
| `/api/admin/no-sleep` | `/admin/no-sleep` | no-sleep 토글 |
| `/api/admin/system` | `/admin/system/resources` | Backend PC 리소스 |
| `/api/admin/gateway` | `/admin/gateway/resources` | Gateway VM 리소스 |
| `/api/admin/services/[id]/[action]` | `/services/[id]/[action]` | 서비스 제어 |
| `/api/admin/services/[id]/console` | `/services/[id]/console` | 서버 콘솔 |

**콘솔 기능:**
- 서비스별 탭 전환 (버퍼 캐시 유지)
- 로그 레벨별 색상 (error=red, warn=yellow, debug=gray, info=blue)
- `say X` → `tellraw @a {"text":"[관리자] X","color":"gold"}` 자동 변환
- 명령어 히스토리 (ArrowUp/Down, 최대 50개)
- 자동 스크롤 + "↓ 최신으로" 힌트

---

## 3. JavaScript 모듈 구조

### 3.1 js/services.js

전역 설정 및 서비스 카탈로그를 정의합니다. 다른 JS 파일보다 먼저 로드됩니다.

```javascript
// 전역 설정 객체
window.APP_CONFIG = {
  ai: {
    enabled: true,
    endpoint: '/ai',          // 실제 요청은 /ai/api/generate로 전송
    model: 'huihui_ai/qwen3-vl-abliterated:8b-instruct',
    timeoutMs: 360000,        // 6분 (AI 콜드스타트 대기)
  },
  control: {
    enabled: true,
    endpoint: '/api/control',
    refreshMs: 10000,
    activeRefreshMs: 2000,
    actionsRequireToken: true,
    actionTokenHeader: 'X-Cheeze-Control-Token',
    actionTokenStorageKey: 'cheeze-control-action-token',
    services: [ /* 온디맨드 서비스 객체 배열 (SERVICES에서 onDemand:true인 항목) */ ],
  },
};

// 서비스 카탈로그 (검색 및 빠른 접근 그리드 전용)
const SERVICES = [ /* 전체 서비스 객체 배열 */ ];
```

**`SERVICES` 배열과 `APP_CONFIG.control.services` 배열의 역할 차이:**

| 배열 | 역할 | 포함 대상 |
|------|------|-----------|
| `SERVICES` | 검색 엔진 및 빠른 접근 그리드 데이터 소스 | 모든 서비스 (Nextcloud, Paperless, Minecraft 등) |
| `APP_CONFIG.control.services` | 온디맨드 제어 카드 렌더링 및 상태 폴링 대상 | 시작/중지가 필요한 온디맨드 서비스만 (예: minecraft-cobbleverse, ollama) |

`SERVICES`에 `onDemand: true`로 표시된 서비스라도, `APP_CONFIG.control.services`에 포함되지 않으면 제어 카드가 렌더링되지 않습니다.

### 3.2 js/app.js

홈페이지(`index.html`) 전용 로직입니다.

**주요 기능:**

| 기능 | 설명 |
|------|------|
| 검색 엔진 | `SERVICES` 배열 대상 점수 기반 필터링 |
| AI 통합 | `/ai/api/generate` 엔드포인트 단일 JSON 응답 요청 (`fetch` + `response.json()`) |
| 온디맨드 제어 | 홈에서도 서비스 시작/중지 버튼 |
| 테마 관리 | `localStorage` 기반 다크/라이트 전환 |

**주요 전역 변수:**

```javascript
let currentResults = [];        // 현재 검색 결과
let currentQuery = '';          // 현재 검색어
let aiAbortController = null;   // AI 요청 취소 컨트롤러
const controlState = new Map(); // 서비스 ID → 현재 상태
const controlPendingActions = new Set(); // 진행 중인 액션 서비스 ID
```

**토큰 저장소:**
- `sessionStorage`에 저장 (탭 닫으면 사라짐)
- 키: `APP_CONFIG.control.actionTokenStorageKey`

### 3.3 js/servers.js

서버 페이지(`servers.html`) 전용 로직입니다.

**주요 기능:**

| 기능 | 설명 |
|------|------|
| 상태 폴링 | `setInterval` 기반 주기적 상태 갱신 |
| 적응형 폴링 | 전환 중(waking/starting/stopping) → 2초, 유휴 → 10초 |
| 토큰 다이얼로그 | `<dialog>` 요소 기반 모달 (Promise 반환) |
| 서비스 카드 렌더 | 상태에 따른 버튼/뱃지 동적 렌더링 |

**주요 전역 변수:**

```javascript
const serverState = new Map();    // 서비스 ID → 상태 객체
let refreshHandle = null;         // 폴링 타이머 핸들
const pendingActions = new Set(); // 진행 중인 액션 서비스 ID
```

---

## 4. CSS 디자인 시스템

### 4.1 CSS 변수 (라이트 모드 기본값)

`css/style.css`에서 `:root`에 정의됩니다.

```css
:root {
  /* 배경 */
  --bg:             #ffffff;
  --bg-alt:         #f8f9fa;

  /* 표면 */
  --surface:        #ffffff;
  --surface-hover:  #f1f3f4;

  /* 테두리 */
  --border:         #e0e3e7;
  --border-focus:   #4f7fff;

  /* 텍스트 */
  --text:           #1a1c1e;
  --text-muted:     #5f6368;
  --text-url:       #0d652d;

  /* 강조색 */
  --accent:         #4f7fff;
  --accent-soft:    #ebf0ff;

  /* 형태 */
  --radius-lg:   16px;
  --radius-md:   12px;
  --radius-sm:   8px;

  /* 전환 */
  --t-fast:   0.15s cubic-bezier(.4,0,.2,1);
  --t-normal: 0.22s cubic-bezier(.4,0,.2,1);
}
```

### 4.2 다크 모드

`[data-theme="dark"]` 속성으로 전환됩니다.

```css
[data-theme="dark"] {
  --bg:             #12131a;
  --bg-alt:         #1c1e29;
  --surface:        #1c1e29;
  --surface-hover:  #252840;
  --border:         #2e3150;
  --text:           #e8eaf6;
  --text-muted:     #8e92b4;
  --accent:         #7a9fff;
  /* ... */
}
```

`document.documentElement.setAttribute('data-theme', theme)`으로 JS에서 토글합니다.

### 4.3 서비스 상태 클래스

상태 뱃지는 `servers.html`에서 `.server-state-badge` 클래스를 사용합니다 (`app.js`의 홈 제어 카드도 동일).

```css
.server-state-badge.is-running   { background: #e6f4ea; color: #137333; }
.server-state-badge.is-offline   { background: #f1f3f4; color: #5f6368; }
.server-state-badge.is-starting,
.server-state-badge.is-waking    { background: #fef7e0; color: #b06000; }
.server-state-badge.is-stopping  { background: #fce8e6; color: #c5221f; }
.server-state-badge.is-error     { background: #fce8e6; color: #c5221f; }
```

### 4.4 애니메이션

- 전환 중 상태(`waking`, `starting`, `stopping`): 펄스 애니메이션
- 카드 hover: `translateY(-2px)` + 그림자 강화
- AI 응답 스트리밍: 커서 깜빡임 효과

---

## 5. API 연동

### 5.1 엔드포인트 매핑

모든 API는 Nginx를 통해 Portal API(`127.0.0.1:11437`)로 프록시됩니다.

| 프론트엔드 엔드포인트 | Nginx → Portal API | 설명 |
|----------------------|-------------------|------|
| `GET /api/control/services/{id}` | `/services/{id}` | 서비스 상태 조회 |
| `POST /api/control/services/{id}/{action}` | `/services/{id}/{action}` | 서비스 제어 (토큰 필요) |
| `GET /api/control/admin/audit` | `/admin/audit` | 감사 로그 (관리자) |
| `GET /api/control/admin/ip-labels` | `/admin/ip-labels` | IP 라벨 조회 (관리자) |
| `POST /api/control/admin/ip-labels` | `/admin/ip-labels` (POST) | IP 라벨 추가 (관리자) |
| `DELETE /api/control/admin/ip-labels/{ip}` | `/admin/ip-labels/{ip}` | IP 라벨 삭제 (관리자) |
| `POST /ai/api/generate` | Ollama 프록시 | AI 질의 (단일 응답) |

### 5.2 상태 응답 구조

```json
{
  "service_id": "minecraft-cobbleverse",
  "state": "running",
  "players": 2,
  "max_players": 20,
  "uptime_seconds": 3600
}
```

**state 값:** `offline` | `waking` | `starting` | `running` | `stopping` | `error`

### 5.3 액션 요청

```javascript
// POST /api/control/services/{service_id}/{action}
fetch(`${CONTROL_CONFIG.endpoint}/services/${serviceId}/${action}`, {
  method: 'POST',
  headers: {
    'X-Cheeze-Control-Token': token,
  },
});
```

### 5.4 AI 요청

```javascript
// POST /ai/api/generate — Ollama 프록시, 단일 JSON 응답
fetch(`${AI_CONFIG.endpoint.replace(/\/$/, '')}/api/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: AI_CONFIG.model,
    prompt: query,   // 단일 문자열 (messages 배열 아님)
    stream: false,
  }),
  signal: aiAbortController.signal,
});
// response.json()으로 단일 응답 처리 → payload.response 필드 사용
```

**AI 설정값 (`APP_CONFIG.ai`):**

| 키 | 기본값 | 설명 |
|----|--------|------|
| `endpoint` | `'/ai'` | Ollama 프록시 기본 경로. 실제 요청은 `{endpoint}/api/generate`로 전송 |
| `model` | `'huihui_ai/qwen3-vl-abliterated:8b-instruct'` | Ollama 모델명 |
| `timeoutMs` | `360000` | AI 요청 타임아웃 (밀리초, 6분) |
| `stream` | `false` | 스트리밍 비활성화 (단일 JSON 응답) |

---

## 6. 서비스 카탈로그 구조

`js/services.js`의 `SERVICES` 배열에 정의됩니다.

### 6.1 서비스 객체 필드

```javascript
{
  // 필수 필드
  id: 'nextcloud',              // 고유 식별자 (kebab-case)
  name: 'Nextcloud',            // 표시 이름 (영문)
  nameKo: '클라우드',           // 표시 이름 (한글)
  description: '설명 텍스트',
  url: 'https://cloud.example.com',
  color: '#0082c9',             // 브랜드 색상
  bgColor: '#e6f3fa',           // 라이트 모드 카드 배경
  bgColorDark: '#0a2a40',       // 다크 모드 카드 배경
  icon: `<svg>...</svg>`,       // SVG 문자열 (또는 이모지)
  keywords: ['검색어1', '검색어2'],  // 한글/영문 검색어
  category: '스토리지',
  categoryIcon: '☁️',
  featured: true,               // 빠른 접근 그리드 표시 여부

  // 선택 필드
  iconType: 'emoji',            // 생략 시 SVG로 처리
  status: 'online',             // 'online' | 'offline' | 'unknown'
  onDemand: true,               // 온디맨드 서비스 여부 (제어 버튼 표시)
}
```

### 6.2 검색 점수 알고리즘

`app.js`에서 각 서비스에 점수를 계산하여 정렬합니다. 각 필드는 weight를 갖고, 일치 종류에 따라 weight에 배수를 곱합니다.

| 필드 | weight | 완전 일치 (×3) | 시작 일치 (×2) | 포함 (×1) |
|------|--------|----------------|----------------|-----------|
| `name` | 10 | 30 | 20 | 10 |
| `nameKo` | 10 | 30 | 20 | 10 |
| `description` | 3 | 9 | 6 | 3 |
| `category` | 5 | 15 | 10 | 5 |
| `keywords` (항목별) | 7 | 21 | 14 | 7 |

> 점수가 0보다 큰 서비스만 결과에 포함되며, 점수 내림차순으로 정렬됩니다.

### 6.3 새 서비스 추가

```javascript
// js/services.js SERVICES 배열에 추가
{
  id: 'new-service',        // Control API 서비스 ID와 일치해야 함
  name: 'New Service',
  nameKo: '새 서비스',
  description: '설명',
  url: 'https://new.example.com',
  color: '#123456',
  bgColor: '#f0f0ff',
  bgColorDark: '#0a0a1f',
  icon: '🆕',
  iconType: 'emoji',
  keywords: ['new', '새서비스'],
  category: '카테고리',
  categoryIcon: '🆕',
  featured: false,
}
```

온디맨드 서비스의 경우 `APP_CONFIG.control.services` 배열에도 ID를 추가합니다.

---

## 7. 상태 관리 및 폴링 전략

### 7.1 상태 머신

서비스 상태는 다음 전환 경로를 따릅니다:

```
offline ──start──→ waking ──→ starting ──→ running
running ──stop───→ stopping ──→ offline
* ──오류──→ error
```

### 7.2 적응형 폴링 (servers.js)

```javascript
const POLL_INTERVAL_ACTIVE = 2000;   // 전환 중 (2초)
const POLL_INTERVAL_IDLE = 10000;    // 유휴 (10초)

function getPollingInterval() {
  const isTransitioning = [...serverState.values()].some(
    s => ['waking', 'starting', 'stopping'].includes(s.state)
  );
  return isTransitioning ? POLL_INTERVAL_ACTIVE : POLL_INTERVAL_IDLE;
}
```

상태가 전환 중이면 2초마다, 안정 상태이면 10초마다 갱신합니다.
폴링 간격이 변경되면 기존 타이머를 취소하고 새 간격으로 재설정합니다.

### 7.3 낙관적 UI 업데이트

제어 버튼 클릭 시:
1. 즉시 버튼 비활성화 + 로딩 스피너 표시
2. API 요청 전송
3. 응답 성공 시: 예상 다음 상태로 UI 즉시 업데이트
4. 폴링으로 실제 상태 확인 및 동기화

### 7.4 토큰 캐싱

- `sessionStorage`에 토큰 저장 (탭/창 닫으면 자동 삭제)
- 인증 오류(401) 응답 시 캐시된 토큰 자동 삭제 후 재입력 다이얼로그 표시
- 여러 서비스가 같은 토큰을 공유 (같은 `actionTokenStorageKey`)

### 7.5 AI 스트리밍 상태 관리 (app.js)

```javascript
let aiAbortController = null;   // 진행 중인 요청 취소용
let aiProgressInterval = null;  // 프로그레스 메시지 순환 타이머

// 새 요청 시작 전 이전 요청 취소
if (aiAbortController) {
  aiAbortController.abort();
}
aiAbortController = new AbortController();
```

대화 히스토리(`conversationHistory` 배열)에 메시지를 누적하여 문맥 있는 후속 질문을 지원합니다.
