# CHEEZE 배포 절차

> 최종 업데이트: 2026-04-17

## 목차

1. [CI/CD 파이프라인 개요](#1-cicd-파이프라인-개요)
2. [파일 매핑](#2-파일-매핑)
3. [자동 배포 흐름](#3-자동-배포-흐름)
4. [수동 배포 절차](#4-수동-배포-절차)
5. [서비스 재시작](#5-서비스-재시작)
6. [롤백 절차](#6-롤백-절차)
7. [새 서비스 추가 시 배포 설정](#7-새-서비스-추가-시-배포-설정)

---

## 1. CI/CD 파이프라인 개요

GitHub Actions를 사용하여 `main` 브랜치 push 시 자동 배포됩니다.

```
[Windows PC] git push
      │
      ▼
[GitHub] main 브랜치
      │
      ▼
[GitHub Actions] .github/workflows/deploy.yml
      │
      ├── deploy-gateway (self-hosted runner: gateway)
      │     └── Gateway LXC에서 실행
      │
      └── deploy-homepc (self-hosted runner: homepc)
            └── Windows 홈 PC에서 실행
```

### 러너 구성

| 러너 이름 | 위치 | 실행 환경 |
|-----------|------|-----------|
| `gateway` | Gateway LXC | Linux (bash) |
| `homepc` | Windows 홈 PC | PowerShell |

---

## 2. 파일 매핑

### Gateway (Linux LXC)

| 소스 경로 (리포지토리) | 배포 경로 | 서비스 |
|------------------------|-----------|--------|
| `deploy/gateway/cheeze-portal-api.py` | `/opt/cheeze-control/cheeze-portal-api.py` | `cheeze-portal-api` |
| `deploy/gateway/cheeze-control-api.py` | `/opt/cheeze-control/cheeze-control-api.py` | `cheeze-control-api` |
| `deploy/gateway/cheeze-ai-queue.py` | `/opt/cheeze-ai/cheeze-ai-queue.py` | `cheeze-ai-queue` |
| `deploy/discord-bot/cheeze-discord-bot.py` | `/opt/cheeze-bot/cheeze-discord-bot.py` | `cheeze-discord-bot` |
| `index.html`, `js/`, `css/`, `servers.html`, `admin.html` | `/var/www/home/` | Nginx 정적 파일 |

**정적 파일 (HTML/JS/CSS):** `git pull`로 자동 반영됨. 별도 복사 불필요.

### Homepc (Windows)

| 소스 경로 (리포지토리) | 배포 경로 | 서비스 |
|------------------------|-----------|--------|
| `deploy/backend/cheeze-backend-agent.py` | `D:\Project\deploy\backend\cheeze-backend-agent.py` | Backend Agent (자가 재시작) |

---

## 3. 자동 배포 흐름

### deploy-gateway 잡

```yaml
steps:
  1. git fetch origin main
  2. 변경 파일 목록 확인 (git diff --name-only HEAD origin/main)
  3. git pull origin main
  4. 변경된 파일만 선택적 배포:
     - cheeze-portal-api.py 변경 → cp + systemctl restart cheeze-portal-api
     - cheeze-control-api.py 변경 → cp + systemctl restart cheeze-control-api
     - cheeze-ai-queue.py 변경 → cp + systemctl restart cheeze-ai-queue
     - cheeze-discord-bot.py 변경 → cp + systemctl restart cheeze-discord-bot
```

변경되지 않은 서비스는 재시작하지 않음으로써 불필요한 서비스 중단을 방지합니다.

### deploy-homepc 잡

```powershell
1. git fetch origin main
2. git pull origin main
3. Backend Agent 스크립트 MD5 해시 출력 (로그 목적)
4. Agent가 자체 파일 해시를 감지 → ~30초 내 자동 재시작
```

Backend Agent는 자체 watchdog 루프로 스크립트 변경을 감지하여 재시작합니다. 외부 프로세스 제어 불필요.

---

## 4. 수동 배포 절차

### 4.1 Gateway 수동 배포

```bash
# Gateway SSH 접속 후
cd /var/www/home
git pull origin main

# 필요한 서비스만 재시작
cp deploy/gateway/cheeze-portal-api.py /opt/cheeze-control/
systemctl restart cheeze-portal-api

cp deploy/gateway/cheeze-control-api.py /opt/cheeze-control/
systemctl restart cheeze-control-api

cp deploy/gateway/cheeze-ai-queue.py /opt/cheeze-ai/
systemctl restart cheeze-ai-queue

cp deploy/discord-bot/cheeze-discord-bot.py /opt/cheeze-bot/
systemctl restart cheeze-discord-bot
```

### 4.2 Homepc 수동 배포

```powershell
# Windows PC에서
Set-Location D:\Project
git pull origin main
# Backend Agent는 자동으로 파일 변경을 감지하여 재시작됨
```

### 4.3 정적 파일만 업데이트

HTML/JS/CSS 변경은 `git pull` 후 즉시 적용됩니다. Nginx 재시작 불필요.

---

## 5. 서비스 재시작

### Gateway 서비스 목록

```bash
# 상태 확인
systemctl status cheeze-portal-api
systemctl status cheeze-control-api
systemctl status cheeze-ai-queue
systemctl status cheeze-discord-bot

# 재시작
systemctl restart cheeze-portal-api
systemctl restart cheeze-control-api
systemctl restart cheeze-ai-queue
systemctl restart cheeze-discord-bot

# 로그 확인
journalctl -u cheeze-portal-api -f
journalctl -u cheeze-control-api -f
journalctl -u cheeze-ai-queue -f
journalctl -u cheeze-discord-bot -f
```

### 서비스 파일 위치

| 서비스 | 설치 경로 | 서비스 파일 예제 |
|--------|-----------|-----------------|
| Portal API | `/opt/cheeze-control/` | `deploy/gateway/cheeze-portal-api.service.example` |
| Control API | `/opt/cheeze-control/` | `deploy/gateway/cheeze-control-api.service.example` |
| AI Queue | `/opt/cheeze-ai/` | `deploy/gateway/cheeze-ai-queue.service.example` |

---

## 6. 롤백 절차

### 6.1 이전 커밋으로 롤백

```bash
# Gateway에서
cd /var/www/home

# 롤백할 커밋 SHA 확인
git log --oneline -10

# 특정 커밋으로 되돌리기
git checkout <commit-sha> -- deploy/gateway/cheeze-portal-api.py
cp deploy/gateway/cheeze-portal-api.py /opt/cheeze-control/
systemctl restart cheeze-portal-api
```

### 6.2 전체 롤백

```bash
# 특정 커밋으로 브랜치 리셋 (주의: 히스토리 변경)
git reset --hard <commit-sha>
git push origin main --force
# GitHub Actions가 자동으로 이전 버전 재배포
```

### 6.3 긴급 서비스 중지

```bash
systemctl stop cheeze-portal-api   # 외부 액션 차단
systemctl stop cheeze-control-api  # 내부 제어 차단
```

---

## 7. 새 서비스 추가 시 배포 설정

### 7.1 새 Python 서비스 추가

1. `deploy/gateway/cheeze-<service-name>.py` 작성
2. `deploy/gateway/cheeze-<service-name>.service.example` 작성
3. `.github/workflows/deploy.yml`의 `deploy-gateway` 잡에 블록 추가:

```yaml
if echo "$CHANGED" | grep -q "^deploy/gateway/cheeze-<service-name>\.py$"; then
  cp deploy/gateway/cheeze-<service-name>.py /opt/cheeze-<dir>/
  systemctl restart cheeze-<service-name>
  echo "✓ cheeze-<service-name> restarted"
fi
```

4. Gateway에서 최초 1회 수동 설치:

```bash
cp deploy/gateway/cheeze-<service-name>.service.example \
   /etc/systemd/system/cheeze-<service-name>.service
# 환경변수 파일 편집
systemctl daemon-reload
systemctl enable cheeze-<service-name>
systemctl start cheeze-<service-name>
```

### 7.2 새 정적 파일 추가

HTML/JS/CSS 파일은 `/var/www/home/`에 `git pull`로 자동 반영됩니다. 추가 설정 불필요.

단, Nginx 라우팅이 필요한 경우 (`/api/new-endpoint/` 등) Nginx 설정 파일을 수정하고 `nginx -t && nginx -s reload`를 실행합니다.
