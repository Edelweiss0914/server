# Pterodactyl Wings Heartbeat 조사 기록

> 상태: 완료
> 작성일: 2026-04-19
> 목표: homepc WSL2의 Wings 노드가 Pterodactyl Panel에서 Heartbeat 빨간색으로 남는 원인을 정리하고 현재 정상 운영 구성을 문서화

## 배경

Phase 3 진행 중 homepc WSL2에 Wings 설치와 systemd 등록까지 끝났지만,
Pterodactyl Panel의 Nodes 화면에서 `homepc-wsl2` 노드 Heartbeat가 초록색으로 바뀌지 않았다.

기존 문서에는 다음 기준이 섞여 있었다.

- Node FQDN: `100.86.252.21`
- Daemon Port: `8080`
- SSL: No
- Behind Proxy: No

하지만 실제 운영 구조는 다음과 같았다.

- Panel 외부 도메인: `wings.edelweiss0297.cloud`
- Gateway nginx가 `wings.edelweiss0297.cloud:443` 요청을 수신
- nginx upstream이 `http://100.86.252.21:8080` 으로 프록시
- Wings는 WSL2 내부에서 HTTP(`ssl.enabled: false`)로 동작

## 목표

- Heartbeat가 빨간색으로 남은 직접 원인을 설명한다.
- 현재 정상 동작하는 기준 설정을 고정한다.
- 다음 설치 시 같은 포트/프록시 혼선을 반복하지 않도록 한다.

## 조사 과정

### 1. Wings 서비스 자체 상태 확인

- `wings.service`는 `active (running)` 상태였다.
- `journalctl -u wings` 로그에 Panel API 조회와 cron 시작 로그가 있었다.
- 즉 "Wings 미기동"은 원인이 아니었다.

### 2. 실제 리슨 포트 확인

조사 중 다음 두 상태가 번갈아 관측되었다.

- 초기: `config.yml`은 `api.port: 8080` 이었지만 실제 리슨은 `443`
- 수정 후: `ss -tlnp` 기준 `*:8080`, `*:2022` 리슨 확인

이는 Panel에서 내려준 설정과 현재 적용된 Wings 프로세스 상태가 한동안 불일치했음을 의미한다.

### 3. Panel 노드 설정과 프록시 구성 비교

최종 정상 동작 전후의 핵심 변수는 다음과 같았다.

- FQDN: `wings.edelweiss0297.cloud`
- Daemon Port: `443`
- SSL: `Use SSL Connection`
- Behind Proxy: 체크

이 설정은 "외부에서는 HTTPS 443으로 보고, 내부에서는 프록시 뒤 HTTP Wings로 연결"하는 구조를 전제한다.

문서와 일부 로컬 판단은 `100.86.252.21:8080`, `SSL No`, `Behind Proxy No` 기준이었고,
이 값으로 Panel 노드를 맞추면 현재 Gateway nginx 프록시 구조와 충돌했다.

### 4. 실제 접근 경로 점검

다음 응답이 확인되었다.

- `http://127.0.0.1:8080` → Wings 인증 헤더 누락 오류 반환
- `http://100.86.252.21:8080` → Wings 인증 헤더 누락 오류 반환
- `https://wings.edelweiss0297.cloud` → Wings 인증 헤더 누락 오류 반환

이 결과는 네트워크 경로 자체는 살아 있으며,
문제는 인증/포트/프록시 설정 정합성에 있었다는 뜻이다.

## 원인

직접 원인은 다음과 같다.

1. Wings는 내부 HTTP 서비스인데, 문서와 노드 설정 일부가 "직접 연결 모드"와 "프록시 모드"를 혼용했다.
2. 실제 운영은 `Behind Proxy = Yes` 구조인데, 문서에는 `Behind Proxy = No`, `SSL = No`, `FQDN = 100.86.252.21` 로 적혀 있었다.
3. 그 상태에서 Panel Daemon Port를 `8080`으로 바꾸면 외부 도메인(`wings.edelweiss0297.cloud:443`) 기반 프록시 경로와 충돌했다.

즉 문제의 본질은 "Wings가 죽어 있었던 것"이 아니라
"Panel이 바라보는 외부 주소와 Wings가 실제로 떠 있는 내부 주소 사이의 프록시 모델이 문서/설정에서 일관되지 않았던 것"이다.

## 최종 정상 구성

### Panel 노드 설정

- FQDN: `wings.edelweiss0297.cloud`
- Daemon Port: `443`
- SSL: `Use SSL Connection`
- Behind Proxy: 체크

### Gateway nginx

- `wings.edelweiss0297.cloud:443`
- upstream: `http://100.86.252.21:8080`

### homepc WSL2 Wings

- `api.host: 0.0.0.0`
- `api.port: 8080`
- `api.ssl.enabled: false`
- SFTP: `2022`

## 검증

다음 상태를 확인했다.

- `ss -tlnp | grep -E ':8080|:2022'` 에서 `*:8080`, `*:2022` 리슨
- `journalctl -u wings` 에서 `configuring internal webserver ... host_port=8080`
- `127.0.0.1:8080`, `100.86.252.21:8080`, `https://wings.edelweiss0297.cloud` 모두 Wings 인증 오류 응답 반환
- Panel 노드 화면에서 Heartbeat 초록색 전환

## 운영 규칙

1. `wings.edelweiss0297.cloud` 도메인을 유지하는 한, Panel 노드는 `443 + SSL + Behind Proxy` 를 사용한다.
2. Wings 자체는 WSL2 내부에서 `8080 + ssl.enabled: false` 로 유지한다.
3. Panel의 `config.yml`을 재다운로드해 적용하더라도, 최종 확인은 항상 `ss -tlnp` 와 `journalctl -u wings` 로 한다.
4. 문서나 운영 메모에서 "direct Tailscale IP 접속"과 "reverse proxy 도메인 접속" 모델을 혼용하지 않는다.

## 관련 문서

- [wings-setup.md](./wings-setup.md)
- [troubleshooting.md](./troubleshooting.md)
- [plans.md](../plans.md)
