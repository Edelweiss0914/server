# Gateway LXC (CT200)

## 개요

Proxmox 호스트 위에서 실행되는 Privileged LXC 컨테이너로, 외부 트래픽의 진입점 역할을 합니다.
Nginx 리버스 프록시, Cloudflare Tunnel, CHEEZE 서비스 API, Discord 봇, AI 큐 게이트웨이가 모두 이 컨테이너에서 실행됩니다.

---

## 컨테이너 기본 설정

| 항목 | 값 |
|------|----|
| CT ID | 200 |
| 유형 | Privileged LXC |
| OS | Rocky Linux 9.4 |
| LAN IP | 192.168.50.196 (vmbr0) |
| Tailscale IP | 100.75.209.83 |
| Tailscale 호스트명 | `gateway-lxc` |

> Privileged 컨테이너를 사용하는 이유: Tailscale TUN 디바이스 및 Cloudflare Tunnel 등 네트워크 수준 커널 기능이 필요하기 때문입니다.

---

## 네트워크 설정

| 인터페이스 | 브리지 | IP | 역할 |
|------------|--------|----|------|
| eth0 | vmbr0 | 192.168.50.196/24 | LAN 연결, 외부 트래픽 수신 |
| tailscale0 | — | 100.75.209.83 | Tailscale VPN, 관리자 접근 및 backend 통신 |

### Tailscale 설치 및 초기화

```bash
# Tailscale 설치 (Rocky Linux)
curl -fsSL https://tailscale.com/install.sh | sh

# VPN 참여 (hostname 지정)
tailscale up --hostname=gateway-lxc
```

---

## 설치된 소프트웨어 목록

| 소프트웨어 | 버전 | 역할 |
|------------|------|------|
| Docker CE | — | 컨테이너 런타임 |
| docker-compose-plugin | — | Docker Compose v2 |
| Nginx | — | Docker Compose (리버스 프록시, host network) |
| cloudflared | — | 네이티브 systemd (Cloudflare Tunnel 클라이언트) |
| Tailscale | — | VPN 클라이언트 |
| Python 3 | — | 호스트 시스템 기본 (컨테이너 내부에서 API 실행) |
| Node.js | v20 LTS | (컨테이너 내부) Next.js 웹 앱 런타임 |
| GitHub Actions Runner | — | self-hosted 러너 (label: `gateway`) |

---

## 파일 시스템 레이아웃

```
/var/www/home/                  # 메인 웹사이트 루트 (git repo)
  deploy/
    gateway/
      cheeze-control-api.py           # 소스 (Docker build에서 사용)
      cheeze-portal-api.py            # 소스 (Docker build에서 사용)
      cheeze-ai-queue.py              # 소스 (Docker build에서 사용)
    orchestrator/
      service-registry.example.json   # 서비스 레지스트리 예시
    docker/
      docker-compose.yml              # Docker Compose 설정
      .env                            # 환경변수 (ADMIN_CONTROL_TOKEN 등)
      Dockerfile.portal-api           # Portal API 이미지
      Dockerfile.control-api          # Control API 이미지
      Dockerfile.ai-queue             # AI Queue 이미지
      nginx/
        conf.d/
          default.conf                # Nginx 설정 (host network)
  web/                                # Next.js 어드민 패널
    .env.local                        # ADMIN_CONTROL_TOKEN 등 시크릿 (git 제외)
    .next/                            # 빌드 산출물 (Docker build에서 생성)

/opt/cheeze-control/            # Docker bind mount 대상 (portal-api 컨테이너)
  portal-control-tokens.json    # 포털 제어 토큰 목록 (시크릿, 볼륨 관리)
  portal-control-audit.log      # 포털 감사 로그 (볼륨 관리)

/etc/nginx/conf.d/              # Nginx 설정 디렉토리 (Docker 마운트)
  default.conf                   # Docker compose에서 마운트된 설정

/actions-runner/                # GitHub Actions Runner (또는 지정 경로)
```

**변경사항:**
- Python API 서비스(`cheeze-control-api.py`, `cheeze-portal-api.py`, `cheeze-ai-queue.py`)는 더 이상 `/opt/` 경로로 복사하지 않음. Docker build 시 소스에서 직접 사용됨.
- `/opt/cheeze-control/`은 `portal-api` 컨테이너에 **직접 바인드 마운트**된다. 토큰과 감사 로그는 이 경로에 보관한다.
- `/var/www/home/deploy/docker/` 디렉토리에 Docker Compose 설정 및 Dockerfile이 위치함.

---

## Nginx 설정 구조

**Nginx는 Docker Compose로 실행되며, host network 모드를 사용합니다.**

설정 파일 위치: `/var/www/home/deploy/docker/nginx/conf.d/` (Docker에서 `/etc/nginx/conf.d/`로 마운트됨)

| 파일 | 도메인 / 역할 |
|------|---------------|
| `default.conf` | 메인 사이트 (`edelweiss0297.cloud`) + Tailscale 전용 관리자 페이지 |
| 기타 설정 | Cloud VM, Backend PC 리버스 프록시 |

### default.conf 라우팅 (edelweiss0297.cloud) - Docker nginx (host network)

| location | 대상 | 설명 |
|----------|------|------|
| `/` | `/var/www/home` 정적 파일 | 메인 홈페이지 |
| `/ai/` | `127.0.0.1:11435` | AI 큐 게이트웨이 (Docker 컨테이너) |
| `/api/control/` | `127.0.0.1:11437` | Portal API (공개, rate limit 적용, Docker 컨테이너) |
| `/admin` | `127.0.0.1:3000` | Next.js 어드민 패널 (Cloudflare Access 보호, Docker 컨테이너) |
| `/_next/` | `127.0.0.1:3000` | Next.js 정적 자산 |
| `/api/admin/` | `127.0.0.1:3000` | Next.js 어드민 API (Cloudflare Access 보호) |
| `/admin.html` | 404 | 레거시 어드민 차단 |
| `/api/control/admin/` | 404 | 공개 사이트에서 어드민 API 직접 접근 차단 |

### Docker Nginx 특징

- **host network 모드**: 포트 바인딩 불필요. 컨테이너가 호스트 네트워크 직접 사용 (127.0.0.1:80/443).
- **마운트**: `/var/www/home/deploy/docker/nginx/conf.d` → `/etc/nginx/conf.d` (읽기 전용).
- **resolver 불필요**: host network이므로 localhost 이름 해석 표준 메커니즘 사용.
- **재로드**: `docker compose -f /var/www/home/deploy/docker/docker-compose.yml exec nginx nginx -s reload`

### Rate Limit 존

```nginx
# /etc/nginx/nginx.conf 또는 conf.d 내 공통 설정
limit_req_zone $binary_remote_addr zone=cheeze_control_status:10m rate=30r/m;
limit_req_zone $binary_remote_addr zone=cheeze_control_action:10m rate=5r/m;
```

| 존 이름 | 제한 | 적용 대상 |
|---------|------|-----------|
| `cheeze_control_status` | 30 req/min | 상태 조회 엔드포인트 |
| `cheeze_control_action` | 5 req/min (POST만) | 서버 제어 액션 엔드포인트 |

---

## Cloudflare Tunnel 구성

- **도구**: `cloudflared` (네이티브 systemd 서비스로 실행, Docker 아님)
- **역할**: 공인 IP 없이 Cloudflare 엣지 → gateway-lxc Nginx로 트래픽 전달
- **인증**: Cloudflare 대시보드에서 발급한 Tunnel 자격증명 JSON 방식

### Tunnel 정보

| 항목 | 값 |
|------|-----|
| Tunnel UUID | `136c8b02-a570-42af-8753-6738ba99718c` |
| Credentials 파일 | `/root/.cloudflared/136c8b02-a570-42af-8753-6738ba99718c.json` |
| 설정 파일 | `/etc/cloudflared/config.yml` |
| Ingress 대상 | `http://localhost:80` (Nginx, host network) |

### 설정 파일 예시 (`/etc/cloudflared/config.yml`)

```yaml
tunnel: 136c8b02-a570-42af-8753-6738ba99718c
credentials-file: /root/.cloudflared/136c8b02-a570-42af-8753-6738ba99718c.json

ingress:
  - hostname: "edelweiss0297.cloud"
    service: "http://localhost:80"
  - hostname: "*.edelweiss0297.cloud"
    service: "http://localhost:80"
  - service: "http_status:404"
```

```bash
# 터널 서비스 상태 확인
systemctl status cloudflared

# 터널 로그 확인
journalctl -u cloudflared -f
```

---

## Docker Compose 서비스 목록

**2026-04-18 업데이트**: 모든 CHEEZE 서비스가 Docker Compose로 전환됨. 기존 systemd 서비스는 비활성화됨.

위치: `/var/www/home/deploy/docker/docker-compose.yml`

### 개요

| 서비스 | 포트 | 역할 | 상태 |
|--------|------|------|------|
| web | 127.0.0.1:3000 | Next.js 어드민 패널 | Docker Compose |
| portal-api | 127.0.0.1:11437 | 퍼블릭 파사드 API | Docker Compose |
| control-api | 127.0.0.1:11436 | 내부 제어 API | Docker Compose |
| ai-queue | 127.0.0.1:11435 | AI 요청 게이트웨이 | Docker Compose |
| nginx | 0.0.0.0:80/443 | 리버스 프록시 | Docker Compose (host network) |

### web (Next.js, 포트 3000)

**역할**: Cloudflare Access OTP 인증 후 접근 가능한 어드민 패널.

```yaml
web:
  build:
    context: ../../web
    dockerfile: Dockerfile
  container_name: cheeze-web
  ports:
    - "127.0.0.1:3000:3000"
  environment:
    - CONTROL_API_URL=${CONTROL_API_URL:-http://portal-api:11437}
    - ADMIN_CONTROL_TOKEN=${ADMIN_CONTROL_TOKEN}
    - PTERODACTYL_PANEL_URL=${PTERODACTYL_PANEL_URL:-https://panel.edelweiss0297.cloud}
    - PTERODACTYL_PANEL_INTERNAL_URL=${PTERODACTYL_PANEL_INTERNAL_URL:-http://pterodactyl-panel}
    - PTERODACTYL_APPLICATION_API_KEY=${PTERODACTYL_APPLICATION_API_KEY:-}
  depends_on:
    portal-api:
      condition: service_healthy
    pterodactyl-panel:
      condition: service_started
  restart: unless-stopped
  networks:
    - cheeze-net
```

**환경변수**: `/var/www/home/deploy/docker/.env`에서 주입됨. 주요 변수:
- `ADMIN_CONTROL_TOKEN`: Portal API 어드민 토큰 (token_id: `nextjs-admin`)
- `CONTROL_API_URL`: Docker 내부 네트워크에서 portal-api 컨테이너 이름으로 통신 (`http://portal-api:11437`)
- `PTERODACTYL_APPLICATION_API_KEY`: `/admin`의 Pterodactyl 탭에서 Application API 조회용

### portal-api (Python, 포트 11437)

**역할**: 외부(Discord 봇, 웹 프론트엔드)에서 접근하는 퍼블릭 파사드 API. 토큰 인증 후 control-api로 요청을 전달합니다.

```yaml
portal-api:
  build:
    context: ../../deploy/gateway
    dockerfile: ../../deploy/docker/portal-api/Dockerfile
  container_name: cheeze-portal-api
  ports:
    - "127.0.0.1:11437:11437"
  env_file:
    - .env
  environment:
    - CHEEZE_PORTAL_LISTEN_HOST=0.0.0.0
    - CHEEZE_PORTAL_LISTEN_PORT=11437
    - CHEEZE_INTERNAL_CONTROL_BASE=http://control-api:11436
  volumes:
    - /opt/cheeze-control:/opt/cheeze-control
  restart: unless-stopped
  networks:
    - cheeze-net
```

### control-api (Python, 포트 11436)

**역할**: 내부 전용 제어 API. WOL(Wake-on-LAN), 서비스 시작/중지, backend agent 통신을 담당합니다.

```yaml
control-api:
  build:
    context: ../../deploy/gateway
    dockerfile: ../../deploy/docker/control-api/Dockerfile
  container_name: cheeze-control-api
  ports:
    - "127.0.0.1:11436:11436"
  env_file:
    - .env
  environment:
    - CHEEZE_CONTROL_LISTEN_HOST=0.0.0.0
    - CHEEZE_CONTROL_LISTEN_PORT=11436
  restart: unless-stopped
  networks:
    - cheeze-net
```

> Backend IP, MAC, WOL 브로드캐스트 등 민감 설정은 `env_file: .env`로 주입됩니다 (`.env.example` 참고).

### ai-queue (Python, 포트 11435)

**역할**: AI 요청을 큐잉하여 Backend PC의 Ollama로 순차 전달하는 게이트웨이입니다.

```yaml
ai-queue:
  build:
    context: ../../deploy/gateway
    dockerfile: ../../deploy/docker/ai-queue/Dockerfile
  container_name: cheeze-ai-queue
  ports:
    - "127.0.0.1:11435:11435"
  env_file:
    - .env
  environment:
    - CHEEZE_AI_LISTEN_HOST=0.0.0.0
    - CHEEZE_AI_LISTEN_PORT=11435
  restart: unless-stopped
  networks:
    - cheeze-net
```

### nginx (host network, 포트 80/443)

**역할**: 리버스 프록시, 정적 파일 서빙. host network 모드로 실행 (포트 바인딩 없음).

```yaml
nginx:
  image: nginx:alpine
  container_name: cheeze-nginx
  network_mode: host
  volumes:
    - ./nginx/conf.d:/etc/nginx/conf.d:ro
    - ./nginx/ssl:/etc/nginx/ssl:ro
  depends_on:
    - web
    - portal-api
    - control-api
    - ai-queue
  restart: unless-stopped
```

**특징**:
- `network_mode: host`: 포트 바인딩 대신 호스트 네트워크 직접 사용 (eth0).
- 정적 파일 마운트: `/var/www/home` (읽기 전용).
- Nginx 설정 마운트: `/var/www/home/deploy/docker/nginx/conf.d` → `/etc/nginx/conf.d` (읽기 전용).

### Volumes / Bind Mounts

```yaml
networks:
  cheeze-net:
    driver: bridge
```

`.env` 파일 위치: `/var/www/home/deploy/docker/.env`

> `portal-api`는 `/opt/cheeze-control:/opt/cheeze-control` 직접 바인드 마운트를 사용합니다. Proxmox LXC에서 Docker named volume `driver_opts` bind 방식은 사용하지 않습니다.

### 기존 systemd 서비스 상태

다음 서비스는 **비활성화됨**:
- `cheeze-portal-api.service`
- `cheeze-control-api.service`
- `cheeze-ai-queue.service`
- `cheeze-nextjs.service`

Discord 봇(`cheeze-discord-bot`)은 여전히 systemd로 실행됨 (Docker 미지원).

---

## 서비스 의존 관계

```
control-api       (11436, Docker)
        ↑
portal-api        (11437, Docker)
        ↑                    ↑
cheeze-discord-bot   web (3000, Docker)  ← Cloudflare Access 인증 후 접근
(systemd)

ai-queue          (11435, Docker)  ← 독립 실행

nginx             (80/443, host network, Docker)  ← 모든 HTTP(S) 트래픽 진입점
```

---

## GitHub Actions Runner

- **label**: `gateway`
- **역할**: Gateway LXC 내에서 실행되는 CI/CD 작업 처리 (웹사이트 배포 등)
- **설치 경로**: `/actions-runner/`

```bash
# 러너 서비스 상태 확인
systemctl status actions.runner.*
```

---

## 주요 운영 명령어

### Docker Compose 기본 명령어

```bash
# Compose 파일 경로 (편의상 alias 설정 권장)
COMPOSE_FILE="/var/www/home/deploy/docker/docker-compose.yml"

# 서비스 전체 상태 확인
docker compose -f $COMPOSE_FILE ps

# 모든 서비스 시작
docker compose -f $COMPOSE_FILE up -d

# 모든 서비스 중지
docker compose -f $COMPOSE_FILE down

# 모든 서비스 재시작
docker compose -f $COMPOSE_FILE restart

# 특정 서비스 재시작
docker compose -f $COMPOSE_FILE restart portal-api
docker compose -f $COMPOSE_FILE restart web
docker compose -f $COMPOSE_FILE restart nginx
```

### 로그 확인

```bash
# 모든 서비스 로그 (실시간)
docker compose -f $COMPOSE_FILE logs -f

# 특정 서비스 로그
docker compose -f $COMPOSE_FILE logs -f portal-api
docker compose -f $COMPOSE_FILE logs -f web
docker compose -f $COMPOSE_FILE logs -f nginx

# N줄 이전 로그 + 실시간
docker compose -f $COMPOSE_FILE logs -f --tail 50 control-api
```

### 코드 변경 후 배포

#### Python API 서비스 (control-api, portal-api, ai-queue)

```bash
# Git pull (소스 반영)
cd /var/www/home && git pull origin main

# 이미지 재빌드 및 컨테이너 재시작
cd /var/www/home/deploy/docker
docker compose build control-api && docker compose up -d control-api

# 또는
docker compose build portal-api && docker compose up -d portal-api
docker compose build ai-queue && docker compose up -d ai-queue
```

> Python 서비스는 `/opt/` 경로로 수동 cp 불필요. Docker build가 소스에서 직접 사용함.

#### Next.js 웹 (web)

```bash
# Git pull
cd /var/www/home && git pull origin main

# 이미지 재빌드 및 컨테이너 재시작
cd /var/www/home/deploy/docker
docker compose build web && docker compose up -d --no-deps web
```

> Docker build 단계에서 자동으로 `npm run build` 실행됨. 별도 npm build 불필요.

#### Nginx 설정 변경

```bash
# 설정 파일 편집
nano /var/www/home/deploy/docker/nginx/conf.d/default.conf

# 설정 테스트 및 재로드 (컨테이너 내)
docker compose -f /var/www/home/deploy/docker/docker-compose.yml exec nginx nginx -t
docker compose -f /var/www/home/deploy/docker/docker-compose.yml exec nginx nginx -s reload
```

### 감사 로그 확인

```bash
# Portal API 감사 로그 (Docker volume 내)
docker compose -f $COMPOSE_FILE exec portal-api tail -f /opt/cheeze-control/portal-control-audit.log

# 또는 호스트에서 직접
tail -f /opt/cheeze-control/portal-control-audit.log
```

### 기타 유틸리티

```bash
# Tailscale 상태 확인 (호스트)
tailscale status

# Discord 봇 상태 (여전히 systemd)
systemctl status cheeze-discord-bot

# Discord 봇 로그
journalctl -u cheeze-discord-bot -f

# Cloudflared 터널 상태
systemctl status cloudflared
journalctl -u cloudflared -f
```

### Alias 설정 (권장)

```bash
# ~/.bashrc 또는 ~/.bash_profile에 추가
alias compose-gateway='docker compose -f /var/www/home/deploy/docker/docker-compose.yml'

# 사용 예
compose-gateway ps
compose-gateway logs -f web
compose-gateway restart portal-api
```

### 최초 전환 명령

Gateway가 예전 systemd 기반 Python/Next.js 서비스를 아직 사용 중이라면, 최초 1회는 아래 스크립트로 Compose-only 상태로 전환한다.

```bash
cd /var/www/home/deploy/docker
bash ./migrate-gateway-to-compose.sh
```

스크립트가 수행하는 일:

- `cheeze-portal-api.service` stop/disable
- `cheeze-control-api.service` stop/disable
- `cheeze-ai-queue.service` stop/disable
- `cheeze-nextjs.service` stop/disable
- Compose 이미지 빌드
- `control-api`, `portal-api`, `ai-queue`, `web`, `nginx`, `pterodactyl-*` 기동

> `cloudflared`와 `cheeze-discord-bot`은 계속 systemd로 유지한다.

---

## 관련 문서

- [Proxmox 호스트](proxmox-host.md)
- [Cloud VM 상세](cloud-vm.md)
- [Backend PC 상세](backend-pc.md)
- [Tailscale VPN 구성](tailscale-vpn.md)
