# CHEEZE 문제 해결 가이드

> 최종 업데이트: 2026-04-18

## 목차

1. [서비스 상태 확인 명령어](#1-서비스-상태-확인-명령어)
2. [로그 확인 위치](#2-로그-확인-위치)
3. [일반적인 문제 및 해결 방법](#3-일반적인-문제-및-해결-방법)
   - [서비스 시작 실패](#31-서비스-시작-실패)
   - [WOL 미작동](#32-wol-미작동)
   - [토큰 인증 오류](#33-토큰-인증-오류)
   - [Cloudflare Tunnel 끊김](#34-cloudflare-tunnel-끊김)
   - [Nginx 502/504](#35-nginx-502504)
   - [백엔드 도달 불가](#36-백엔드-도달-불가)
   - [하이버네이션 미작동](#37-하이버네이션-미작동)
   - [Discord 봇 명령어 미응답](#38-discord-봇-명령어-미응답)
   - [Docker Compose 서비스 미실행](#39-docker-compose-서비스-미실행)
   - [Nginx upstream host not found (Docker DNS)](#310-nginx-upstream-host-not-found-docker-dns)
   - [cloudflared Docker 컨테이너 cert.pem 오류](#311-cloudflared-docker-컨테이너-certpem-오류)
   - [LXC Docker 포트 바인딩 실패](#312-lxc-docker-포트-바인딩-실패)
   - [Docker Named Volume LXC 마운트 실패 (모니터링 401)](#313-docker-named-volume-lxc-마운트-실패-모니터링-401)
   - [클라우드 VM 서브도메인이 메인 페이지로 리다이렉션](#314-클라우드-vm-서브도메인이-메인-페이지로-리다이렉션)

---

## 1. 서비스 상태 확인 명령어

### Gateway (Linux LXC) — Docker Compose 환경 (2026-04-18 이후)

```bash
# Docker Compose 서비스 전체 상태 확인
cd /opt/cheeze   # 또는 docker-compose.yml 위치
docker compose ps

# 개별 서비스 로그 실시간 확인
docker compose logs -f web
docker compose logs -f portal-api
docker compose logs -f control-api
docker compose logs -f ai-queue
docker compose logs -f nginx

# 포트 리스닝 확인 (host network nginx + loopback 서비스)
ss -tlnp | grep -E '80|3000|11435|11436|11437'

# Cloudflare Tunnel (네이티브 systemd 유지)
systemctl status cloudflared
```

### Homepc (Windows)

```powershell
# Backend Agent 프로세스 확인 (명령줄에 스크립트 경로 포함 여부로 판단)
Get-WmiObject Win32_Process -Filter "Name LIKE 'python%'" |
  Select-Object ProcessId, CommandLine |
  Where-Object { $_.CommandLine -like "*cheeze-backend-agent*" }

# 위 명령이 결과를 반환하지 않으면 에이전트가 실행 중이 아닌 것입니다.
# 단순 Python 프로세스 목록만 보려면:
Get-Process python*
```

### Cloudflare Tunnel

```bash
# Gateway에서
systemctl status cloudflared
cloudflared tunnel info
```

---

## 2. 로그 확인 위치

| 컴포넌트 | 로그 위치 | 명령어 |
|----------|-----------|--------|
| Portal API (Docker) | Docker stdout | `docker compose logs -f portal-api` |
| Control API (Docker) | Docker stdout | `docker compose logs -f control-api` |
| AI Queue (Docker) | Docker stdout | `docker compose logs -f ai-queue` |
| Next.js Web (Docker) | Docker stdout | `docker compose logs -f web` |
| Nginx (Docker) | Docker stdout | `docker compose logs -f nginx` |
| 감사 로그 | 직접 바인드 마운트 (`/opt/cheeze-control`) | `docker compose exec portal-api tail -f /opt/cheeze-control/portal-control-audit.log` |
| Cloudflare Tunnel | journald (네이티브) | `journalctl -u cloudflared -f` |
| Backend Agent | Windows 콘솔/파일 | 에이전트 로그 파일 또는 Admin 콘솔 탭 |
| GitHub Actions | GitHub 웹 UI | `https://github.com/<repo>/actions` |

---

## 3. 일반적인 문제 및 해결 방법

### 3.1 서비스 시작 실패

**증상:** servers.html에서 시작 버튼을 눌러도 서비스 상태가 변하지 않거나 오류 반환

**진단:**

```bash
# Portal API 응답 직접 확인
curl -s http://127.0.0.1:11437/api/control/status/<service_id>

# Control API 응답 확인
curl -s http://127.0.0.1:11436/status/<service_id>

# Portal API 로그에서 오류 확인
docker compose -f /var/www/home/deploy/docker/docker-compose.yml logs --since 5m portal-api

# 감사 로그에서 최근 실패 확인
docker compose -f /var/www/home/deploy/docker/docker-compose.yml exec portal-api tail -20 /opt/cheeze-control/portal-control-audit.log | python3 -m json.tool
```

**원인별 해결:**

| 원인 | 로그 내용 | 해결 |
|------|-----------|------|
| Backend Agent 미실행 | `upstream_error` 또는 연결 거부 | [3.6 백엔드 도달 불가](#36-백엔드-도달-불가) 참고 |
| 시간 제한 | `time_blocked` | 허용 시간대 확인 (minecraft-cobbleverse: 10:00~01:00 KST) |
| 토큰 권한 부족 | `scope_denied` | 토큰의 `allowed_actions`, `allowed_services` 확인 |
| Control API 미실행 | 502 또는 연결 거부 | `docker compose -f /var/www/home/deploy/docker/docker-compose.yml restart control-api` |

---

### 3.2 WOL 미작동

**증상:** 서비스 시작 요청 시 PC가 켜지지 않음

**진단:**

```bash
# Control API가 WOL 패킷을 전송하는지 로그 확인
journalctl -u cheeze-control-api --since "5 minutes ago" | grep -i wol

# WOL 수동 테스트 (Gateway에서)
wakeonlan <MAC_ADDRESS>
# 또는
python3 -c "
import socket, struct
mac = '<MAC_ADDRESS>'.replace('-', '').replace(':', '')
payload = bytes.fromhex('ff' * 6 + mac * 16)
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
s.sendto(payload, ('<BROADCAST_IP>', 9))
print('WOL 패킷 전송 완료')
"
```

**체크리스트:**

- [ ] PC BIOS/UEFI에서 Wake-on-LAN 활성화 여부
- [ ] Windows 전원 옵션 → 빠른 시작 비활성화 여부
- [ ] 네트워크 어댑터 설정 → WOL 허용 여부
- [ ] Control API 설정에 올바른 MAC 주소 등록 여부
- [ ] Gateway와 PC가 같은 서브넷 또는 브로드캐스트 도달 가능 여부
- [ ] PC가 완전 종료 상태인지 (슬립/하이버네이션은 별도 처리)

---

### 3.3 토큰 인증 오류

**증상:** 서비스 제어 시 `401 Unauthorized` 또는 `403 Forbidden` 반환

**진단:**

```bash
# 감사 로그에서 인증 실패 확인
grep '"result": "auth_failed"' /opt/cheeze-control/portal-control-audit.log | tail -5
grep '"result": "scope_denied"' /opt/cheeze-control/portal-control-audit.log | tail -5

# 토큰 레지스트리 파일 확인
cat /opt/cheeze-control/portal-control-tokens.json | python3 -m json.tool
```

**원인별 해결:**

| 오류 | 원인 | 해결 |
|------|------|------|
| `auth_failed` | 토큰값 불일치 또는 해시 오류 | 토큰 재생성 후 재등록 |
| `auth_failed` | 토큰 만료 (`expires_at` 경과) | 새 토큰 발급 |
| `auth_failed` | 토큰 폐기 (`revoked_at` 설정됨) | 새 토큰 발급 |
| `scope_denied` | `allowed_services` 불일치 | 레지스트리에서 허용 서비스 수정 |
| `scope_denied` | `allowed_actions` 불일치 | 레지스트리에서 허용 액션 수정 |
| 401 (헤더 없음) | `X-Cheeze-Control-Token` 헤더 누락 | 클라이언트 코드 확인 |

**토큰 해시 직접 검증:**

```bash
# 토큰값의 SHA-256 계산
echo -n "<token_value>" | sha256sum
# 출력값을 레지스트리의 token_hash와 비교
```

---

### 3.4 Cloudflare Tunnel 끊김

**증상:** 외부에서 사이트 접근 불가, 내부 Nginx는 정상

**진단:**

```bash
# Tunnel 서비스 상태
systemctl status cloudflared

# Tunnel 연결 로그
journalctl -u cloudflared -n 50

# Cloudflare 대시보드에서 Tunnel 상태 확인
# https://one.dash.cloudflare.com/ → Networks → Tunnels
```

**해결:**

```bash
# Tunnel 재시작
systemctl restart cloudflared

# 재시작 후 상태 확인
systemctl status cloudflared

# 자동 시작 설정 확인
systemctl is-enabled cloudflared
# disabled인 경우:
systemctl enable cloudflared
```

**지속적으로 끊기는 경우:**
- Cloudflare 대시보드에서 Tunnel 커넥터 로그 확인
- `cloudflared` 버전 업데이트: `cloudflared update`

---

### 3.5 Nginx 502/504

**증상:** 웹사이트 접근 시 502 Bad Gateway 또는 504 Gateway Timeout

**진단:**

```bash
# Nginx 에러 로그 확인
docker compose -f /var/www/home/deploy/docker/docker-compose.yml logs --tail 50 nginx

# 업스트림 서비스 상태 확인
docker compose -f /var/www/home/deploy/docker/docker-compose.yml ps portal-api
ss -tlnp | grep 11437

# Nginx 설정 유효성 검사
docker compose -f /var/www/home/deploy/docker/docker-compose.yml exec nginx nginx -t
```

**원인별 해결:**

| 오류 | 원인 | 해결 |
|------|------|------|
| 502 | Portal API 미실행 | `docker compose -f /var/www/home/deploy/docker/docker-compose.yml restart portal-api` |
| 502 | Portal API 포트 불일치 | Nginx conf에서 `proxy_pass` 포트 확인 |
| 504 | Control API 응답 지연 | Control API 로그 확인, Backend Agent 상태 확인 |
| 504 | AI 요청 타임아웃 | Ollama 서비스 상태 및 응답 시간 확인 |

```bash
# Portal API 직접 응답 테스트
curl -v http://127.0.0.1:11437/api/control/status/minecraft-cobbleverse
```

**중요:** `cheeze-portal-api.service`, `cheeze-control-api.service`, `cheeze-ai-queue.service`,
`cheeze-nextjs.service` 같은 레거시 systemd 서비스가 살아 있으면 Docker 포트 바인딩이 실패하거나
`web → portal-api` 내부 연결이 꼬인다. 첫 전환 후에는 아래 상태여야 한다.

```bash
systemctl status cheeze-portal-api cheeze-control-api cheeze-ai-queue cheeze-nextjs
# expected: inactive/disabled or unit not found

cd /var/www/home/deploy/docker
docker compose ps
```

---

### 3.6 백엔드 도달 불가

**증상:** Control API가 Backend Agent에 연결 실패, WOL 후에도 서비스 응답 없음

**진단:**

```bash
# Tailscale 연결 상태 확인 (Gateway에서)
tailscale status

# Homepc Tailscale IP로 핑 테스트
ping <homepc-tailscale-ip>

# Backend Agent 포트 확인
# (Tailscale IP로 접근)
curl http://<homepc-tailscale-ip>:<agent-port>/status
```

**체크리스트:**

- [ ] Windows PC 전원 켜짐 여부 (WOL 성공 여부)
- [ ] Tailscale 클라이언트 실행 중 여부 (Windows 트레이)
- [ ] Backend Agent 프로세스 실행 중 여부
- [ ] Windows 방화벽에서 해당 포트 허용 여부
- [ ] Backend Agent 설정 파일에 올바른 포트 설정 여부

**Backend Agent 수동 시작 (Windows):**

```powershell
Set-Location D:\Project
python deploy\backend\cheeze-backend-agent.py
```

---

### 3.7 하이버네이션 미작동

**증상:** 일정 시간 후 PC가 하이버네이션 상태로 전환되지 않음

**진단:**

```powershell
# Windows에서 하이버네이션 지원 확인
powercfg /a

# 현재 전원 계획 확인
powercfg /query SCHEME_CURRENT
```

**체크리스트:**

- [ ] Windows 하이버네이션 기능 활성화 여부: `powercfg /hibernate on`
- [ ] Backend Agent의 하이버네이션 설정값 확인
- [ ] 하이버네이션을 막는 프로그램(미디어 플레이어, 게임 등) 실행 여부
- [ ] Control API에 올바른 하이버네이션 명령 설정 여부

---

### 3.8 Discord 봇 명령어 미응답

**증상:** Discord에서 봇 명령어를 입력해도 반응 없음

**진단:**

```bash
# 봇 서비스 상태
systemctl status cheeze-discord-bot

# 봇 로그 확인
journalctl -u cheeze-discord-bot -n 100

# 봇 재시작
systemctl restart cheeze-discord-bot
```

**원인별 해결:**

| 원인 | 증상/로그 | 해결 |
|------|-----------|------|
| 봇 토큰 만료/무효 | `401 Unauthorized` 로그 | Discord Developer Portal에서 토큰 재발급 후 환경변수 업데이트 |
| Discord API 연결 오류 | WebSocket 오류 로그 | 봇 재시작, 인터넷 연결 확인 |
| 권한 부족 | 명령어는 수신되나 응답 없음 | Discord 서버에서 봇 역할 권한 확인 |
| 슬래시 명령어 미등록 | 명령어 자동완성 없음 | 봇 명령어 등록 API 재실행 |
| Portal API 연결 실패 | 봇 로그에 연결 오류 | Portal API 상태 확인 (`systemctl status cheeze-portal-api`) |

**봇 환경변수 확인:**

```bash
# 서비스 파일에서 환경변수 경로 확인
systemctl cat cheeze-discord-bot | grep EnvironmentFile

# 환경변수 파일 내용 확인 (시크릿 주의)
cat /opt/cheeze-bot/.env 2>/dev/null || cat /opt/cheeze-bot/cheeze-discord-bot.env 2>/dev/null
```

---

### 3.9 Docker Compose 서비스 미실행

**증상:** `docker compose ps`에서 서비스가 없거나 `Exited` 상태

#### 3.9.1 Docker 미설치

**증상:** `docker: command not found`

```bash
# Docker 설치 여부 확인
docker --version
docker compose version
```

**해결:** `deploy/docker/setup-docker-rocky.sh` 실행

```bash
# Rocky Linux 9에서 Docker CE 설치
bash /path/to/deploy/docker/setup-docker-rocky.sh

# 설치 후 서비스 시작
systemctl enable --now docker

# 확인
docker compose version
```

> **LXC 주의사항:** Proxmox LXC 컨테이너에서 Docker를 사용하려면 컨테이너 옵션에서 `nesting=1` 이 활성화되어 있어야 한다. 미활성화 시 `permission denied` 또는 `cgroup` 관련 오류 발생.

#### 3.9.2 포트 80 충돌 (네이티브 nginx 잔존)

**증상:** Docker nginx 컨테이너가 시작되지 않거나, 시작되어도 포트 80에 바인딩 실패

**원인:** Docker 도입 이전 네이티브 systemd nginx가 포트 80을 점유

```bash
# 포트 80 점유 프로세스 확인
ss -tlnp | grep ':80'

# 네이티브 nginx 종료 및 비활성화
systemctl stop nginx
systemctl disable nginx
```

#### 3.9.3 .env 파일 누락

**증상:** `docker compose up` 시 환경변수 관련 경고 또는 서비스 오류

```bash
# .env 파일 존재 확인
ls -la deploy/docker/.env

# 없으면 예제에서 복사 후 값 입력
cp deploy/docker/.env.example deploy/docker/.env
vi deploy/docker/.env
```

---

### 3.10 Nginx upstream host not found (Docker DNS)

**증상:** nginx 컨테이너 로그에 `host not found in upstream "portal-api"` 또는 `"web"` 오류

```
[emerg] host not found in upstream "portal-api" in /etc/nginx/conf.d/default.conf:XX
```

**원인:** nginx는 시작 시점에 upstream 호스트명을 DNS로 즉시 해석한다. Docker 브리지 네트워크에서 다른 서비스가 아직 준비되지 않았거나, nginx가 `network_mode: host`로 실행 중일 때 Docker 내부 DNS(`127.0.0.11`)를 사용할 수 없어 서비스 이름 해석 실패.

**해결 방안 A — nginx를 host network로 전환 (채택된 방식)**

`network_mode: host`로 nginx를 실행하고, upstream을 Docker 서비스 이름 대신 `127.0.0.1:PORT`로 변경:

```nginx
# default.conf — host network 환경에서의 upstream 지정
location /api/control/ {
    proxy_pass http://127.0.0.1:11437/;
}
location / {
    proxy_pass http://127.0.0.1:3000;
}
```

각 백엔드 서비스는 `docker-compose.yml`에서 loopback에 포트를 노출:

```yaml
portal-api:
  ports:
    - "127.0.0.1:11437:11437"
web:
  ports:
    - "127.0.0.1:3000:3000"
```

**해결 방안 B — resolver + 변수 패턴 (브리지 네트워크 유지 시)**

브리지 네트워크를 유지하면서 동적 DNS 해석이 필요한 경우:

```nginx
resolver 127.0.0.11 valid=10s;
location /api/control/ {
    set $upstream http://portal-api:11437;
    proxy_pass $upstream/;
}
```

> **참고:** 현재 프로덕션은 방안 A(host network)를 사용한다. LXC에서 Docker iptables 포트 바인딩이 불안정하여 host network가 더 안정적이었다.

---

### 3.11 cloudflared Docker 컨테이너 cert.pem 오류

**증상:** cloudflared Docker 컨테이너가 시작되지 않거나 다음 오류 발생

```
failed to load tunnel credentials: stat /root/.cloudflared/<UUID>.json: no such file or directory
```

또는 터널 이름으로 실행 시:

```
You need to authenticate: run cloudflared login
```

**원인:** CHEEZE Gateway는 `cert.pem` 기반 인증 없이 credentials JSON 파일 방식으로 터널을 운영한다. Docker 공식 cloudflared 이미지는 `TUNNEL_TOKEN` 환경변수 방식을 주로 지원하며, credentials 파일 마운트 구성이 복잡하다.

**해결: cloudflared를 네이티브 systemd로 유지**

Docker Compose에서 cloudflared 서비스를 제거하고, 기존 네이티브 systemd 서비스를 그대로 사용한다.

```bash
# 네이티브 cloudflared 상태 확인
systemctl status cloudflared

# 설정 파일 확인
cat /etc/cloudflared/config.yml
# ingress: localhost:80 (Docker nginx host network로 전달)

# 재시작
systemctl restart cloudflared
```

**현재 아키텍처:**
```
[Cloudflare] → cloudflared (네이티브 systemd) → localhost:80 → nginx (Docker, host network) → 백엔드 서비스
```

> **왜 Docker로 전환하지 않는가:** credentials JSON 파일 방식은 터널 이름 → cert.pem 의존성이 있어 Docker 환경에서 설정이 복잡하다. UUID 직접 지정도 cert.pem 없이는 동작하지 않았다. 네이티브 systemd 방식이 이미 안정적으로 운영 중이므로 변경 이익이 없다.

---

### 3.12 LXC Docker 포트 바인딩 실패

**증상:** Docker 서비스가 Running 상태임에도 포트에 접근 불가, 또는 Cloudflare Tunnel에서 `Error 1033` 반환

```
# curl localhost:80
curl: (7) Failed to connect to localhost port 80: Connection refused
```

**원인:** Proxmox LXC 컨테이너(nesting=1)에서 Docker는 iptables DNAT 규칙으로 포트 포워딩을 구현한다. LXC 환경에서는 iptables 규칙이 호스트(LXC 컨테이너 자체)에 적용되지 않아 Docker가 노출한 포트에 같은 호스트에서 접근해도 실패할 수 있다.

**해결: nginx를 `network_mode: host`로 실행**

```yaml
# docker-compose.yml
nginx:
  image: nginx:alpine
  network_mode: host          # iptables 우회, 호스트 네트워크 직접 사용
  volumes:
    - ./nginx/conf.d:/etc/nginx/conf.d:ro
```

- nginx가 호스트 네트워크를 직접 사용하므로 포트 80이 LXC 컨테이너의 실제 인터페이스에 바인딩됨
- cloudflared(네이티브 systemd)가 `localhost:80`으로 정상 접근 가능
- 다른 백엔드 서비스는 `127.0.0.1:PORT:PORT` loopback 노출로 nginx에서 접근

**진단 흐름:**

```bash
# 1. Docker 서비스 상태 확인
docker compose ps

# 2. 실제 포트 바인딩 확인 (host network nginx는 ss에서 직접 보임)
ss -tlnp | grep ':80'

# 3. localhost 직접 접근 테스트
curl -v http://localhost:80

# 4. cloudflared 로그에서 연결 오류 확인
journalctl -u cloudflared -n 30

# 5. Cloudflare 대시보드 Tunnel 상태 확인
# Error 1033 = cloudflared가 ingress 대상(localhost:80)에 연결 불가
```

**Error 1033 체크리스트:**

- [ ] `ss -tlnp | grep ':80'` 결과에 nginx 프로세스 확인
- [ ] `docker compose ps`에서 nginx 컨테이너 `Running` 상태 확인
- [ ] nginx 컨테이너가 `network_mode: host`로 설정되어 있는지 확인
- [ ] cloudflared `config.yml`의 ingress가 `http://localhost:80`으로 설정되어 있는지 확인
- [ ] `systemctl status cloudflared` 에서 에러 없이 실행 중인지 확인

---

### 3.13 Docker Named Volume LXC 마운트 실패 (모니터링 401)

**증상:** 어드민 패널 모니터링 탭에서 `/admin/system/resources` 호출 시 `401 Unauthorized` 반환. 호스트에서 직접 curl 테스트 시 토큰은 올바르나 `{"error": "invalid token"}` 반환.

**원인 (2계층):**

**① `CHEEZE_PORTAL_CONTROL_TOKEN` 미설정**

Portal API의 어드민 토큰 인증은 두 경로를 순서대로 시도합니다:
1. `CHEEZE_PORTAL_CONTROL_TOKEN` 환경변수 직접 비교 (레거시 우선)
2. `/opt/cheeze-control/portal-control-tokens.json` SHA-256 해시 조회

`.env`에 `CHEEZE_PORTAL_CONTROL_TOKEN`이 없으면 ①이 스킵되고, ②로 넘어갑니다. 그런데 아래 ②번 문제로 인해 레지스트리 파일도 접근 불가하여 401 발생.

**② Proxmox LXC에서 Docker Named Volume `driver_opts` 바인드 마운트 미작동**

```yaml
# 이전 구성 — LXC에서 동작 안 함
volumes:
  portal-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /opt/cheeze-control
```

Proxmox LXC(nesting=1) 환경에서 `driver_opts`로 선언한 named volume은 호스트 경로를 마운트하지 않고 **빈 볼륨**을 생성합니다. 호스트에 `/opt/cheeze-control/portal-control-tokens.json`이 존재해도 컨테이너 내부에서 `/opt/cheeze-control/`은 비어 있음.

**확인 방법:**

```bash
# 컨테이너 내부 마운트 확인
docker exec cheeze-portal-api ls -la /opt/cheeze-control/
# 출력이 . .. 만 있으면 named volume이 빈 상태

# 호스트 실제 파일 확인
ls -la /opt/cheeze-control/
# portal-control-tokens.json 등 파일이 있으면 마운트 실패 확인
```

**해결 (두 가지 모두 적용):**

**즉각 조치 (서버 .env 수정):**

```bash
# /var/www/home/deploy/docker/.env 에 추가
CHEEZE_PORTAL_CONTROL_TOKEN=<raw_token_value>
docker compose up -d portal-api
```

레거시 직접 비교 경로로 인증이 통과되어 즉시 복구 가능.

**근본 수정 (docker-compose.yml — 직접 바인드 마운트로 변경):**

```yaml
# 수정 후 — 직접 바인드 마운트 (LXC 호환)
portal-api:
  volumes:
    - /opt/cheeze-control:/opt/cheeze-control

# volumes: 섹션에서 portal-data named volume 정의 삭제
```

직접 바인드 마운트는 LXC에서 정상 동작하며, 레지스트리 파일과 감사 로그 모두 컨테이너에서 접근 가능.

**기존 named volume 정리 절차:**

```bash
# 1. 실행 중인 컨테이너 중지 (volume이 사용 중이면 rm 불가)
docker compose down

# 2. named volume 삭제
docker volume rm docker_portal-data

# 3. git pull (수정된 docker-compose.yml 반영)
git pull origin main

# 4. 서비스 재시작
docker compose up -d portal-api

# 5. 마운트 확인
docker exec cheeze-portal-api ls -la /opt/cheeze-control/
# portal-control-tokens.json 등 파일이 보이면 성공
```

> **LXC 주의사항:** Proxmox LXC(nesting=1) 환경에서 Docker named volume의 `driver_opts: type: none, o: bind`는 동작하지 않습니다. 호스트 경로 마운트가 필요할 때는 반드시 서비스 `volumes:` 아래에 직접 바인드 마운트(`/host/path:/container/path`)를 사용하세요.

---

### 3.14 클라우드 VM 서브도메인이 메인 페이지로 리다이렉션

**증상:** `cloud.edelweiss0297.cloud`, `paperless.edelweiss0297.cloud`, `archive.edelweiss0297.cloud` 접속 시 해당 서비스 로그인 화면 대신 Next.js 메인 페이지로 리다이렉션됨. 캐시 퍼지나 강제 새로고침으로도 해결되지 않음.

**근본 원인: cloudflared의 IPv6 루프백 + nginx 리스너 불일치**

cloudflared는 Linux에서 `localhost`를 `::1`(IPv6 루프백)으로 해석하여 nginx에 연결한다. 해당 server 블록에 `listen [::]:80`이 없으면 IPv6 요청이 `[::]:80 default_server`(Next.js 블록)로 폴백된다.

**진단:**

```bash
# 1. nginx 로그에서 소스 IP 확인
docker logs cheeze-nginx | tail -20
# cloudflared 요청은 모두 ::1 (IPv6)에서 온다

# 2. IPv6로 직접 요청 테스트
curl -v --resolve cloud.edelweiss0297.cloud:80:[::1] http://cloud.edelweiss0297.cloud/
# Next.js 응답이 오면 해당 server 블록에 listen [::]:80 없음

# 3. nginx 설정에서 cloud 블록의 listen 지시어 확인
docker exec cheeze-nginx nginx -T | grep -A5 "server_name cloud\."
```

**해결:**

해당 server 블록에 `listen [::]:80;` 추가:

```nginx
server {
    listen 80;
    listen [::]:80;    # ← 이 줄이 없으면 cloudflared 요청이 폴백됨
    server_name cloud.edelweiss0297.cloud;
    ...
}
```

`paperless`, `archive` 블록도 동일하게 적용. 수정 후 nginx 리로드:

```bash
docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload
```

**배경:**

| 항목 | 내용 |
|------|------|
| 수정 커밋 | `914903b` |
| 영향 서비스 | cloud / paperless / archive 서브도메인 |
| 오인 가능한 원인 | Cloudflare DNS 오설정, cloudflared ingress 오설정, nginx upstream IP 오류 — 모두 정상이었음 |
| 실제 원인 | `listen [::]:80` 누락으로 IPv6 요청이 default_server(Next.js)로 폴백 |

> 참고: [nginx + cloudflared IPv6 라우팅 구성 참조](nginx-cloudflared-ipv6.md)
