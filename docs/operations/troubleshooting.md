# CHEEZE 문제 해결 가이드

> 최종 업데이트: 2026-04-17

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

---

## 1. 서비스 상태 확인 명령어

### Gateway (Linux LXC)

```bash
# 모든 CHEEZE 서비스 상태 한번에 확인
systemctl status cheeze-portal-api cheeze-control-api cheeze-ai-queue cheeze-discord-bot

# Nginx 상태
systemctl status nginx

# 개별 서비스
systemctl status cheeze-portal-api   # 공개 API 파사드
systemctl status cheeze-control-api  # 내부 제어 API
systemctl status cheeze-ai-queue     # AI 큐 처리
systemctl status cheeze-discord-bot  # Discord 봇

# 포트 리스닝 확인
ss -tlnp | grep -E '11436|11437'
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
| Portal API | journald | `journalctl -u cheeze-portal-api -f` |
| Control API | journald | `journalctl -u cheeze-control-api -f` |
| AI Queue | journald | `journalctl -u cheeze-ai-queue -f` |
| Discord Bot | journald | `journalctl -u cheeze-discord-bot -f` |
| 감사 로그 | `/opt/cheeze-control/portal-control-audit.log` | `tail -f /opt/cheeze-control/portal-control-audit.log` |
| Nginx 접근 로그 | `/var/log/nginx/access.log` | `tail -f /var/log/nginx/access.log` |
| Nginx 에러 로그 | `/var/log/nginx/error.log` | `tail -f /var/log/nginx/error.log` |
| Cloudflare Tunnel | journald | `journalctl -u cloudflared -f` |
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
journalctl -u cheeze-portal-api --since "5 minutes ago"

# 감사 로그에서 최근 실패 확인
tail -20 /opt/cheeze-control/portal-control-audit.log | python3 -m json.tool
```

**원인별 해결:**

| 원인 | 로그 내용 | 해결 |
|------|-----------|------|
| Backend Agent 미실행 | `upstream_error` 또는 연결 거부 | [3.6 백엔드 도달 불가](#36-백엔드-도달-불가) 참고 |
| 시간 제한 | `time_blocked` | 허용 시간대 확인 (minecraft-cobbleverse: 10:00~01:00 KST) |
| 토큰 권한 부족 | `scope_denied` | 토큰의 `allowed_actions`, `allowed_services` 확인 |
| Control API 미실행 | 502 또는 연결 거부 | `systemctl restart cheeze-control-api` |

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
tail -50 /var/log/nginx/error.log

# 업스트림 서비스 상태 확인
systemctl status cheeze-portal-api
ss -tlnp | grep 11437

# Nginx 설정 유효성 검사
nginx -t
```

**원인별 해결:**

| 오류 | 원인 | 해결 |
|------|------|------|
| 502 | Portal API 미실행 | `systemctl restart cheeze-portal-api` |
| 502 | Portal API 포트 불일치 | Nginx conf에서 `proxy_pass` 포트 확인 |
| 504 | Control API 응답 지연 | Control API 로그 확인, Backend Agent 상태 확인 |
| 504 | AI 요청 타임아웃 | Ollama 서비스 상태 및 응답 시간 확인 |

```bash
# Portal API 직접 응답 테스트
curl -v http://127.0.0.1:11437/api/control/status/minecraft-cobbleverse
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
