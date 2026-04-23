# E-class 자동화 서비스 설계 문서

> 명지전문대학 E-class (cyber.mjc.ac.kr) LMS 자동 출석/강의 관리 웹 GUI
> 최초 작성: 2026-04-24

---

## 개요

| 항목 | 값 |
|------|-----|
| 대상 LMS | https://cyber.mjc.ac.kr (명지전문대학 원격강좌) |
| 플랫폼 | Java JSP 커스텀 빌드 (Mediopia Tech 기반 추정) |
| 백엔드 | FastAPI + Playwright, Cloud VM (10.0.0.10:8030) |
| 프론트엔드 | Next.js `/lms` 페이지 (기존 cheeze-web 컨테이너) |
| 스토리지 | SQLite (`/home/data/eclass/eclass.db`) |
| 인증 보호 | Cloudflare Access (기존 `/admin` 정책 확장) |

---

## 1. 사이트 구조 분석 (Phase 1 결과)

### 1.1 LMS 플랫폼 식별

| 구분 | 내용 |
|------|------|
| 벤더 | Mediopia Tech 기반 커스텀 빌드 (구 시스템: oldcyber.mjc.ac.kr) |
| 백엔드 기술 | Java JSP/Servlet |
| 프론트엔드 기술 | jQuery + AJAX |
| URL 패턴 | `/home/mainHome/Form/main` (JSP 기반) |
| 보안 | CSRF 토큰, `encryptData` 커스텀 암호화, 인앱브라우저 차단 |

### 1.2 SSO 및 인증 구조

```
sso.mjc.ac.kr (통합 SSO)
  ├── cyber.mjc.ac.kr     (E-Class 원격강좌)
  ├── oldcyber.mjc.ac.kr  (구 E-Class)
  ├── attend.mjc.ac.kr    (출결 관리)
  ├── ncsi.mjc.ac.kr      (역량기반 학사시스템)
  └── sugang.mjc.ac.kr    (수강신청)
```

로그인 파라미터:
- `inputId`: 학번
- `inputPwd`: 비밀번호
- `encryptData`: 커스텀 암호화 서명 (JS `makeSendInfo()` / `encode()` 함수 생성)

### 1.3 영상 강의 플레이어 메커니즘

- 강의 시청 시 **팝업 창**에서 별도 플레이어 실행
- **중간 체크포인트 버튼**: 주기적으로 확인 팝업 표시 → 60초 내 클릭 필수
- **학습종료 버튼**: 영상 완료 후 반드시 클릭해야 출석 기록
- **2시간 비활동 시 자동 세션 종료**

### 1.4 출석 인정 기준

| 기호 | 상태 | 시청률 조건 |
|------|------|------------|
| ○ | 학습완료(출석) | 주차 기간 내 100% 학습 |
| △ | 반출석/지각 | 80~99% (3회 누적 = 결석 1회) |
| Ⅹ | 결석 | 0~79% |

- 전체 80% 이상 출석 시 성적 평가 대상
- **기간 이후 시청분은 출석 불인정** (마감 전 완료 필수)

### 1.5 안티봇 메커니즘

| 방어 수단 | 상세 |
|-----------|------|
| 이메일 인증 코드 | 차시별 수강 시 학교 이메일로 인증코드 발송 → 입력 필요 |
| 중간 체크포인트 버튼 | 60초 내 클릭 (팝업 감지 필수) |
| 학습종료 버튼 | 영상 완료 시 명시적 클릭 필요 |
| 중복 로그인 방지 | 동일 계정 다중 세션 차단 |
| 인앱브라우저 차단 | Kakao, Naver, Instagram 등 차단 |
| 2시간 비활동 타임아웃 | 방치 세션 자동 종료 |
| `encryptData` 서명 | 요청별 커스텀 암호화 파라미터 |

---

## 2. 시스템 아키텍처

### 2.1 전체 데이터 흐름

```
사용자 (브라우저)
  │ HTTPS → Cloudflare Access 인증
  ▼
Cloudflare Edge → cloudflared
  ▼
Gateway LXC Nginx (:80)
  │ location / → proxy_pass http://127.0.0.1:3000
  ▼
Next.js cheeze-web (:3000)
  │ /lms 페이지 렌더링 (React)
  │ API 호출: /api/lms/* → server-side fetch
  ▼
Next.js API Route Handler
  │ fetch('http://10.0.0.10:8030/...')
  ▼
eclass-api FastAPI (:8030, Cloud VM)
  │ Playwright headless Chromium (컨테이너 내부)
  ▼
https://cyber.mjc.ac.kr
```

### 2.2 이메일 인증 흐름 (v1: 수동)

```
강의 자동 시청 중
  │ E-class 이메일 인증 팝업 감지
  ▼
eclass-api → 상태: "email_verification_required"
  ▼
Next.js /lms 페이지 → "인증코드 입력 필요" UI 표시
  ▼
사용자가 학교 이메일에서 코드 확인 → 웹 UI 입력
  ▼
POST /api/lms/verify-email → eclass-api
  │ Playwright로 인증코드 입력 → 자동화 재개
  ▼
강의 시청 계속
```

### 2.3 컴포넌트 배치

| 컴포넌트 | 위치 | 포트 | 접근 경로 |
|---------|------|------|-----------|
| Frontend (Next.js `/lms`) | Gateway LXC, cheeze-web | 3000 (기존) | Cloudflare Access → Nginx → Next.js |
| Backend API (FastAPI) | Cloud VM 10.0.0.10 | 8030 | Next.js API route → 10.0.0.10:8030 |
| Playwright Chromium | Cloud VM, eclass-api 컨테이너 내부 | CDP 내부 | 컨테이너 내부 전용 |
| SQLite DB | Cloud VM `/home/data/eclass/` | — | 파일 직접 |

---

## 3. 백엔드 API 설계 (FastAPI)

### 3.1 엔드포인트 목록

#### 인증 / 세션

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/auth/login` | E-class 로그인 (세션 쿠키 저장) |
| `POST` | `/auth/logout` | 로그아웃 및 세션 정리 |
| `GET` | `/auth/status` | 현재 로그인 상태 확인 |
| `POST` | `/auth/verify-email` | 이메일 인증코드 입력 |

#### 과목 / 강의

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/courses` | 수강 중인 과목 목록 |
| `GET` | `/courses/{course_id}/lectures` | 과목별 강의 목록 + 출석 현황 |
| `GET` | `/courses/{course_id}/attendance` | 과목별 출석 현황 요약 |

#### 자동화 제어

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/automation/attend` | 특정 강의 출석 실행 (단건) |
| `POST` | `/automation/attend-all` | 미완료 강의 전체 자동 출석 |
| `GET` | `/automation/status` | 자동화 현재 실행 상태 |
| `POST` | `/automation/stop` | 자동화 중지 |

#### 자동 모드 (스케줄)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/auto-mode` | 자동 모드 설정 조회 |
| `PUT` | `/auto-mode` | 자동 모드 설정 변경 |

#### 시스템

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/healthz` | 헬스체크 |

### 3.2 주요 응답 모델

#### 자동화 상태 (`GET /automation/status`)

```json
{
  "state": "running | idle | email_verification_required | error",
  "current_course": "컴퓨터 기초",
  "current_lecture": "3주차 2차시",
  "progress": 42,
  "message": "중간 체크포인트 통과 중..."
}
```

#### 강의 목록 (`GET /courses/{id}/lectures`)

```json
{
  "course_id": "CS101",
  "course_name": "컴퓨터 기초",
  "lectures": [
    {
      "id": "lec_1",
      "week": 1,
      "session": 1,
      "title": "컴퓨터의 이해",
      "duration_min": 30,
      "attendance": "completed",
      "deadline": "2026-04-30T23:59:59"
    }
  ]
}
```

---

## 4. Docker 배포 구성 (Cloud VM)

### 4.1 Docker Compose 추가 서비스

`/home/docker/eclass/docker-compose.yml`:

```yaml
services:
  eclass-api:
    build:
      context: ./app
      dockerfile: Dockerfile
    container_name: eclass-api
    ports:
      - "8030:8000"
    environment:
      - ECLASS_BASE_URL=https://cyber.mjc.ac.kr
      - ECLASS_DB_PATH=/data/eclass.db
      - TZ=Asia/Seoul
    volumes:
      - /home/data/eclass:/data
    restart: unless-stopped
    shm_size: '512m'
    deploy:
      resources:
        limits:
          memory: 1g
```

### 4.2 Dockerfile

```dockerfile
FROM mcr.microsoft.com/playwright/python:v1.44.0-noble
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

`requirements.txt`:
```
fastapi
uvicorn[standard]
playwright
pydantic
sqlalchemy
aiohttp
```

### 4.3 데이터 경로

| 경로 | 내용 |
|------|------|
| `/home/data/eclass/eclass.db` | SQLite DB (세션, 설정, 로그) |
| `/home/data/eclass/browser-state/` | Playwright 세션 쿠키/스토리지 |

---

## 5. 인프라 통합

### 5.1 Network Topology 추가 사항

**Cloud VM (10.0.0.10) 포트 추가:**

| 포트 | 서비스 | 접근 범위 |
|------|--------|-----------|
| 8030 | eclass-api (FastAPI) | vmbr1 NAT (Gateway LXC 경유) |

**기존 Cloud VM 포트 (변경 없음):**

| 포트 | 서비스 |
|------|--------|
| 80 | Nextcloud |
| 8010 | Paperless-ngx |
| 8020 | ArchiveBox |

### 5.2 Nginx 라우팅 (Gateway LXC)

Next.js API 라우트가 서버 사이드에서 Cloud VM으로 프록시하므로 **Gateway Nginx 변경 없음**. 브라우저는 `10.0.0.10:8030`에 직접 접근하지 않음.

### 5.3 Cloudflare Access 설정

기존 Access 정책에 `/lms*` 경로 추가 필요:
- Cloudflare Dashboard → Access → Applications → 기존 앱에 `/lms*` path 추가
- 또는 별도 Application으로 `edelweiss0297.cloud/lms*` 생성

---

## 6. 프론트엔드 설계 (Next.js `/lms`)

### 6.1 페이지 구조

```
/lms
  ├── 로그인 상태 / 세션 상태 표시
  ├── 과목 목록 (수강 현황 요약)
  ├── 과목 상세 → 강의 목록 + 출석 현황
  ├── 자동화 제어 패널
  │   ├── 전체 자동 출석 실행 버튼
  │   ├── 실행 상태 실시간 표시
  │   └── 이메일 인증코드 입력 모달
  └── 자동 모드 설정 (스케줄 설정)
```

### 6.2 API 라우트 (`/api/lms/`)

Next.js server-side에서 `10.0.0.10:8030`으로 프록시:

```
/api/lms/auth/*       → http://10.0.0.10:8030/auth/*
/api/lms/courses/*    → http://10.0.0.10:8030/courses/*
/api/lms/automation/* → http://10.0.0.10:8030/automation/*
/api/lms/auto-mode    → http://10.0.0.10:8030/auto-mode
```

---

## 7. 구현 난이도 및 리스크

### 7.1 `encryptData` 역분석 (높음)

로그인 요청의 커스텀 암호화 파라미터. JS 소스에서 `makeSendInfo()` / `encode()` 함수를 분석하여 Python으로 재구현 필요.
- **대안**: Playwright로 실제 로그인 페이지를 렌더링하여 JS를 그대로 실행 → 브라우저가 암호화 처리 → 쿠키/세션 추출

### 7.2 이메일 인증 자동화 (중간, v2 목표)

v1은 수동 입력. v2에서 IMAP 폴링으로 자동화 시 고려사항:
- 학교 이메일 서버 IMAP 지원 여부 확인 필요
- 자격증명 보안 저장 (환경변수 or 암호화 저장)

### 7.3 중간 체크포인트 버튼 감지 (중간)

Playwright로 팝업 DOM 감지 후 60초 내 클릭. 이벤트 기반 감지로 구현.

### 7.4 메모리 리소스 (낮음)

Playwright Chromium은 ~300-500MB 사용. Cloud VM에 메모리 제한(1GB) 설정으로 다른 서비스(Nextcloud, Paperless) 보호.

---

## 8. 구현 단계 (Phases)

| Phase | 내용 | 상태 |
|-------|------|------|
| **Phase 1** | 사이트 구조 분석 | **완료** |
| **Phase 2** | FastAPI 백엔드 스캐폴딩 (로그인, 과목 조회) | **완료** |
| **Phase 3** | Playwright 자동화 (강의 시청, 체크포인트, 학습종료) | **완료** |
| **Phase 4** | Next.js `/lms` UI 구현 | **완료** |
| **Phase 5** | 이메일 인증 수동 흐름 ���현 | **완료 (Phase 3/4에 포함)** |
| **Phase 6** | Cloud VM Docker 배포 가이드 | **완료** |
| **Phase 7** | 자동 모드 (APScheduler) 구현 | **완료** |
| **Phase 8** | IMAP 이메일 자동 인증 (선택적) | 미정 |

---

## 9. 배포 체크리스트

코드는 GitHub에 푸시 완료. 아래 작업을 순서대로 수행합니다.

### 9.1 Cloud VM — 백엔드 배포

| # | 작업 | 명령어 | 확인 |
|---|------|--------|------|
| 1 | Gateway에서 소스 갱신 | `cd /var/www/home && git pull origin main` | |
| 2 | Cloud VM에 eclass/ 전송 | `scp -r /var/www/home/eclass root@10.0.0.10:/home/docker/eclass` | |
| 3 | 데이터 디렉토리 생성 | `ssh root@10.0.0.10 'mkdir -p /home/data/eclass/browser-state'` | |
| 4 | Docker 빌드 및 실행 | `ssh root@10.0.0.10 'cd /home/docker/eclass && docker compose build && docker compose up -d'` | |
| 5 | 헬스체크 | `ssh root@10.0.0.10 'curl -s http://localhost:8030/healthz'` → `{"status":"ok"}` | |

### 9.2 Gateway LXC — 프론트엔드 재빌드

| # | 작업 | 명령어 | 확인 |
|---|------|--------|------|
| 1 | Next.js 웹 재빌드 | `cd /var/www/home/deploy/docker && docker compose build web && docker compose up -d web` | |
| 2 | /lms 페이지 접근 확인 | 브라우저에서 `https://edelweiss0297.cloud/lms` 접속 | |

### 9.3 Cloudflare Access — 경로 보호

| # | 작업 | 위치 | 확인 |
|---|------|------|------|
| 1 | Cloudflare Zero Trust 대시보드 접속 | `dash.teams.cloudflare.com` | |
| 2 | Access → Applications → 신규 또는 기존 앱 편집 | | |
| 3 | Application domain: `edelweiss0297.cloud`, Path: `/lms` | | |
| 4 | Policy: Allow, OTP 이메일 인증 적용 | | |

### 9.4 E-class 셀렉터 검증 (최초 1회)

Cloud VM에서 서비스 실행 후, `/lms` 페이지에서 실제 E-class 로그인을 시도���여 Playwright 셀렉터를 검증합���다. 셀렉터가 맞지 않으면 아래 파일을 수정 후 재빌드합니다.

| 파일 | 검증 대상 |
|------|-----------|
| `eclass/app/browser.py` | 로그인 폼 (`#inputId`, `#inputPwd`), 중복 로그인 팝업, 로그인 성공 판별 |
| `eclass/app/routers/courses.py` | 과목 목록 셀렉터 (`.course-box`, `KJKEY` 파라미터), 강의 테이블 행 |
| `eclass/app/routers/automation.py` | 강의 재생 버튼, 체크포인트 버튼, 학습종료 버튼, 이메일 인증 모달 |

수정 후 재배포:
```bash
ssh root@10.0.0.10 'cd /home/docker/eclass && docker compose build && docker compose up -d'
```

### 9.5 환경변수 (선택)

Next.js API 프록시의 백엔드 URL을 오버라이드하려면:

```bash
# Gateway LXC의 web 컨테이너 환경변수
# deploy/docker/docker-compose.yml의 web 서비스에 추가:
environment:
  - ECLASS_API_URL=http://10.0.0.10:8030
```

기본값은 `http://10.0.0.10:8030`으로 하드코딩되어 있어 별도 설정 없이도 동작합니다.

---

## 관련 문서

- [Cloud VM 인프라](../infrastructure/cloud-vm.md)
- [Gateway LXC](../infrastructure/gateway-lxc.md)
- [네트워크 토폴로지](../architecture/network-topology.md)
- [보안 모델](../security/security-model.md)
