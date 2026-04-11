# Phase 2 Tailscale Implementation Guide

작성일: 2026-04-11
대상: `gateway-lxc (CT 200, Rocky Linux 9.4, privileged)` + `Windows 11 backend desktop`

## 1. 목표

이 문서는 현재 실환경 기준으로 `gateway-lxc` 와 Windows 백엔드 데스크톱을 Tailscale로 직접 연결하고, 향후 `Ollama` 를 `Nginx` 가 Tailscale IP로 reverse proxy 하도록 만드는 실행 절차서다.

현재 기준 경로:

`Internet -> Cloudflare -> Nginx LXC -> Tailscale 100.x -> Windows Desktop:11434`

## 2. 현재 확정 환경

- Proxmox VE: `9.1.1`
- Gateway CTID: `200`
- Gateway LXC 권한: `Privileged`
- Gateway LXC OS: `Rocky Linux 9.4`
- Gateway Nginx: `1.20.1`
- Windows: `Windows 11 Home 25H2`
- Windows Tailscale: `1.96.3`

중요:

- 현재는 `Privileged LXC` 이므로 바로 개통 작업을 진행한다.
- 장기 보안 개선은 별도 `Unprivileged LXC` 재구축으로 분리한다.

## 3. 작업 전 체크포인트

### 3.1 게이트웨이에서 확인

```bash
pct exec 200 -- bash -lc 'cat /etc/os-release'
pct exec 200 -- bash -lc 'nginx -v'
pct exec 200 -- bash -lc 'systemctl is-active nginx'
```

### 3.2 Windows에서 확인

PowerShell:

```powershell
$TS = "$env:ProgramFiles\Tailscale\tailscale.exe"
& $TS version
```

### 3.3 설계 원칙

- Windows는 `exit node` 를 사용하지 않는다.
- Windows는 `accept-routes=false` 로 유지한다.
- 초기에는 `accept-dns=false` 로 두고 개통 후 필요 시 MagicDNS를 검토한다.
- 우선 목표는 `gateway-lxc` 와 `Windows backend` 의 직접 연결이다.

## 4. Gateway LXC 에서 Tailscale 설치

현재 `gateway-lxc` 는 Rocky Linux 9.4 이므로 아래 순서로 진행한다.

```bash
pct exec 200 -- bash -lc 'curl -fsSL https://tailscale.com/install.sh | sh'
pct exec 200 -- bash -lc 'systemctl enable --now tailscaled'
pct exec 200 -- bash -lc 'systemctl status tailscaled --no-pager'
```

그 다음 Tailscale에 노드를 올린다.

```bash
pct exec 200 -- bash -lc "tailscale up --hostname=gateway-lxc --accept-routes=false"
```

출력되는 로그인 URL을 브라우저에서 열어 인증한다.

인증 후 확인:

```bash
pct exec 200 -- bash -lc 'tailscale version'
pct exec 200 -- bash -lc 'tailscale ip -4'
pct exec 200 -- bash -lc 'tailscale status'
```

예상 상태:

- `gateway-lxc` 에 `100.x.x.x` IPv4 할당
- 상태가 `online`

## 5. Windows 데스크톱에서 Tailscale 연결

Windows는 이미 Tailscale이 설치되어 있으므로 연결과 정책 고정만 진행한다.

PowerShell:

```powershell
$TS = "$env:ProgramFiles\Tailscale\tailscale.exe"

& $TS up --hostname backend-desktop
& $TS set --exit-node=
& $TS set --accept-routes=false
& $TS set --accept-dns=false

& $TS status
& $TS ip -4
```

운영 원칙:

- `Exit Node` 는 사용하지 않는다.
- `accept-routes=false` 로 split tunnel 성격을 유지한다.
- `accept-dns=false` 로 시작하면 Windows의 기존 DNS 경로를 덜 건드린다.

GUI로 확인할 점:

- 시스템 트레이 Tailscale 아이콘 로그인 완료
- `Exit node: None`
- `backend-desktop` 이름으로 등록 확인

## 6. 터널 개통 검증

먼저 양쪽 Tailscale IP를 확보한다.

게이트웨이:

```bash
pct exec 200 -- bash -lc 'tailscale ip -4'
```

Windows:

```powershell
$TS = "$env:ProgramFiles\Tailscale\tailscale.exe"
& $TS ip -4
```

예시:

- `gateway-lxc`: `100.70.10.20`
- `backend-desktop`: `100.90.40.50`

### 6.1 Tailscale 레벨 ping

게이트웨이에서 Windows로:

```bash
pct exec 200 -- bash -lc 'tailscale ping 100.90.40.50'
```

Windows에서 게이트웨이로:

```powershell
$TS = "$env:ProgramFiles\Tailscale\tailscale.exe"
& $TS ping 100.70.10.20
```

판독:

- `via <direct endpoint>` 이면 direct 연결
- `via DERP(...)` 이면 릴레이 경유
- DERP여도 기능상은 개통된 상태다

### 6.2 일반 ping

게이트웨이에서 Windows로:

```bash
pct exec 200 -- bash -lc 'ping -c 4 100.90.40.50'
```

Windows에서 게이트웨이로:

```powershell
ping -n 4 100.70.10.20
```

주의:

- `tailscale ping` 이 성공하고 일반 `ping` 만 실패하면 Windows 방화벽의 ICMP 차단 가능성이 높다.

필요 시 Windows에서 ICMP 허용:

```powershell
New-NetFirewallRule `
  -DisplayName "Allow ICMPv4 Echo Request" `
  -Direction Inbound `
  -Protocol ICMPv4 `
  -IcmpType 8 `
  -Action Allow
```

### 6.3 HTTP 레벨 사전 검증

Ollama를 붙이기 전에 TCP 레벨 도달성을 확인한다.

Windows에서 Ollama가 떠 있다는 전제 하에 게이트웨이에서:

```bash
pct exec 200 -- bash -lc 'curl -sS http://100.90.40.50:11434/api/tags'
```

정상이라면 JSON 응답이 돌아온다.

## 7. Windows에서 Ollama 준비

중요:

- Ollama가 `127.0.0.1:11434` 에만 바인딩되어 있으면 `gateway-lxc` 가 접근할 수 없다.
- 최소한 Tailscale IP에서 접근 가능하도록 리슨 정책과 방화벽을 조정해야 한다.

먼저 로컬 확인:

```powershell
netstat -ano | findstr 11434
curl http://127.0.0.1:11434/api/tags
```

그 다음 게이트웨이에서 접근을 허용한다.

예시 방화벽 규칙:

```powershell
New-NetFirewallRule `
  -DisplayName "Allow Ollama from Gateway Tailscale" `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort 11434 `
  -RemoteAddress 100.70.10.20
```

주의:

- 위 `RemoteAddress` 는 실제 `gateway-lxc` 의 Tailscale IP로 바꾼다.
- 이후 `ComfyUI`, `Open WebUI`, 게임 서버도 같은 방식으로 포트별 최소 허용 정책을 쓴다.

## 8. Nginx 프록시 기본 뼈대

권장 서브도메인:

- `ollama.edelweiss0297.cloud`

파일 예시:

`/etc/nginx/conf.d/ollama.conf`

```nginx
upstream ollama_backend {
    server 100.90.40.50:11434;
    keepalive 16;
}

server {
    listen 80;
    listen [::]:80;
    server_name ollama.edelweiss0297.cloud;

    client_max_body_size 100m;

    location / {
        proxy_pass http://ollama_backend;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header Connection "";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;

        proxy_connect_timeout 15s;
        proxy_send_timeout 3600s;
        proxy_read_timeout 3600s;

        proxy_buffering off;
        chunked_transfer_encoding on;
    }
}
```

실제 적용 순서:

```bash
pct exec 200 -- bash -lc 'nginx -t'
pct exec 200 -- bash -lc 'systemctl reload nginx'
```

적용 후 헤더 확인:

```bash
pct exec 200 -- bash -lc 'curl -I -H "Host: ollama.edelweiss0297.cloud" http://127.0.0.1'
```

## 9. Cloudflare 측 후속 반영

현재 구조가 기존처럼 `cloudflared -> nginx` 인 경우, AI 서비스도 같은 패턴으로 hostname만 추가하면 된다.

예상 반영 항목:

- DNS 또는 Tunnel public hostname 에 `ollama.edelweiss0297.cloud` 추가
- 최종 목적지는 계속 `gateway-lxc:80`

즉 Tailscale은 외부 공개용이 아니라 `gateway-lxc` 와 `Windows backend` 사이 내부 전달용이다.

## 10. 트러블슈팅 가이드

### 10.1 gateway-lxc 에서 `tailscale up` 실패

확인:

```bash
pct exec 200 -- bash -lc 'systemctl status tailscaled --no-pager'
pct exec 200 -- bash -lc 'journalctl -u tailscaled -n 100 --no-pager'
```

현재 CT 200은 privileged 이므로 `tun` 권한 문제는 우선순위가 낮다.

### 10.2 Windows와 `tailscale ping` 실패

확인:

```powershell
$TS = "$env:ProgramFiles\Tailscale\tailscale.exe"
& $TS status
& $TS netcheck
```

가능 원인:

- 로그인 미완료
- 노드가 offline
- 로컬 방화벽
- NAT 환경 문제로 direct 연결 실패

### 10.3 `tailscale ping` 은 되는데 일반 `ping` 이 실패

가장 흔한 원인:

- Windows ICMP 인바운드 차단

대응:

- ICMP 규칙 추가
- 또는 일반 ping 대신 `tailscale ping` 과 실제 서비스 포트 검증을 기준으로 판단

### 10.4 게이트웨이에서 `curl http://<desktop-ts-ip>:11434/api/tags` 실패

점검 순서:

1. Windows에서 Ollama 프로세스가 기동 중인지 확인
2. `11434` 가 실제로 열렸는지 확인
3. Windows 방화벽에서 TCP/11434 허용 여부 확인
4. Ollama가 loopback 전용 리슨인지 확인

### 10.5 Nginx `502 Bad Gateway`

가장 흔한 원인:

- upstream IP 오기입
- Windows 방화벽 차단
- Ollama 미기동
- Ollama가 외부에서 접근 불가한 바인딩 상태

검증:

```bash
pct exec 200 -- bash -lc 'curl -v http://100.90.40.50:11434/api/tags'
```

### 10.6 Windows 인터넷 경로가 이상해짐

확인:

```powershell
$TS = "$env:ProgramFiles\Tailscale\tailscale.exe"
& $TS status
```

반드시 확인할 것:

- `Exit Node` 미사용
- `accept-routes=false`

복구:

```powershell
$TS = "$env:ProgramFiles\Tailscale\tailscale.exe"
& $TS set --exit-node=
& $TS set --accept-routes=false
```

## 11. 권장 실행 순서

실제 작업은 아래 순서가 가장 안전하다.

1. `gateway-lxc` 에 Tailscale 설치 및 로그인
2. Windows 데스크톱 Tailscale 로그인
3. 양방향 `tailscale ping`
4. 양방향 일반 `ping`
5. Windows에서 Ollama 기동 및 `11434` 확인
6. 게이트웨이에서 `curl http://<desktop-ts-ip>:11434/api/tags`
7. Nginx 프록시 추가
8. Cloudflare hostname 연결
9. 외부 도메인 검증

## 12. 차후 Unprivileged 전환 부록

장기적으로 `gateway-lxc` 를 `Unprivileged LXC` 로 재구축할 경우, Tailscale 관련 핵심 차이는 `tun` 장치 허용 설정이다.

Proxmox host:

```bash
pct stop 200

echo 'lxc.cgroup2.devices.allow: c 10:200 rwm' >> /etc/pve/lxc/200.conf
echo 'lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file' >> /etc/pve/lxc/200.conf

modprobe tun
pct start 200
```

필요 시:

```bash
chown 100000:100000 /dev/net/tun
```

중요:

- 기존 privileged CT를 그대로 토글 전환하기보다 새 unprivileged CT를 만들고 서비스만 이관하는 편이 안전하다.
- 이유는 UID/GID 매핑과 파일 권한 꼬임을 피하기 위해서다.

