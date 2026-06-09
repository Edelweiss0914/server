# 캡스톤 기말 리디자인 작업 기록 (2026-06-09)

> 캡스톤 기말 발표(2026-06-11) 준비를 위한 인프라 정비 및 UI 리디자인 전체 작업 내역

## 1. 배경

- CHEEZE 프로젝트는 원래 개인 홈서버 인프라로 시작, 캡스톤 과제로 이관
- 교수님 조언: **IT담당자 없는 소상공인·중소기업 대상 솔루션**으로 프레이밍
- 게임 서버는 핵심이 아닌 "확장 가능성" 예시로 남김
- 1달 이상 미관리된 Pterodactyl, E-class LMS 서비스 제거 결정

## 2. Phase 1: 서비스 제거 및 인프라 정비

### 2.1 Pterodactyl 제거

**커밋:** `a2f2e6b` — Remove Pterodactyl and E-class LMS from infrastructure

제거 대상:
- **Docker Compose** — `pterodactyl-panel`, `pterodactyl-db` (MariaDB), `pterodactyl-cache` (Redis) 서비스 3개 + 볼륨 3개
- **Nginx** — `panel.edelweiss0297.cloud`, `wings.edelweiss0297.cloud` 서버 블록 2개
- **커스텀 이미지** — `deploy/docker/pterodactyl-panel/` 디렉토리 (Dockerfile, ko-patch.js, patch-panel.sh, .my.cnf)
- **환경변수** — `.env.example`에서 `PTERO_*`, `PTERODACTYL_*` 항목
- **프론트엔드** — `PterodactylTab.tsx`, `pterodactyl.ts` (API 클라이언트), `panel-access/page.tsx`, `/api/admin/pterodactyl/route.ts`
- **어드민 패널** — Pterodactyl 탭 제거 (`admin/page.tsx`)
- **서버 페이지** — Pterodactyl 안내문 + 패널 접속 링크 제거 (`servers/page.tsx`)
- **대여 신청** — Pterodactyl 문구 제거 (`RentalRequestPanel.tsx`)
- **미들웨어** — `/panel-access` matcher 제거 (`proxy.ts`)
- **마이그레이션 스크립트** — pterodactyl 서비스 시작 명령 제거

### 2.2 E-class LMS 제거

제거 대상:
- **프론트엔드** — `/lms` 페이지 (page.tsx, layout.tsx), `/api/lms/[...path]/route.ts` (API 프록시)
- **백엔드 코드** — `eclass/` 디렉토리는 별도 VM에 배포되어 있으므로 프론트엔드만 제거
- **문서** — `docs/README.md`에서 E-class 자동화 문서 링크 제거

### 2.3 문서 정비

- `docs/README.md` — 제목을 "CHEEZE 홈랩 인프라 문서" → "CHEEZE 통합 인프라 문서"로 변경, 최종 갱신일 반영
- `docs/plans.md` — Phase 3 Pterodactyl 항목을 "제거됨 — 확장 가능성으로 남김"으로 상태 변경
- Cobbleverse Pterodactyl Migration 문서 링크 제거

### 2.4 서버 작업 (수동)

**Gateway LXC (192.168.50.196):**
```bash
cd /var/www/home && git pull
cd deploy/docker
docker compose stop pterodactyl-panel pterodactyl-db pterodactyl-cache
docker compose rm -f pterodactyl-panel pterodactyl-db pterodactyl-cache
docker compose up -d --build web nginx
docker compose up -d --remove-orphans
docker volume rm docker_pterodactyl-data docker_pterodactyl-db docker_pterodactyl-logs
```

**Cloud LXC (10.0.0.10):**
```bash
ssh 10.0.0.10
cd /home/docker/eclass && docker compose down
```

### 2.5 빌드 이슈 수정

**커밋:** `27fceeb` — Fix unclosed div in servers page causing build failure

- `servers/page.tsx`에서 패널 링크 제거 시 JSX `<div>` 닫는 태그 누락으로 빌드 실패
- 즉시 수정 후 재배포

### 2.6 정비 결과

| 항목 | 수치 |
|------|------|
| 변경 파일 수 | 31 |
| 삭제 코드 | -2,175줄 |
| 추가 코드 | +377줄 |
| 제거된 Docker 서비스 | 3개 |
| 제거된 Docker 볼륨 | 3개 |
| 제거된 Nginx 서버 블록 | 2개 |

## 3. Phase 2: 소상공인 포탈 리디자인

### 3.1 롤백 지점 생성

```bash
git tag pre-capstone-redesign
```

캡스톤 과정 종료 후 `git checkout pre-capstone-redesign`으로 개인 대시보드 UI 원복 가능.

### 3.2 서비스 설명 리프레이밍

**커밋:** `5b34cbe` — Redesign portal for SMB capstone with SSO login

| 서비스 | 이전 (개인용) | 이후 (소상공인용) |
|--------|-------------|-----------------|
| Nextcloud | 개인 클라우드 스토리지 | 업무 파일 중앙 관리 · 부서별 공유 폴더 · 협업 캘린더 |
| Paperless | 검색 가능한 문서 아카이브 | 세금계산서 · 영수증 · 계약서 디지털 아카이브 — OCR 자동 분류 |
| ArchiveBox | 개인용 웹 아카이브 | 거래처 웹페이지 · 정부 지원사업 공고 · 규정 변경 이력 보존 |
| Learn | 자격증 CBT 문제풀이 | 직원 교육 · 자격증 CBT · 산업안전교육 진도 관리 |
| On-Demand | 온디맨드 게임 서버 | 비업무시간 자동 종료로 비용 절감하는 온디맨드 서비스 |

### 3.3 브랜딩 변경

| 항목 | 이전 | 이후 |
|------|------|------|
| 페이지 제목 | CHEEZE — Home | CHEEZE — 통합 업무 플랫폼 |
| 메타 설명 | Edelweiss 개인 서버 홈페이지 | 소상공인을 위한 통합 IT 인프라 솔루션 |
| 헤더 부제 | 개인 서버 홈 | 통합 업무 플랫폼 |
| 푸터 | Proxmox & Cloudflare | Zero Trust 보안 인프라 |

### 3.4 SSO 로그인 시스템

**신규 파일:**
- `web/src/lib/useAuth.ts` — 인증 훅 (localStorage 세션 관리)
- `web/src/components/auth/LoginForm.tsx` — SSO 로그인 폼 컴포넌트

**데모 계정:**
| 역할 | 이메일 | 비밀번호 |
|------|--------|---------|
| 관리자 (ADMIN) | admin@cheeze.local | admin123 |
| 직원 (MEMBER) | user@cheeze.local | user123 |

**인증 흐름:**
1. 미인증 → SSO 로그인 폼 표시
2. 데모 계정으로 로그인 → localStorage에 세션 저장
3. 인증 완료 → 업무 포탈 대시보드 표시
4. 역할별 UI 차이: 관리자만 "관리자 콘솔" 링크 표시

### 3.5 메인 페이지 리디자인

**이전 (크롬 스타일):**
- 검색바 중심 개인 대시보드
- 서비스 카드 그리드
- AI 채팅

**이후 (업무 포탈):**
- SSO 로그인 화면 (미인증 시)
- 상단 바: 로고 + 사용자명 + 역할 배지 + 로그아웃
- 환영 메시지 + 현재 날짜
- 빠른 통계 카드 3개 (활성 서비스, 보안 등급, 가동률)
- 업무 서비스 그리드 (기존 QuickGrid 재사용)
- 관리자 전용 관리 콘솔 링크
- AI 검색 섹션 (로그인 후)

## 4. 커밋 이력

| 커밋 | 설명 |
|------|------|
| `a2f2e6b` | Pterodactyl + E-class LMS 제거 (31파일, -2175줄) |
| `27fceeb` | servers/page.tsx JSX 빌드 에러 수정 |
| `5b34cbe` | 소상공인 포탈 리디자인 + SSO 로그인 (7파일, +368줄) |

## 5. 미완료 / 향후 작업

- [ ] Cloudflare Zero Trust 대시보드에서 panel/wings 터널 라우트 삭제
- [ ] homepc WSL2 Wings 서비스 비활성화
- [ ] 실제 SSO IdP 연동 (Cloudflare Access 확장 또는 Authentik)
- [ ] Nextcloud/Paperless OIDC 클라이언트 설정
- [ ] 캡스톤 종료 후 `git checkout pre-capstone-redesign`으로 개인 UI 원복 검토
