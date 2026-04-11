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

### Homepage control card 경로

`Browser homepage -> /control -> cheeze-control-api -> cheeze-backend-agent`

현재 반영 상태:

- 메인 페이지에 `Minecraft Vanilla` 온디맨드 서비스 카드 코드 반영
- 같은 오리진 `/control` 경로를 전제로 동작
- 버튼:
  - `시작`
  - `종료`
  - `새로고침`
- 상태 표시:
  - `꺼짐`
  - `켜는 중`
  - `가동 중`
  - `종료 중`
  - `오류`
- 상태 자동 갱신:
  - 평시 `10초`
  - `starting/stopping/waking` 상태에서 `2초`
  - 탭/포커스 복귀 시 즉시 갱신

주의:

- `/control/` 프록시는 아직 `home.conf`에 실제 반영 검증이 남아 있다.

2026-04-11 코드 교체 상태:

- `deploy/gateway/cheeze-control-api.py` 에 sleep/hibernate 상태 fallback 반영 완료
- `js/app.js` 에 control card polling 경쟁 조건 완화 반영 완료
- `deploy/gateway/cheeze-control-api.service.example` wake timeout `150초` 로 상향
- `deploy/gateway/home-control-location.conf.example` proxy timeout `210초` 로 상향
- 저장소 기준 파일 교체는 끝났고, `gateway-lxc` 실제 운영 반영은 별도 수행 필요

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

1. `gateway-lxc` 에 수정된 control API / systemd env / homepage 정적 파일 실제 반영
2. `home.conf` 에 `/control/` 프록시 timeout 실제 반영
3. 메인 페이지에서 Minecraft Vanilla 카드 실동작 검증
4. `WOL` 자동 연동 end-to-end 검증
5. `homepc` 가 sleep/hibernate 상태일 때
   - wake
   - boot wait
   - backend agent online wait
   - service start
   흐름 자동화 검증

### 이후 단계

6. idle 감지 후 `hibernate`
7. 친구용 인가 API
8. `minecraft-modpacks`
9. `garrysmod`

## 8. 운영 주의

- `hibernate`는 현재 가능
- 단 `C:` 여유가 충분해야 함
- 운영 보호선:
  - `C:` 여유 `20GB 미만`이면 자동 hibernate 금지

- 사용자가 `homepc`를 직접 사용하는 중에는 절대 자동 절전 금지

## 9. 관련 파일

문서:

- `docs/WOL-plan.md`
- `docs/WOL-start-flow.md`
- `docs/on-demand-service-architecture.md`
- `docs/orchestrator-current-status.md`
- `docs/restart-handoff-prompt.md`

Gateway:

- `deploy/gateway/cheeze-control-api.py`
- `deploy/gateway/cheeze-control-api.service.example`
- `deploy/gateway/wake-homepc.sh.example`
- `deploy/gateway/home-control-location.conf.example`

Backend:

- `deploy/backend/cheeze-backend-agent.py`
- `deploy/backend/cheeze-backend-agent-config.example.json`
- `deploy/backend/minecraft-vanilla/run.ps1.example`
- `deploy/backend/minecraft-vanilla/start.ps1.example`
- `deploy/backend/minecraft-vanilla/stop.ps1.example`
- `deploy/backend/install-backend-agent.ps1.example`

Registry:

- `deploy/orchestrator/service-registry.example.json`

테스트:

- `deploy/gateway/test_cheeze_control_api.py`

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

프런트 상태:
- 검색창 AI 카드 존재
- AI 응답 하단 후속 질문 존재
- 온디맨드 서비스 카드(Minecraft Vanilla) 코드 반영 완료
- /control proxy 예시 파일 존재
- control card 상태 자동 갱신 반영
  - 평시 10초
  - starting/stopping/waking 중 2초
  - 탭/포커스 복귀 시 즉시 갱신
- backend sleep/hibernate 상태 status 조회 fallback 코드 반영 완료
- start 요청 중 background polling 충돌 완화 반영 완료

다음 단계:
- gateway-lxc 에 수정 파일 실제 배포
- gateway home.conf에 /control/ timeout 포함 반영
- homepage에서 Minecraft Vanilla 상태/시작/종료 버튼 실동작 검증
- WOL-aware start를 homepc hibernate 상태에서 검증
- 이후 idle 감지 + auto hibernate 구현
```
