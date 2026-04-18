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
| Nginx | — | 리버스 프록시, 정적 파일 서빙 |
| cloudflared | — | Cloudflare Tunnel 클라이언트 |
| Tailscale | — | VPN 클라이언트 |
| Python 3 | — | CHEEZE 서비스 런타임 |
| Node.js | v20 LTS | Next.js 웹 앱 런타임 |
| GitHub Actions Runner | — | self-hosted 러너 (label: `gateway`) |

---

## 파일 시스템 레이아웃

```
/var/www/home/                  # 메인 웹사이트 루트 (git repo)
  deploy/
    gateway/
      cheeze-control-api.py           # 소스 (cp → /opt/cheeze-control/ 필요)
      cheeze-portal-api.py            # 소스 (cp → /opt/cheeze-control/ 필요)
    orchestrator/
      service-registry.example.json   # 서비스 레지스트리 예시
  web/                                # Next.js 어드민 패널
    .env.local                        # ADMIN_CONTROL_TOKEN 등 시크릿 (git 제외)
    .next/                            # 빌드 산출물 (npm run build 후 생성)

/opt/cheeze-control/            # cheeze-control-api, cheeze-portal-api
  cheeze-control-api.py
  cheeze-portal-api.py
  portal-control-tokens.json    # 포털 제어 토큰 목록 (시크릿)
  portal-control-audit.log      # 포털 감사 로그

/opt/cheeze-ai/                 # cheeze-ai-queue
  cheeze-ai-queue.py

/opt/cheeze-bot/                # cheeze-discord-bot
  cheeze-discord-bot.py

/actions-runner/                # GitHub Actions Runner (또는 지정 경로)
```

---

## Nginx 설정 구조

설정 파일 위치: `/etc/nginx/conf.d/`

| 파일 | 도메인 / 역할 |
|------|---------------|
| `home.conf` | 메인 사이트 (`edelweiss0297.cloud`) + Tailscale 전용 관리자 페이지 |
| `nextcloud.conf` | `cloud.edelweiss0297.cloud` → Cloud VM:80 리버스 프록시 |
| `paperless.conf` | `paperless.edelweiss0297.cloud` → Cloud VM:8010 리버스 프록시 |
| `archivebox.conf` | `archive.edelweiss0297.cloud` → Cloud VM:8020 리버스 프록시 |
| `ollama.conf` | `ollama.edelweiss0297.cloud` → Backend PC:11434 리버스 프록시 |

### home.conf 라우팅 (edelweiss0297.cloud)

| location | 대상 | 설명 |
|----------|------|------|
| `/` | `/var/www/home` 정적 파일 | 메인 홈페이지 |
| `/ai/` | `127.0.0.1:11435` | AI 큐 게이트웨이 |
| `/api/control/` | `127.0.0.1:11437` | Portal API (공개, rate limit 적용) |
| `/admin` | `127.0.0.1:3000` | Next.js 어드민 패널 (Cloudflare Access 보호) |
| `/_next/` | `127.0.0.1:3000` | Next.js 정적 자산 |
| `/api/admin/` | `127.0.0.1:3000` | Next.js 어드민 API (Cloudflare Access 보호) |
| `/admin.html` | 404 | 레거시 어드민 차단 |
| `/api/control/admin/` | 404 | 공개 사이트에서 어드민 API 직접 접근 차단 |

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

- **도구**: `cloudflared` (systemd 서비스로 실행)
- **역할**: 공인 IP 없이 Cloudflare 엣지 → gateway-lxc Nginx로 트래픽 전달
- **인증**: Cloudflare 대시보드에서 발급한 터널 토큰 (`<설정 필요>`)

```bash
# 터널 서비스 상태 확인
systemctl status cloudflared
```

---

## systemd 서비스 목록

### cheeze-control-api (포트 11436)

**역할**: 내부 전용 제어 API. WOL(Wake-on-LAN), 서비스 시작/중지, backend agent 통신을 담당합니다.

```ini
[Unit]
Description=CHEEZE generic control API
After=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/cheeze-control
Environment=CHEEZE_CONTROL_LISTEN_HOST=127.0.0.1
Environment=CHEEZE_CONTROL_LISTEN_PORT=11436
Environment=CHEEZE_BACKEND_AGENT_BASE=http://100.86.252.21:5010
Environment=CHEEZE_BACKEND_MAC=9C-6B-00-57-73-3A
Environment=CHEEZE_WOL_TARGET_IP=192.168.50.255
Environment=CHEEZE_WOL_TARGET_PORT=9
Environment=CHEEZE_SERVICE_REGISTRY=/var/www/home/deploy/orchestrator/service-registry.example.json
Environment=CHEEZE_BACKEND_WAKE_TIMEOUT=150
Environment=CHEEZE_BACKEND_WAKE_POLL=3
ExecStart=/usr/bin/python3 /opt/cheeze-control/cheeze-control-api.py
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
```

**주요 환경변수 설명**:

| 변수 | 설명 |
|------|------|
| `CHEEZE_BACKEND_AGENT_BASE` | Backend PC의 cheeze-backend-agent URL (Tailscale IP) |
| `CHEEZE_BACKEND_MAC` | WOL 대상 MAC 주소 |
| `CHEEZE_WOL_TARGET_IP` | WOL 브로드캐스트 주소 |
| `CHEEZE_BACKEND_WAKE_TIMEOUT` | Backend PC 기동 대기 최대 시간 (초) |
| `CHEEZE_BACKEND_WAKE_POLL` | 기동 확인 폴링 간격 (초) |
| `CHEEZE_SERVICE_REGISTRY` | 서비스 목록 JSON 파일 경로 |

---

### cheeze-portal-api (포트 11437)

**역할**: 외부(Discord 봇, 웹 프론트엔드)에서 접근하는 퍼블릭 파사드 API. 토큰 인증 후 cheeze-control-api로 요청을 전달합니다.

```ini
[Unit]
Description=CHEEZE public portal control facade
After=network-online.target cheeze-control-api.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/cheeze-control
Environment=CHEEZE_PORTAL_LISTEN_HOST=127.0.0.1
Environment=CHEEZE_PORTAL_LISTEN_PORT=11437
Environment=CHEEZE_INTERNAL_CONTROL_BASE=http://127.0.0.1:11436
Environment=CHEEZE_PORTAL_CONTROL_HEADER=X-Cheeze-Control-Token
Environment=CHEEZE_PORTAL_REQUEST_TIMEOUT=210
Environment=CHEEZE_PORTAL_TOKEN_REGISTRY=/opt/cheeze-control/portal-control-tokens.json
Environment=CHEEZE_PORTAL_AUDIT_LOG=/opt/cheeze-control/portal-control-audit.log
ExecStart=/usr/bin/python3 /opt/cheeze-control/cheeze-portal-api.py
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
```

**주요 환경변수 설명**:

| 변수 | 설명 |
|------|------|
| `CHEEZE_PORTAL_CONTROL_HEADER` | 인증 토큰을 전달하는 HTTP 헤더명 |
| `CHEEZE_PORTAL_REQUEST_TIMEOUT` | 업스트림 요청 타임아웃 (초, WOL 대기 포함) |
| `CHEEZE_PORTAL_TOKEN_REGISTRY` | 허용된 토큰 목록 JSON 파일 |
| `CHEEZE_PORTAL_AUDIT_LOG` | 감사 로그 파일 경로 |

---

### cheeze-nextjs (포트 3000)

**역할**: Next.js 기반 어드민 패널. Cloudflare Access OTP 인증 후 접근 가능.

```ini
[Unit]
Description=CHEEZE Next.js Web
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/home/web
ExecStart=/usr/bin/node node_modules/.bin/next start -p 3000
Restart=on-failure
EnvironmentFile=/var/www/home/web/.env.local

[Install]
WantedBy=multi-user.target
```

**환경변수 (`.env.local`):**

| 변수 | 설명 |
|------|------|
| `ADMIN_CONTROL_TOKEN` | Portal API 어드민 토큰 (token_id: `nextjs-admin`) |
| `CONTROL_API_URL` | Portal API 주소 (기본값: `http://127.0.0.1:11437`) |

**배포 절차:**

```bash
cd /var/www/home && git reset --hard origin/main
cd web && npm run build
systemctl restart cheeze-nextjs
```

> `npm run build` 없이 재시작하면 "Could not find a production build" 오류 발생.

---

### cheeze-ai-queue (포트 11435)

**역할**: AI 요청을 큐잉하여 Backend PC의 Ollama로 순차 전달하는 게이트웨이입니다.

```ini
[Unit]
Description=CHEEZE AI queue gateway
After=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/cheeze-ai
Environment=CHEEZE_AI_LISTEN_HOST=127.0.0.1
Environment=CHEEZE_AI_LISTEN_PORT=11435
Environment=CHEEZE_AI_UPSTREAM=http://100.86.252.21:11434
Environment=CHEEZE_AI_MAX_QUEUE=2
Environment=CHEEZE_AI_TIMEOUT=180
ExecStart=/usr/bin/python3 /opt/cheeze-ai/cheeze-ai-queue.py
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
```

**주요 환경변수 설명**:

| 변수 | 설명 |
|------|------|
| `CHEEZE_AI_UPSTREAM` | Backend PC Ollama 엔드포인트 (Tailscale IP) |
| `CHEEZE_AI_MAX_QUEUE` | 동시 처리 최대 큐 크기 |
| `CHEEZE_AI_TIMEOUT` | 요청 타임아웃 (초) |

---

### cheeze-discord-bot

**역할**: Discord 슬래시 커맨드를 통해 게임 서버(Minecraft 등)를 제어하는 봇. cheeze-portal-api를 통해 명령을 전달합니다.

```ini
[Unit]
Description=CHEEZE Discord game control bot
After=network-online.target cheeze-portal-api.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/cheeze-bot
Environment=DISCORD_APPLICATION_ID=1492519354129055939   # 공개 정보, 시크릿 아님
Environment=DISCORD_GUILD_ID=1492516751362097265         # 공개 정보, 시크릿 아님
Environment=DISCORD_ADMIN_ROLE_IDS=1492517995711561910   # 공개 정보, 시크릿 아님
Environment=DISCORD_MEMBER_ROLE_IDS=1492518234878906459  # 공개 정보, 시크릿 아님
Environment=CHEEZE_PORTAL_API_BASE=http://127.0.0.1:11437
Environment=CHEEZE_PORTAL_CONTROL_HEADER=X-Cheeze-Control-Token
Environment=CHEEZE_BOT_REQUEST_TIMEOUT=30
Environment=CHEEZE_MANAGED_GAME_SERVERS=minecraft-vanilla,minecraft-cobbleverse
ExecStart=/usr/bin/python3 /opt/cheeze-bot/cheeze-discord-bot.py
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
```

> `DISCORD_TOKEN` 등 시크릿 값은 서비스 파일 외부(예: `/opt/cheeze-bot/.env` 또는 별도 환경 파일)에서 관리합니다. 실제 값은 이 문서에 기재하지 않습니다.

**주요 환경변수 설명**:

| 변수 | 설명 |
|------|------|
| `DISCORD_APPLICATION_ID` | Discord 애플리케이션 ID |
| `DISCORD_GUILD_ID` | 대상 Discord 서버(길드) ID |
| `DISCORD_ADMIN_ROLE_IDS` | 관리자 권한 역할 ID |
| `DISCORD_MEMBER_ROLE_IDS` | 일반 멤버 권한 역할 ID |
| `CHEEZE_MANAGED_GAME_SERVERS` | 봇이 제어할 게임 서버 ID 목록 (쉼표 구분) |

---

## 서비스 의존 관계

```
cheeze-control-api  (11436)
        ↑
cheeze-portal-api   (11437)
        ↑                ↑
cheeze-discord-bot   cheeze-nextjs (3000)  ← Cloudflare Access 인증 후 접근

cheeze-ai-queue     (11435)  ← 독립 실행
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

```bash
# 서비스 전체 상태 확인
systemctl status cheeze-control-api cheeze-portal-api cheeze-ai-queue cheeze-discord-bot cheeze-nextjs

# 서비스 재시작
systemctl restart cheeze-control-api
systemctl restart cheeze-nextjs

# Next.js 재빌드 후 재시작 (코드 변경 시)
cd /var/www/home && git reset --hard origin/main && cd web && npm run build && systemctl restart cheeze-nextjs

# Python 서비스 파일 업데이트 (git pull 후 수동 cp 필요)
\cp /var/www/home/deploy/gateway/cheeze-control-api.py /opt/cheeze-control/ && systemctl restart cheeze-control-api
\cp /var/www/home/deploy/gateway/cheeze-portal-api.py /opt/cheeze-control/ && systemctl restart cheeze-portal-api

# Nginx 설정 테스트 및 재로드
nginx -t && systemctl reload nginx

# 감사 로그 확인
tail -f /opt/cheeze-control/portal-control-audit.log

# Tailscale 상태 확인
tailscale status
```

---

## 관련 문서

- [Proxmox 호스트](proxmox-host.md)
- [Cloud VM 상세](cloud-vm.md)
- [Backend PC 상세](backend-pc.md)
- [Tailscale VPN 구성](tailscale-vpn.md)
