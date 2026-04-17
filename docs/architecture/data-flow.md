# 데이터 및 트래픽 흐름

> 최종 수정: 2026-04-17

## 1. 외부 웹 접근 흐름

### 1-1. 일반 사용자 → 홈페이지 (`edelweiss0297.cloud`)

```
사용자 브라우저
  │  HTTPS GET https://edelweiss0297.cloud/
  ▼
Cloudflare Edge
  │  - DNS 조회 → Cloudflare Tunnel CNAME
  │  - TLS 종단 (Cloudflare CA, origin cert 없음)
  │  - HTTP로 터널 전달
  ▼
cloudflared (Gateway LXC)
  │  Tunnel → HTTP http://localhost:80
  ▼
Nginx (Gateway LXC :80)
  │  server_name edelweiss0297.cloud
  │  location / → root /var/www/home
  ▼
정적 파일 응답 (HTML/CSS/JS)
  │
  ▼ (역방향으로 동일 경로 반환)
사용자 브라우저
```

### 1-2. 사용자 → Nextcloud (`cloud.edelweiss0297.cloud`)

```
사용자 브라우저
  │  HTTPS
  ▼
Cloudflare Edge (TLS 종단)
  ▼
cloudflared (Gateway LXC)
  ▼
Nginx (Gateway LXC :80)
  │  server_name cloud.edelweiss0297.cloud
  │  location / → proxy_pass http://10.0.0.10:80
  ▼
Nextcloud (Cloud LXC, 10.0.0.10:80)
  │  — vmbr1 NAT 경유 —
  ▼
응답 반환 (역방향 동일 경로)
```

> Paperless(`paperless.edelweiss0297.cloud` → 10.0.0.10:8010),
> ArchiveBox(`archive.edelweiss0297.cloud` → 10.0.0.10:8020)도 동일 패턴.

---

## 2. 서비스 제어 흐름 (시작 / 중지)

제어 요청은 항상 portal-api를 통해 들어오며, 내부적으로 control-api → backend-agent 순으로 위임된다.

```
클라이언트 (웹 UI 또는 Discord 봇)
  │
  │  POST /api/control/<action>
  │  Authorization: Bearer <scope-token>
  ▼
Nginx (POST 요청에 대해 5r/m 제한 적용)
  ▼
cheeze-portal-api (127.0.0.1:11437)
  │  - 토큰 검증 (스코프 확인)
  │  - 요청 로깅
  │  X-Cheeze-Internal-Token 헤더 추가
  ▼
cheeze-control-api (127.0.0.1:11436)
  │  - 명령 파싱 (start / stop / status)
  │  - homepc 도달 가능 여부 확인 (Tailscale ping)
  ▼
cheeze-backend-agent (Tailscale 100.86.252.21:5010, homepc 전용)
  │  - 서비스 실행 / 종료
  │  - RCON 명령 발행 (Minecraft의 경우)
  ▼
대상 서비스 (Minecraft, Ollama 등)
```

### 응답 흐름 (역방향)

```
backend-agent → control-api → portal-api → Nginx → 클라이언트
```

---

## 3. WOL (Wake-on-LAN) 및 하이버네이션 흐름

### 3-1. homepc 기동 (WOL)

```
클라이언트
  │  POST /api/control/wol  (또는 Discord /wol)
  ▼
portal-api → control-api
  │
  │  1. homepc Tailscale IP ping 확인 → 오프라인 확인
  │  2. WOL 매직 패킷 생성
  │     대상 MAC: 9C-6B-00-57-73-3A (homepc 이더넷)
  │     브로드캐스트: 192.168.50.255
  ▼
LAN 브로드캐스트 (UDP 9번 포트)
  ▼
homepc NIC (WOL 활성화 상태)
  │  매직 패킷 수신 → 부팅 시작
  ▼
homepc 부팅 완료
  │
  ▼  (control-api 폴링)
Tailscale ping 100.86.252.21 → 응답 확인
  │
  ▼  (backend-agent 준비 확인)
HTTP GET http://100.86.252.21:5010/health → 200 OK
  │
  ▼
클라이언트에 "homepc 온라인" 응답 반환
```

### 3-2. homepc 하이버네이션

```
클라이언트
  │  POST /api/control/hibernate
  ▼
portal-api → control-api
  ▼
cheeze-backend-agent (100.86.252.21:5010)
  │  - Minecraft 서버 정상 종료 (RCON: /stop)
  │  - 진행 중인 작업 완료 대기
  │  - OS 하이버네이션 명령 실행
  ▼
homepc 하이버네이션 진입
  │
  ▼  (control-api 확인)
Tailscale ping 100.86.252.21 → 타임아웃 확인
  ▼
클라이언트에 "하이버네이션 완료" 응답 반환
```

---

## 4. AI 요청 흐름

Ollama API는 `ollama.edelweiss0297.cloud`를 통해 공개되거나, `/ai/` 경로를 통해 큐잉 처리된다.

### 4-1. `/ai/` 경로 (큐잉 방식, rate limit 미적용)

```
외부 클라이언트
  │  POST https://edelweiss0297.cloud/ai/
  │  Authorization: Bearer <ai-token>
  ▼
Cloudflare Edge (TLS 종단)
  ▼
cloudflared → Nginx
  │  location /ai/ → proxy_pass http://127.0.0.1:11435/
  ▼
cheeze-ai-queue (127.0.0.1:11435)
  │  - 토큰 검증
  │  - 요청 큐에 적재
  │  - homepc/Ollama 가용 여부 확인
  │    → 오프라인 시: control-api에 자동 기동 요청
  │      POST http://127.0.0.1:11436/wakeup
  ▼
Ollama (Tailscale 100.86.252.21:11434)
  │  - LLM 추론 실행
  ▼
응답 → ai-queue → Nginx → cloudflared → Cloudflare → 클라이언트
```

### 4-2. `ollama.edelweiss0297.cloud` 직접 경로

```
외부 클라이언트
  │  POST https://ollama.edelweiss0297.cloud/api/generate
  ▼
Cloudflare Edge (TLS 종단)
  ▼
cloudflared → Nginx
  │  server_name ollama.edelweiss0297.cloud
  │  location / → proxy_pass http://100.86.252.21:11434
  ▼
Ollama (Tailscale → homepc :11434)
  ▼
응답 반환
```

---

## 5. Discord 봇 명령 흐름

```
사용자 (Discord)
  │  슬래시 커맨드 입력 (예: /minecraft start)
  ▼
Discord 서버 (Webhook)
  ▼
cheeze-discord-bot (Gateway LXC, outbound 연결)
  │  - 명령 파싱
  │  - 스코프 토큰 선택 (명령 유형에 따라)
  │  POST http://127.0.0.1:11437/api/control/<action>
  │  Authorization: Bearer <scope-token>
  ▼
cheeze-portal-api (127.0.0.1:11437)
  │  - 토큰 스코프 검증
  │  - X-Cheeze-Internal-Token 추가
  ▼
cheeze-control-api (127.0.0.1:11436)
  ▼
cheeze-backend-agent (Tailscale 100.86.252.21:5010)
  ▼
대상 서비스 실행/종료
  │
  ▼ (결과 반환)
discord-bot → Discord 채널에 결과 메시지 전송
```

---

## 6. 관리자 페이지 접근 흐름 (Tailscale 전용)

공개 도메인(`edelweiss0297.cloud`)에서 `/admin.html` 및 `/api/control/admin/`은 404를 반환한다. 관리자 접근은 반드시 Tailscale VPN 경유해야 한다.

```
관리자 브라우저
  │  Tailscale VPN 연결 필수
  │  HTTP GET http://100.75.209.83/
  ▼
Nginx (Gateway LXC, server_name 100.75.209.83)
  │  listen 100.75.209.83:80
  │  location / → admin.html (정적)
  ▼
관리자 UI 로드

관리자 브라우저
  │  API 요청: POST http://100.75.209.83/api/control/admin/<action>
  ▼
Nginx
  │  location /api/control/admin/ → proxy_pass http://127.0.0.1:11437/admin/
  ▼
cheeze-portal-api /admin/ 엔드포인트
  │  - 관리자 전용 토큰 검증
  ▼
제어 실행 (control-api / backend-agent)
```

**차단 규칙 (공개 도메인)**

```nginx
# edelweiss0297.cloud 서버 블록 내
location = /admin.html {
    return 404;
}
location /api/control/admin/ {
    return 404;
}
```

---

## 7. 게임 서버 접속 흐름 (직접 포트포워딩)

Minecraft 서버는 Cloudflare Tunnel을 거치지 않고 공유기 포트포워딩으로 직접 노출된다.

```
게임 클라이언트 (인터넷)
  │
  │  TCP 연결
  │  ├── 포트 25565 (Vanilla)
  │  └── 포트 25566 (Cobbleverse)
  ▼
가정용 공유기
  │  포트포워딩 규칙:
  │  25565 → 192.168.50.85:25565
  │  25566 → 192.168.50.85:25566
  ▼
homepc (192.168.50.85)
  │
  ├── :25565 → Minecraft Vanilla 프로세스
  └── :25566 → Minecraft Cobbleverse 프로세스

[RCON 제어 — 별도 경로]
cheeze-backend-agent (:5010)
  │  내부 루프백
  ├── TCP 127.0.0.1:25575 → Minecraft Vanilla RCON
  └── TCP 127.0.0.1:25576 → Minecraft Cobbleverse RCON
```

---

## 8. 통합 흐름 요약 다이어그램

```
                        인터넷
                          │
          ┌───────────────┼──────────────────────┐
          │               │                      │
     HTTPS 웹           HTTPS API           TCP 25565/25566
          │               │                 (포트포워딩)
          ▼               ▼                      │
   Cloudflare Edge   Cloudflare Edge             │
          │               │                      │
          └───────┬────────┘                      │
                  │ Cloudflare Tunnel             │
                  ▼                               ▼
         Gateway LXC (CT200)              homepc (192.168.50.85)
         192.168.50.196                   Minecraft :25565/:25566
         Tailscale: 100.75.209.83
                  │
         Nginx :80 (라우팅)
         ┌────────┼──────────────┐
         │        │              │
    정적파일   ai-queue      portal-api
    /var/www   :11435          :11437
                  │              │
                  │         control-api
                  │           :11436
                  │              │
         Tailscale VPN ══════════╝
                  │
         ┌────────┴──────────────┐
         ▼                       ▼
  Ollama :11434          backend-agent :5010
  (homepc)               (homepc)
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
               RCON :25575  RCON :25576   시스템 명령
               (Vanilla)  (Cobbleverse)  (WOL/hibernate)

         Cloud LXC (10.0.0.10) ←── Nginx (NAT 프록시)
         Nextcloud :80
         Paperless :8010
         ArchiveBox :8020
```
