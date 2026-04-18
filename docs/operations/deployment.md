# CHEEZE 배포 절차

> 최종 업데이트: 2026-04-18

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

### Gateway (Linux LXC) - Docker Compose 기반

| 소스 경로 (리포지토리) | Docker 처리 | 서비스 |
|------------------------|-------------|--------|
| `deploy/gateway/cheeze-portal-api.py` | Docker build에서 직접 사용 | `portal-api` (Docker) |
| `deploy/gateway/cheeze-control-api.py` | Docker build에서 직접 사용 | `control-api` (Docker) |
| `deploy/gateway/cheeze-ai-queue.py` | Docker build에서 직접 사용 | `ai-queue` (Docker) |
| `deploy/discord-bot/cheeze-discord-bot.py` | 여전히 `/opt/cheeze-bot/`로 cp 필요 | `cheeze-discord-bot` (systemd) |
| `index.html`, `js/`, `css/`, `servers.html` | `/var/www/home/`로 git pull 반영 | Nginx 정적 파일 |
| `web/` | Docker build에서 npm run build 실행 | `web` (Docker, Next.js) |

**정적 파일 (HTML/JS/CSS):** `git pull`로 자동 반영됨. 별도 복사 불필요.

**Python API 서비스 (control-api, portal-api, ai-queue):** `git pull` 후 `docker compose build [service]` + `docker compose up -d [service]`. `/opt/` 경로로 수동 cp 불필요 (Docker가 소스에서 직접 빌드).

**Next.js 웹:** `git pull` 후 `docker compose build web` + `docker compose up -d web`. Docker build 단계에서 자동으로 `npm run build` 실행됨.

**Discord 봇:** 여전히 systemd로 실행. `git pull` 후 수동 cp + `systemctl restart` 필요.

### Homepc (Windows)

| 소스 경로 (리포지토리) | 배포 경로 | 서비스 |
|------------------------|-----------|--------|
| `deploy/backend/cheeze-backend-agent.py` | `D:\Servers\Control\backend-agent\cheeze-backend-agent.py` | Backend Agent |

> **주의:** Backend Agent 실제 실행 경로는 `D:\Servers\Control\backend-agent\`입니다. 배포 후 해당 경로로 파일을 복사해야 합니다. Backend Agent는 `Start-Process`로 실행 중 (별도 Windows 서비스 없음).

---

## 3. 자동 배포 흐름

### deploy-gateway 잡 (Docker Compose)

```yaml
steps:
  1. git fetch origin main
  2. 변경 파일 목록 확인 (git diff --name-only HEAD origin/main)
  3. git pull origin main
  4. 변경된 파일만 선택적 배포:
     - cheeze-portal-api.py 변경
       → cd deploy/docker && docker compose build portal-api && docker compose up -d portal-api
     - cheeze-control-api.py 변경
       → cd deploy/docker && docker compose build control-api && docker compose up -d control-api
     - cheeze-ai-queue.py 변경
       → cd deploy/docker && docker compose build ai-queue && docker compose up -d ai-queue
     - web/ 변경 (Next.js)
       → cd deploy/docker && docker compose build web && docker compose up -d web
     - cheeze-discord-bot.py 변경 (여전히 systemd)
       → cp deploy/discord-bot/cheeze-discord-bot.py /opt/cheeze-bot/ && systemctl restart cheeze-discord-bot
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

### 4.1 Gateway 수동 배포 (Docker Compose)

```bash
# Gateway SSH 접속 후
cd /var/www/home
git pull origin main

# Python API 서비스 (Docker Compose 기반)
cd deploy/docker

# Portal API 재빌드 및 재시작
docker compose build portal-api && docker compose up -d portal-api

# Control API 재빌드 및 재시작
docker compose build control-api && docker compose up -d control-api

# AI Queue 재빌드 및 재시작
docker compose build ai-queue && docker compose up -d ai-queue

# Next.js 웹 재빌드 및 재시작
docker compose build web && docker compose up -d web

# Discord 봇 (여전히 systemd)
cp /var/www/home/deploy/discord-bot/cheeze-discord-bot.py /opt/cheeze-bot/
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

### Gateway Docker Compose 서비스

```bash
# Compose 파일 경로 (편의상 변수 설정 권장)
COMPOSE_FILE="/var/www/home/deploy/docker/docker-compose.yml"

# 상태 확인
docker compose -f $COMPOSE_FILE ps

# 모든 서비스 재시작
docker compose -f $COMPOSE_FILE restart

# 개별 서비스 재시작
docker compose -f $COMPOSE_FILE restart portal-api
docker compose -f $COMPOSE_FILE restart control-api
docker compose -f $COMPOSE_FILE restart ai-queue
docker compose -f $COMPOSE_FILE restart web
docker compose -f $COMPOSE_FILE restart nginx

# 로그 확인 (실시간)
docker compose -f $COMPOSE_FILE logs -f

# 특정 서비스 로그
docker compose -f $COMPOSE_FILE logs -f portal-api
docker compose -f $COMPOSE_FILE logs -f web
docker compose -f $COMPOSE_FILE logs -f control-api
docker compose -f $COMPOSE_FILE logs -f ai-queue
docker compose -f $COMPOSE_FILE logs -f nginx
```

### Gateway systemd 서비스 (Discord 봇만 남음)

```bash
# Discord 봇 상태 확인
systemctl status cheeze-discord-bot

# Discord 봇 재시작
systemctl restart cheeze-discord-bot

# Discord 봇 로그
journalctl -u cheeze-discord-bot -f
```

### 구성 파일 위치

| 구성 요소 | 위치 | 설명 |
|-----------|------|------|
| Docker Compose | `/var/www/home/deploy/docker/docker-compose.yml` | 메인 설정 파일 |
| 환경변수 | `/var/www/home/deploy/docker/.env` | 서비스 환경변수 |
| Nginx 설정 | `/var/www/home/deploy/docker/nginx/conf.d/default.conf` | 리버스 프록시 설정 |
| Dockerfile | `/var/www/home/deploy/docker/Dockerfile.*` | 컨테이너 이미지 정의 |
| Discord 봇 | `/opt/cheeze-bot/cheeze-discord-bot.py` | systemd로 실행 |

---

## 6. 롤백 절차

### 6.1 이전 커밋으로 롤백

```bash
# Gateway에서
cd /var/www/home

# 롤백할 커밋 SHA 확인
git log --oneline -10

# 특정 파일만 되돌리기 (예: portal-api)
git checkout <commit-sha> -- deploy/gateway/cheeze-portal-api.py

# Docker 이미지 재빌드 및 재시작
cd deploy/docker
docker compose build portal-api && docker compose up -d portal-api
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
cd /var/www/home/deploy/docker
docker compose stop portal-api   # 외부 액션 차단
docker compose stop control-api  # 내부 제어 차단
```

---

## 7. 새 서비스 추가 시 배포 설정

### 7.1 새 Docker Compose 기반 Python 서비스 추가

1. `deploy/gateway/cheeze-<service-name>.py` 작성

2. `deploy/docker/Dockerfile.<service-name>` 작성 (Python API 패턴 기준):

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# 소스 복사
COPY deploy/gateway/cheeze-<service-name>.py ./
COPY deploy/gateway/requirements.txt ./

# 의존성 설치 (필요한 경우)
RUN pip install -r requirements.txt

EXPOSE 1143X

CMD ["python3", "cheeze-<service-name>.py"]
```

3. `deploy/docker/docker-compose.yml`에 서비스 추가:

```yaml
<service-name>:
  build:
    context: /var/www/home
    dockerfile: deploy/docker/Dockerfile.<service-name>
  container_name: cheeze-<service-name>
  ports:
    - "127.0.0.1:1143X:1143X"
  environment:
    - CHEEZE_<SERVICE_NAME>_LISTEN_HOST=0.0.0.0
    - CHEEZE_<SERVICE_NAME>_LISTEN_PORT=1143X
  restart: always
```

4. `.github/workflows/deploy.yml`의 `deploy-gateway` 잡에 블록 추가:

```yaml
if echo "$CHANGED" | grep -q "^deploy/gateway/cheeze-<service-name>\.py$"; then
  cd deploy/docker
  docker compose build <service-name> && docker compose up -d <service-name>
  echo "✓ cheeze-<service-name> restarted"
fi
```

5. Gateway에서 최초 1회 수동 배포:

```bash
cd /var/www/home/deploy/docker
docker compose build <service-name>
docker compose up -d <service-name>
docker compose logs -f <service-name>  # 정상 시작 확인
```

### 7.2 새 정적 파일 추가

HTML/JS/CSS 파일은 `/var/www/home/`에 `git pull`로 자동 반영됩니다. 추가 설정 불필요.

단, Nginx 라우팅이 필요한 경우 (`/api/new-endpoint/` 등) 다음을 수행합니다:

```bash
# 1. Nginx 설정 파일 편집
nano /var/www/home/deploy/docker/nginx/conf.d/default.conf

# 2. 설정 테스트 및 재로드
COMPOSE_FILE="/var/www/home/deploy/docker/docker-compose.yml"
docker compose -f $COMPOSE_FILE exec nginx nginx -t
docker compose -f $COMPOSE_FILE exec nginx nginx -s reload
```

### 7.3 기존 systemd 서비스 추가 (Discord 봇 패턴)

Discord 봇처럼 systemd로 실행해야 하는 서비스의 경우:

1. `deploy/discord-bot/cheeze-<service-name>.py` 작성

2. `.github/workflows/deploy.yml`의 `deploy-gateway` 잡에 블록 추가:

```yaml
if echo "$CHANGED" | grep -q "^deploy/discord-bot/cheeze-<service-name>\.py$"; then
  cp deploy/discord-bot/cheeze-<service-name>.py /opt/cheeze-<dir>/
  systemctl restart cheeze-<service-name>
  echo "✓ cheeze-<service-name> restarted"
fi
```

3. Gateway에서 최초 1회 수동 설치:

```bash
# 서비스 파일 설치
sudo cp deploy/discord-bot/cheeze-<service-name>.service.example \
   /etc/systemd/system/cheeze-<service-name>.service

# 환경변수 파일 편집 (필요한 경우)
sudo nano /opt/cheeze-<dir>/.env

# systemd 리로드 및 시작
sudo systemctl daemon-reload
sudo systemctl enable cheeze-<service-name>
sudo systemctl start cheeze-<service-name>
```
