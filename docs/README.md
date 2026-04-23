# CHEEZE 홈랩 인프라 문서

> 개인 홈랩 인프라(Edelweiss) 기술 문서 — 최종 갱신: 2026-04-17

## 아키텍처

| 문서 | 설명 |
|------|------|
| [시스템 개요](architecture/system-overview.md) | 전체 시스템 아키텍처, 물리 장비, 소프트웨어 스택 |
| [네트워크 토폴로지](architecture/network-topology.md) | IP 할당, 포트, DNS, Cloudflare Tunnel, Nginx 라우팅 |
| [데이터 흐름](architecture/data-flow.md) | 트래픽 흐름 (웹, 제어, WOL, AI, Discord, 관리자) |

## 인프라

| 문서 | 설명 |
|------|------|
| [Proxmox 호스트](infrastructure/proxmox-host.md) | Proxmox VE 하이퍼바이저, 네트워크 브리지, 컨테이너/VM |
| [Gateway LXC](infrastructure/gateway-lxc.md) | Nginx, systemd 서비스, Cloudflare Tunnel, 파일 레이아웃 |
| [Cloud VM](infrastructure/cloud-vm.md) | Nextcloud, Paperless-ngx, ArchiveBox (Docker Compose) |
| [Backend PC](infrastructure/backend-pc.md) | Windows 백엔드, 서버 디렉토리, 하이버네이션 |
| [Tailscale VPN](infrastructure/tailscale-vpn.md) | VPN 구성, IP 할당, 용도별 사용 |

## 서비스

| 문서 | 설명 |
|------|------|
| [Portal API](services/cheeze-portal-api.md) | 공개 파사드 — 토큰 인증, 감사 로그, 시간 제한 |
| [Control API](services/cheeze-control-api.md) | 내부 제어 — WOL, 백엔드 프록시, 오프라인 폴백 |
| [Backend Agent](services/cheeze-backend-agent.md) | Windows 에이전트 — 서비스 수명주기, 유휴 감지, RCON |
| [E-class 자동화](services/eclass-automation.md) | 명지전문대 LMS 자동 출석/강의 관리 — FastAPI + Playwright |
| [AI Queue](services/cheeze-ai-queue.md) | AI 요청 큐 — Ollama 프록시, 자동 시작 |
| [Discord Bot](services/cheeze-discord-bot.md) | Discord 슬래시 커맨드 — 게임 서버 제어 |
| [온디맨드 서비스](services/on-demand-services.md) | Minecraft, Ollama — WOL, 유휴 경고, 하이버네이션 |

## 보안

| 문서 | 설명 |
|------|------|
| [보안 모델](security/security-model.md) | 계층적 보안, 토큰 시스템, 감사 로그, 접근 제어 |

## 운영

| 문서 | 설명 |
|------|------|
| [배포](operations/deployment.md) | CI/CD 파이프라인, 파일 매핑, 수동 배포, 롤백 |
| [문제 해결](operations/troubleshooting.md) | 상태 확인, 일반 문제 시나리오별 진단/해결 |
| [유지보수](operations/maintenance.md) | 점검 체크리스트, 백업, 토큰 관리, 모드팩 추가 |

## 프론트엔드

| 문서 | 설명 |
|------|------|
| [웹 페이지](frontend/web-pages.md) | HTML/JS/CSS 구조, API 연동, 폴링 전략 |

## 계획

| 문서 | 설명 |
|------|------|
| [계획 및 구상](plans.md) | 인프라 개선, 신규 기능, 아키텍처 변경 구상 |
## Admin Panel

| Document | Description |
|------|------|
| [Admin Panel Runbook](frontend/admin-panel-runbook.md) | Workflow, service-panel troubleshooting, and gateway deploy verification for `/admin` |
