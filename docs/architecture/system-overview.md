# 시스템 아키텍처 개요

> 최종 수정: 2026-04-17

## 1. 시스템 목적

본 시스템은 개인 홈랩(homelab) 인프라로, 단일 Mini PC 위에서 가상화(Proxmox VE)를 통해 여러 서비스를 운영한다. 주요 목적은 다음과 같다.

- 개인 파일 클라우드, 문서 관리, 아카이브 서비스 자가 호스팅
- Minecraft 게임 서버 운영 (온디맨드 시작/종료 포함)
- AI(Ollama) API 공개 엔드포인트 제공
- Discord 봇을 통한 원격 서비스 제어
- Cloudflare Tunnel 기반 외부 공개, Tailscale 기반 관리자 전용 접근

---

## 2. 물리 장비 구성

| 장비 | 역할 | OS | LAN IP | Tailscale IP |
|------|------|----|--------|--------------|
| Mini PC | Proxmox VE 호스트 | Proxmox VE | 192.168.50.x (호스트) | — |
| Gateway LXC (CT200) | 퍼블릭 진입점, 리버스 프록시, API 서비스 | Rocky Linux 9.4 | 192.168.50.196 | 100.75.209.83 |
| Cloud LXC (구 VMID 100) | 자가 호스팅 앱 (Nextcloud, Paperless, ArchiveBox) | Rocky Linux | 10.0.0.10 (NAT, vmbr1) | — |
| Main PC (homepc) | Minecraft 서버, Ollama AI | Windows 11 Home | 192.168.50.85 | 100.86.252.21 |

### 가상화 네트워크 브리지

| 브리지 | 대역 | 용도 |
|--------|------|------|
| vmbr0 | 192.168.50.x | 외부 LAN (가정용 공유기) |
| vmbr1 | 10.0.0.x | 내부 NAT (Cloud LXC 전용) |

---

## 3. 소프트웨어 스택 요약

### Gateway LXC (CT200)

| 컴포넌트 | 타입 | 주소 | 역할 |
|----------|------|------|------|
| Nginx | 리버스 프록시 | :80 | 모든 인바운드 라우팅 |
| cheeze-portal-api | Python 서비스 | 127.0.0.1:11437 | 공개 파사드, 토큰 인증 |
| cheeze-control-api | Python 서비스 | 127.0.0.1:11436 | 내부 제어, WOL 발송 |
| cheeze-ai-queue | Python 서비스 | 127.0.0.1:11435 | AI 요청 큐잉/프록시 |
| cheeze-discord-bot | Python 서비스 | (outbound) | Discord 슬래시 커맨드 처리 |
| Cloudflare Tunnel | cloudflared | (outbound) | 외부 트래픽 수신 |
| Tailscale | VPN 클라이언트 | 100.75.209.83 | 관리자 접근, 내부 통신 |

### Cloud LXC

| 컴포넌트 | 포트 | 역할 |
|----------|------|------|
| Nextcloud | 80 | 개인 파일 클라우드 |
| Nextcloud Admin | 5000 | Nextcloud 관리자 인터페이스 |
| Paperless-ngx | 8010 | 문서 관리 시스템 |
| ArchiveBox | 8020 | 웹 아카이브 |
| cheeze-backend-agent | 5010 | 제어 명령 수신 에이전트 |

### Main PC (homepc)

| 컴포넌트 | 포트 | 역할 |
|----------|------|------|
| Ollama | 11434 | LLM 추론 서버 |
| Minecraft Vanilla | 25565 | 바닐라 게임 서버 |
| Minecraft Cobbleverse | 25566 | 모드팩 게임 서버 |
| cheeze-backend-agent | 5010 | 제어 명령 수신 에이전트 |
| RCON (Vanilla) | 25575 | Minecraft 원격 제어 |
| RCON (Cobbleverse) | 25576 | Minecraft 원격 제어 |

---

## 4. ASCII 아키텍처 다이어그램

```
인터넷
  │
  │  HTTPS (Cloudflare Edge에서 TLS 종단)
  ▼
┌─────────────────────┐
│  Cloudflare Tunnel  │  edelweiss0297.cloud 및 서브도메인
│  (nextcloud-tunnel) │
└──────────┬──────────┘
           │ HTTP (터널)
           ▼
┌──────────────────────────────────────────────────────┐
│  Gateway LXC  (CT200)  192.168.50.196 / 100.75.209.83│
│                                                      │
│  ┌─────────────────────────────────────────────┐     │
│  │              Nginx (:80)                    │     │
│  │  edelweiss0297.cloud  /         → 정적파일  │     │
│  │                       /ai/      → :11435    │     │
│  │                       /api/control/ → :11437│     │
│  │  cloud.*              /         → 10.0.0.10 │     │
│  │  paperless.*          /         → 10.0.0.10:8010│ │
│  │  archive.*            /         → 10.0.0.10:8020│ │
│  │  ollama.*             /         → 100.86.252.21:11434│
│  │  100.75.209.83        / → admin.html (정적)  │     │
│  │                       /api/control/ → :11437 │     │
│  └─────────────────────────────────────────────┘     │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │portal-api    │  │control-api   │  │ai-queue   │  │
│  │:11437        │→ │:11436        │  │:11435     │  │
│  └──────────────┘  └──────┬───────┘  └─────┬─────┘  │
│                           │                │        │
│  ┌─────────────┐          │ Tailscale      │ Tailscale│
│  │discord-bot  │→ :11437  │                │        │
│  └─────────────┘          │                │        │
└──────────────────────────┬┴────────────────┴────────┘
                           │ Tailscale VPN (100.86.252.21)
                           ▼
┌──────────────────────────────────────────────────────┐
│  Main PC (homepc)  192.168.50.85 / 100.86.252.21     │
│                                                      │
│  ┌───────────────────┐  ┌──────────────────────────┐ │
│  │ cheeze-backend    │  │  Ollama (:11434)          │ │
│  │ agent (:5010)     │  └──────────────────────────┘ │
│  └────────┬──────────┘                               │
│           │ RCON                                     │
│  ┌────────▼──────────────────────────────────────┐   │
│  │  Minecraft Vanilla (:25565, RCON :25575)      │   │
│  │  Minecraft Cobbleverse (:25566, RCON :25576)  │   │
│  └───────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
           ▲
           │ 포트포워딩 (공유기 NAT)
           │ 25565, 25566
           │
      게임 클라이언트 (인터넷)

┌──────────────────────────────────────────────────────┐
│  Cloud LXC  10.0.0.10 (vmbr1 NAT)                   │
│                                                      │
│  Nextcloud (:80)   Paperless (:8010)  Archive (:8020)│
│  cheeze-backend-agent (:5010)                        │
└──────────────────────────────────────────────────────┘
```

---

## 5. 구성 요소 간 관계 요약

### 접근 경로

| 출발 | 대상 | 경로 | 인증 |
|------|------|------|------|
| 외부 사용자 | 홈페이지, Nextcloud 등 | Cloudflare Tunnel → Nginx | Cloudflare Edge TLS |
| 외부 사용자 | AI API (`/ai/`) | Cloudflare Tunnel → Nginx → ai-queue | Bearer 토큰 |
| 외부 사용자 | 제어 API (`/api/control/`) | Cloudflare Tunnel → Nginx → portal-api | Bearer 토큰, POST 요청에 대해 5r/m 제한 |
| 관리자 | 어드민 UI | Tailscale → Nginx (100.75.209.83) → portal-api | Tailscale 인증 |
| 게임 플레이어 | Minecraft | 공유기 포트포워딩 → homepc | 게임 자체 인증 |

### 서비스 제어 체인

```
Discord 명령
    → discord-bot
    → portal-api (:11437, X-Cheeze-Internal-Token)
    → control-api (:11436)
    → backend-agent (Tailscale :5010)
    → Minecraft RCON / 시스템 명령
```

### AI 요청 체인

```
외부 클라이언트
    → Nginx /ai/
    → ai-queue (:11435)
    → Ollama (Tailscale 100.86.252.21:11434)
```

### WOL (Wake-on-LAN) 체인

```
control-api (:11436)
    → WOL 매직 패킷 → homepc MAC (LAN 브로드캐스트)
    → homepc 부팅 확인 (Tailscale ping)
    → backend-agent (:5010) 준비 확인
```

---

## 6. 보안 설계 원칙

- **외부 접근**: Cloudflare Tunnel 단일 진입점, origin 서버 직접 노출 없음
- **관리자 분리**: 어드민 인터페이스는 Tailscale IP(100.75.209.83)에서만 접근 가능; 공개 도메인에서는 404 반환
- **내부 통신**: portal-api ↔ control-api 구간 `X-Cheeze-Internal-Token` 헤더 인증
- **rate limiting**: 공개 제어 API `/api/control/` POST 요청에 대해 5r/m 제한
- **NAT 격리**: Cloud LXC는 vmbr1(10.0.0.x) 내부망에만 존재, 직접 외부 노출 없음
