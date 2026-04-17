# 네트워크 토폴로지

> 최종 수정: 2026-04-17

## 1. 네트워크 세그먼트

| 세그먼트 | 대역 | 인터페이스/수단 | 용도 |
|----------|------|-----------------|------|
| 가정용 LAN | 192.168.50.0/24 | vmbr0 (Proxmox 브리지) | Mini PC, Gateway LXC, homepc 간 물리 네트워크 |
| 내부 NAT | 10.0.0.0/24 | vmbr1 (Proxmox 내부 브리지) | Cloud LXC 전용, 외부 노출 없음 |
| Tailscale VPN | 100.64.0.0/10 (CGNAT) | tailscale0 | Gateway LXC ↔ homepc 암호화 터널 |
| Cloudflare Tunnel | — | cloudflared (outbound) | 인터넷 → Gateway LXC 진입점 |

---

## 2. IP 주소 할당표

| 장비 / 컴포넌트 | LAN IP | Tailscale IP | NAT IP | MAC 주소 | 비고 |
|----------------|--------|--------------|--------|----------|------|
| Mini PC (Proxmox 호스트) | 192.168.50.x | — | — | — | 호스트 관리 전용 |
| Gateway LXC (CT200) | 192.168.50.196 | 100.75.209.83 | — | — | 외부 진입점 |
| Cloud LXC | — | — | 10.0.0.10 | — | vmbr1 NAT, 외부 비노출 |
| Main PC (homepc) | 192.168.50.85 | 100.86.252.21 | — | `9C-6B-00-57-73-3A` | Minecraft, Ollama 호스트 |

---

## 3. 포트 사용 현황표

### Gateway LXC (192.168.50.196 / 100.75.209.83)

| 포트 | 프로토콜 | 서비스 | 바인딩 | 접근 범위 |
|------|----------|--------|--------|-----------|
| 80 | TCP | Nginx | 0.0.0.0 | Cloudflare Tunnel (인바운드), Tailscale |
| 11435 | TCP | cheeze-ai-queue | 127.0.0.1 | localhost only |
| 11436 | TCP | cheeze-control-api | 127.0.0.1 | localhost only |
| 11437 | TCP | cheeze-portal-api | 127.0.0.1 | localhost only |

### Cloud LXC (10.0.0.10)

| 포트 | 프로토콜 | 서비스 | 접근 범위 |
|------|----------|--------|-----------|
| 80 | TCP | Nextcloud | vmbr1 NAT (Gateway LXC → 프록시) |
| 5010 | TCP | cheeze-backend-agent | vmbr1 NAT (Gateway LXC → 프록시) |
| 8010 | TCP | Paperless-ngx | vmbr1 NAT |
| 8020 | TCP | ArchiveBox | vmbr1 NAT |

### Main PC / homepc (192.168.50.85 / 100.86.252.21)

| 포트 | 프로토콜 | 서비스 | 접근 범위 |
|------|----------|--------|-----------|
| 5010 | TCP | cheeze-backend-agent | Tailscale (Gateway LXC → homepc) |
| 11434 | TCP | Ollama | Tailscale (Gateway LXC → homepc) |
| 25565 | TCP | Minecraft Vanilla | 공유기 포트포워딩 (인터넷) |
| 25566 | TCP | Minecraft Cobbleverse | 공유기 포트포워딩 (인터넷) |
| 25575 | TCP | Minecraft Vanilla RCON | localhost (backend-agent → RCON) |
| 25576 | TCP | Minecraft Cobbleverse RCON | localhost (backend-agent → RCON) |

---

## 4. DNS / 도메인 매핑표

모든 도메인은 Cloudflare DNS에서 관리되며, Cloudflare Tunnel CNAME으로 연결된다.

| 도메인 | Nginx 업스트림 | 서비스 |
|--------|---------------|--------|
| `edelweiss0297.cloud` | /var/www/home (정적), :11435, :11437 | 홈페이지, AI API, 제어 API |
| `cloud.edelweiss0297.cloud` | 10.0.0.10:80 | Nextcloud |
| `paperless.edelweiss0297.cloud` | 10.0.0.10:8010 | Paperless-ngx |
| `archive.edelweiss0297.cloud` | 10.0.0.10:8020 | ArchiveBox |
| `ollama.edelweiss0297.cloud` | 100.86.252.21:11434 | Ollama API |

---

## 5. Cloudflare Tunnel 구성

터널명: `nextcloud-tunnel` (역사적 명명; 실제로는 모든 도메인 트래픽 처리)
자격증명: `/root/.cloudflared/<tunnel-uuid>.json`

```yaml
tunnel: nextcloud-tunnel
credentials-file: /root/.cloudflared/<tunnel-uuid>.json

ingress:
  - hostname: edelweiss0297.cloud
    service: http://localhost:80
  - hostname: cloud.edelweiss0297.cloud
    service: http://localhost:80
  - hostname: paperless.edelweiss0297.cloud
    service: http://localhost:80
  - hostname: archive.edelweiss0297.cloud
    service: http://localhost:80
  - hostname: ollama.edelweiss0297.cloud
    service: http://localhost:80
  - service: http_status:404
```

**동작 방식**: cloudflared가 Cloudflare 엣지에 아웃바운드 연결을 유지하며, 모든 인바운드 HTTP 요청을 Gateway LXC의 Nginx(:80)로 전달한다. TLS는 Cloudflare 엣지에서 종단(terminate)되며 origin 서버까지 HTTPS가 연장되지 않는다.

---

## 6. Nginx 라우팅 규칙 요약

### 공개 도메인 — `edelweiss0297.cloud`

| Location | 업스트림 | 비고 |
|----------|----------|------|
| `/` | /var/www/home (정적 파일) | — |
| `/ai/` | 127.0.0.1:11435 | cheeze-ai-queue |
| `/api/control/` | 127.0.0.1:11437 | cheeze-portal-api, POST 요청에 대해 5r/m 제한 |
| `/admin.html` | — | 404 반환 (차단) |
| `/api/control/admin/` | — | 404 반환 (차단) |

### Tailscale 전용 — `100.75.209.83`

| Location | 업스트림 | 비고 |
|----------|----------|------|
| `/` | admin.html (정적) | 어드민 UI |
| `/api/control/` | 127.0.0.1:11437 | cheeze-portal-api |
| `/api/control/admin/` | 127.0.0.1:11437/admin/ | 어드민 엔드포인트 |

### `cloud.edelweiss0297.cloud`

| Location | 업스트림 | 비고 |
|----------|----------|------|
| `/` | 10.0.0.10:80 | Nextcloud |
| `/admin` | — | deny all |
| `/a8x9k2-admin` | 10.0.0.10:5000 | Tailscale CIDR만 허용 |

### 기타 도메인

| 도메인 | Location | 업스트림 |
|--------|----------|----------|
| `paperless.edelweiss0297.cloud` | `/` | 10.0.0.10:8010 |
| `archive.edelweiss0297.cloud` | `/` | 10.0.0.10:8020 |
| `ollama.edelweiss0297.cloud` | `/` | 100.86.252.21:11434 |

---

## 7. 방화벽 / 접근 제어 요약

### 외부 접근 제어

| 벡터 | 제어 방식 | 비고 |
|------|-----------|------|
| 인터넷 → 서비스 | Cloudflare Tunnel (단일 진입점) | origin IP 비노출 |
| 인터넷 → Minecraft | 공유기 포트포워딩 (25565, 25566) | 직접 TCP, 게임 자체 인증 |
| 인터넷 → 관리자 | 불가 | Tailscale 필수 |

### 내부 접근 제어

| 출발 | 대상 | 허용 조건 |
|------|------|-----------|
| Gateway LXC | cheeze-portal-api | localhost only |
| Gateway LXC | cheeze-control-api | localhost only |
| Gateway LXC | cheeze-ai-queue | localhost only |
| Gateway LXC → homepc | backend-agent, Ollama | Tailscale VPN |
| Gateway LXC → Cloud LXC | Nextcloud, Paperless, Archive | vmbr1 NAT (10.0.0.10) |
| portal-api → control-api | 내부 제어 | `X-Cheeze-Internal-Token` 헤더 |
| 관리자 → 어드민 UI | Nginx 어드민 블록 | Tailscale IP(100.75.209.83) 접속 필수 |

### 공개 API rate limiting

```nginx
# /api/control/ 에 적용
limit_req_zone $binary_remote_addr zone=control:10m rate=5r/m;
limit_req zone=control burst=2 nodelay;
```

### Nextcloud 어드민 접근 제한

```nginx
location /a8x9k2-admin {
    allow 100.64.0.0/10;   # Tailscale CGNAT 대역
    deny all;
    proxy_pass http://10.0.0.10:5000;
}
```

---

## 8. 네트워크 토폴로지 다이어그램

```
인터넷
  │
  ├── HTTPS ──→ Cloudflare Edge (TLS 종단)
  │                   │
  │              Cloudflare Tunnel (outbound WSS)
  │                   │
  ├── TCP 25565/25566 ─────────────────────────────────┐
  │   (공유기 포트포워딩)                              │
  │                   │                               │
  ▼                   ▼                               ▼
가정용 공유기 (NAT, 192.168.50.0/24)            homepc
  │                   │                        192.168.50.85
  │                   │                        Tailscale: 100.86.252.21
  ├── 192.168.50.196 (Gateway LXC)                │
  │     Tailscale: 100.75.209.83                  │
  │     Nginx :80                                 │
  │     portal-api :11437 (127.0.0.1)             │
  │     control-api :11436 (127.0.0.1)            │
  │     ai-queue :11435 (127.0.0.1)               │
  │           │                                   │
  │           │ vmbr1 NAT (10.0.0.0/24)           │
  │           │                                   │
  │     ┌─────▼──────────────────┐                │
  │     │  Cloud LXC             │                │
  │     │  10.0.0.10             │                │
  │     │  Nextcloud :80         │                │
  │     │  Paperless :8010       │                │
  │     │  ArchiveBox :8020      │                │
  │     │  backend-agent :5010   │                │
  │     └────────────────────────┘                │
  │                                               │
  │     Tailscale VPN ════════════════════════════╝
  │     (100.75.209.83 ↔ 100.86.252.21)
  │
  └── 192.168.50.85 (homepc)
        Ollama :11434
        Minecraft Vanilla :25565 (RCON :25575)
        Minecraft Cobbleverse :25566 (RCON :25576)
        backend-agent :5010
```
