# Tailscale VPN 구성

## 개요

Tailscale은 WireGuard 기반의 메시(Mesh) VPN으로, 공인 IP나 포트 포워딩 없이 노드 간 암호화 통신을 제공합니다.
이 인프라에서는 Gateway LXC ↔ Backend PC 간 내부 통신 및 관리자 페이지 접근 제어에 활용합니다.

---

## 네트워크 토폴로지

```
인터넷
  │
  ├── Cloudflare Tunnel
  │       └── Gateway LXC (192.168.50.196)
  │                │  Tailscale IP: 100.75.209.83
  │                │
  │                │ [Tailscale VPN: 100.64.0.0/10]
  │                │
  │           Backend PC (192.168.50.85)
  │           Tailscale IP: 100.86.252.21
  │
  └── 관리자 (Tailscale 클라이언트)
          └── Gateway LXC 관리 페이지 접근 (100.75.209.83)
```

---

## IP 할당표

| 노드 | 호스트명 | LAN IP | Tailscale IP |
|------|----------|--------|--------------|
| Gateway LXC (CT200) | `gateway-lxc` | 192.168.50.196 | 100.75.209.83 |
| Backend PC (homepc) | `homepc` (기본값) | 192.168.50.85 | 100.86.252.21 |
| 관리자 기기 | — | — | Tailscale 네트워크 내 임의 IP |

> Tailscale IP 대역: `100.64.0.0/10` (CGNAT 대역, Tailscale 표준)

---

## 각 노드 설정 방법

### Gateway LXC (Rocky Linux 9.4)

```bash
# 1. Tailscale 설치
curl -fsSL https://tailscale.com/install.sh | sh

# 2. systemd 서비스 활성화
systemctl enable --now tailscaled

# 3. VPN 네트워크 참여 (hostname 지정)
tailscale up --hostname=gateway-lxc

# 4. 인증 (브라우저 또는 auth key 사용)
# 터미널에 출력되는 URL로 인증하거나:
tailscale up --hostname=gateway-lxc --authkey=<설정 필요>

# 5. 상태 확인
tailscale status
tailscale ip
```

> **Privileged LXC 주의사항**: `/dev/tun` 디바이스 접근이 필요합니다. Proxmox LXC 설정에서 아래를 추가하세요:
> ```
> lxc.cgroup2.devices.allow: c 10:200 rwm
> lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file
> ```

### Backend PC (Windows 11)

```powershell
# 1. Tailscale Windows 클라이언트 설치
# https://tailscale.com/download/windows 에서 설치

# 2. 시스템 트레이에서 로그인 또는 CLI 사용
tailscale up

# 3. 상태 확인
tailscale status
tailscale ip
```

- Windows 서비스로 자동 등록되어 부팅 시 자동 시작됩니다.
- 하이버네이션 후 복귀 시 Tailscale이 자동으로 재연결됩니다.

### 관리자 기기 (선택사항)

```bash
# macOS / Linux
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up

# Windows: 위 Backend PC와 동일
```

---

## 용도별 사용

### 1. Backend PC 통신 (cheeze-control-api → cheeze-backend-agent)

Gateway LXC의 `cheeze-control-api`가 Backend PC의 `cheeze-backend-agent`에 접근할 때 Tailscale IP를 사용합니다.

```
Gateway LXC (100.75.209.83)
    → http://100.86.252.21:5010  (cheeze-backend-agent)
    → http://100.86.252.21:11434 (Ollama)
```

- LAN IP(192.168.50.x)가 아닌 Tailscale IP를 사용하는 이유: 암호화 보장, 네트워크 구성 변경에 독립적

### 2. 관리자 페이지 접근

Gateway LXC의 Nginx는 관리자 전용 경로를 Tailscale CIDR로만 제한합니다.

```nginx
# /etc/nginx/conf.d/home.conf 내 관리자 섹션 예시
location /admin {
    allow 100.64.0.0/10;   # Tailscale CGNAT 대역 전체 허용
    deny all;
    # ... proxy 설정
}
```

관리자는 Tailscale에 연결된 기기에서만 `/admin` 경로에 접근할 수 있습니다.

### 3. Nextcloud 관리자 접근

Nextcloud의 비공개 관리자 경로(`/a8x9k2-admin`)도 동일하게 Tailscale CIDR로 접근을 제한합니다.

```nginx
location /a8x9k2-admin {
    allow 100.64.0.0/10;
    deny all;
    proxy_pass http://10.0.0.10:5000;
}
```

---

## 보안 고려사항

### VPN 신뢰 기반 인증

| 항목 | 내용 |
|------|------|
| 인증 방식 | Tailscale 계정 인증 후 노드 승인 |
| 암호화 | WireGuard (ChaCha20, Poly1305) |
| 키 관리 | Tailscale이 자동 처리 (주기적 키 교체) |
| ACL | Tailscale 관리 콘솔에서 설정 가능 |

### 접근 제어 원칙

1. **내부 API는 Tailscale IP로만 노출**: `cheeze-backend-agent`는 `0.0.0.0:5010`으로 바인딩하되, 방화벽 또는 Windows Defender Firewall로 Tailscale 인터페이스만 허용
2. **관리자 UI는 Tailscale CIDR로만 허용**: Nginx `allow 100.64.0.0/10; deny all;`
3. **공개 API는 별도 인증**: cheeze-portal-api는 `X-Cheeze-Control-Token` 헤더 인증 사용

### Windows Firewall 설정 (Backend PC)

```powershell
# cheeze-backend-agent 포트를 Tailscale 인터페이스만 허용 (예시)
New-NetFirewallRule -DisplayName "cheeze-backend-agent (Tailscale only)" `
    -Direction Inbound -Protocol TCP -LocalPort 5010 `
    -RemoteAddress 100.64.0.0/10 -Action Allow

# Ollama 포트 동일 설정
New-NetFirewallRule -DisplayName "Ollama (Tailscale only)" `
    -Direction Inbound -Protocol TCP -LocalPort 11434 `
    -RemoteAddress 100.64.0.0/10 -Action Allow
```

---

## 문제 해결

### Tailscale 연결 확인

```bash
# Gateway LXC에서
tailscale ping homepc           # Backend PC에 ping
tailscale ping 100.86.252.21   # IP로 ping

# 전체 노드 상태
tailscale status
```

### 자주 발생하는 문제

| 증상 | 원인 | 해결 방법 |
|------|------|-----------|
| Backend PC에 연결 안 됨 | 하이버네이션 상태 | WOL 전송 후 재시도 |
| Tailscale 재인증 요구 | 세션 만료 | `tailscale up` 재실행 |
| LXC에서 TUN 오류 | Privileged 설정 미흡 | Proxmox LXC 설정에 `/dev/tun` 마운트 추가 |

---

## 관련 문서

- [Gateway LXC 상세](gateway-lxc.md)
- [Backend PC 상세](backend-pc.md)
- [Proxmox 호스트](proxmox-host.md)
- [Cloud VM 상세](cloud-vm.md)
