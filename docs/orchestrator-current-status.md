# Orchestrator Current Status

작성일: 2026-04-11
목적: 범용 온디맨드 서비스 오케스트레이션의 현재 실제 구현 상태 기록

## 1. 현재 구조

### Gateway

- Host: `gateway-lxc`
- 역할:
  - 포털 UI 제공
  - AI queue gateway 제공
  - generic control API 제공
  - backend agent와 통신

### Backend

- Host: `homepc`
- 역할:
  - 실제 서비스 실행
  - backend agent 실행
  - 현재 관리 서비스:
    - `ollama`
    - `minecraft-vanilla`

## 2. 현재 배포된 구성

### AI 경로

`Browser -> edelweiss0297.cloud/ai -> gateway queue -> Ollama on homepc`

검증 완료:

- 외부 Ollama API 접근 성공
- 메인 페이지 AI 제안 카드 동작
- 후속 질문 입력창 동작
- AI queue gateway 동작

### Generic control 경로

`Browser / gateway -> cheeze-control-api -> cheeze-backend-agent -> service scripts`

검증 완료:

- `gateway-lxc` 의 `cheeze-control-api` 실행
- `homepc` 의 `cheeze-backend-agent` 실행
- `/services` 상태 질의 정상
- `minecraft-vanilla` 시작/종료 정상

## 3. 실제 상태값

### Tailscale

- `gateway-lxc`: `100.75.209.83`
- `homepc`: `100.86.252.21`

### Backend LAN

- `homepc`: `192.168.50.85`

### WOL MAC

- `9C-6B-00-57-73-3A`

## 4. 현재 동작 확인된 서비스

### Ollama

- 상태 조회 정상
- backend agent에서 `running`
- gateway queue를 통해 사용 가능

### Minecraft Vanilla

- working dir: `D:\Servers\Minecraft\Vanilla`
- control dir: `D:\Servers\Control\minecraft-vanilla`
- start command:
  - `powershell -ExecutionPolicy Bypass -File D:\Servers\Control\minecraft-vanilla\start.ps1`
- stop command:
  - `powershell -ExecutionPolicy Bypass -File D:\Servers\Control\minecraft-vanilla\stop.ps1`

검증 완료:

- gateway에서 start 호출 성공
- Windows에서 `java.exe` 실행 확인
- `25565/tcp` listening 확인
- gateway에서 `running` 상태 확인
- gateway에서 stop 호출 성공
- graceful stop 후 `offline` 상태 복귀 확인

## 5. Minecraft wrapper 현재 상태

구성:

- `start.ps1`
- `run.ps1`
- `stop.ps1`

동작:

- `start.ps1` 는 wrapper(`run.ps1`)를 시작
- `run.ps1` 는 `server.jar` 를 실행하고 PID/로그/stop.flag를 관리
- `stop.ps1` 는 `stop.flag` 를 생성하고 graceful stop을 기다림
- timeout 시에만 force stop

현재 기준 jar:

- `server.jar`

현재 기준 Java 경로:

- `C:\Program Files (x86)\Minecraft Launcher\runtime\java-runtime-epsilon\windows-x64\java-runtime-epsilon\bin\java.exe`

메모리:

- `-Xms4G -Xmx4G`

## 6. 현재 상태 API 해석

`minecraft-vanilla` 에 대해 아래 상태를 실제로 확인했다.

- `starting`
- `running`
- `stopping`
- `offline`

추가 필드:

- `process_running`
- `ready`
- `stop_pending`

## 7. 현재 남은 과제

### 가장 가까운 다음 단계

1. `WOL` 자동 연동
2. `homepc` 가 sleep/hibernate 상태일 때
   - wake
   - boot wait
   - backend agent online wait
   - service start
   흐름 자동화

### 이후 단계

3. idle 감지 후 `hibernate`
4. 친구용 인가 API
5. `minecraft-modpacks`
6. `garrysmod`

## 8. 운영 주의

- `hibernate`는 현재 가능
- 단 `C:` 여유가 충분해야 함
- 운영 보호선:
  - `C:` 여유 `20GB 미만`이면 자동 hibernate 금지

- 사용자가 `homepc`를 직접 사용하는 중에는 절대 자동 절전 금지

## 9. 관련 파일

문서:

- `docs/WOL-plan.md`
- `docs/on-demand-service-architecture.md`
- `docs/orchestrator-current-status.md`

Gateway:

- `deploy/gateway/cheeze-control-api.py`
- `deploy/gateway/cheeze-control-api.service.example`
- `deploy/gateway/wake-homepc.sh.example`

Backend:

- `deploy/backend/cheeze-backend-agent.py`
- `deploy/backend/cheeze-backend-agent-config.example.json`
- `deploy/backend/minecraft-vanilla/run.ps1.example`
- `deploy/backend/minecraft-vanilla/start.ps1.example`
- `deploy/backend/minecraft-vanilla/stop.ps1.example`
- `deploy/backend/install-backend-agent.ps1.example`

Registry:

- `deploy/orchestrator/service-registry.example.json`

## 10. 다음 작업용 요약

```text
현재 범용 서비스 오케스트레이션 1차 구축은 완료 상태다.

확정:
- gateway-lxc에 cheeze-control-api 배포 완료
- homepc에 cheeze-backend-agent 배포 완료
- ollama 상태 조회 정상
- minecraft-vanilla start/stop 정상
- 상태값 starting/running/stopping/offline 확인 완료

환경:
- gateway-lxc tailscale = 100.75.209.83
- homepc tailscale = 100.86.252.21
- homepc LAN = 192.168.50.85
- homepc MAC = 9C-6B-00-57-73-3A

minecraft-vanilla:
- server root = D:\Servers\Minecraft\Vanilla
- control root = D:\Servers\Control\minecraft-vanilla
- java = C:\Program Files (x86)\Minecraft Launcher\runtime\java-runtime-epsilon\windows-x64\java-runtime-epsilon\bin\java.exe
- jar = server.jar
- memory = -Xms4G -Xmx4G

다음 단계:
- WOL 자동 연동
- wake -> boot -> backend agent online -> service start 자동화
```
