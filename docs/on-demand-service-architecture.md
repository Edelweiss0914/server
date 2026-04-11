# On-Demand Service Architecture

작성일: 2026-04-11
범위: `gateway-lxc` 와 `homepc` 기반의 범용 WOL 서비스 오케스트레이션 구조

## 1. 목적

현재 시스템은 `AI 포털`로 이미 동작하고 있지만, 장기적으로는 `필요할 때만 깨우는 범용 백엔드 서비스 플랫폼`으로 확장하는 것이 목표다.

이번 아키텍처의 목표:

- `gateway-lxc` 를 항상 켜진 제어 평면으로 유지
- `homepc` 는 평소 `hibernate`
- 필요 시 `WOL` 로 깨움
- `ollama`, `minecraft-java`, 이후 `garrysmod` 같은 서비스를 같은 구조로 관리
- 사용자 직접 사용 중인 `homepc` 는 정책에 의해 자동 절전하지 않음
- 친구들도 사용할 수 있지만, 제어 API는 향후 인가 계층을 둘 수 있게 설계

## 2. 현재 합의된 기본값

- Backend host: `homepc`
- Backend LAN IP: `192.168.50.85`
- Backend Tailscale IP: `100.86.252.21`
- Backend MAC: `9C-6B-00-57-73-3A`
- 절전 목표: `hibernate`
- `C:` free space guard 필요
  - 현재 `hiberfil.sys` full 생성 성공
  - 운영 보호선은 `C:` 여유 `20GB` 이상 권장
- 현재 1차 서비스:
  - `ollama`
  - `minecraft-vanilla`
- 향후 서비스:
  - `minecraft-modpacks/*`
  - `garrysmod`

## 3. 전체 구조

```text
Browser
  -> gateway-lxc homepage / control UI
  -> public portal control facade
  -> internal gateway control API
  -> wake-on-lan (homepc)
  -> backend agent on homepc
  -> service start/stop/status

AI traffic:
Browser -> Nginx /ai -> queue gateway -> Ollama

Game control:
Browser -> public portal control facade -> internal gateway control API -> backend agent -> start server
```

## 4. 역할 분리

### Gateway

`gateway-lxc` 는 아래를 담당한다.

- 포털 UI 제공
- 공개 서비스 상태 조회
- 제어 토큰 검증
- 내부 제어 API 호출
- AI 요청은 큐를 거쳐 프록시

내부 control API는 아래를 담당한다.

- WOL 전송
- 백엔드 기상 대기
- 백엔드 에이전트에 시작/종료 명령 전달

### Backend

`homepc` 는 아래를 담당한다.

- 서비스 실제 실행
- 서비스 준비 완료 판정
- idle 상태 감지
- 조건 충족 시 hibernate 진입
- 사용자가 직접 PC를 쓰는 중이면 절전 금지

## 5. 서비스 제어 모델

서비스는 레지스트리 기반으로 관리한다.

필수 항목:

- `id`
- `type`
- `display_name`
- `working_dir`
- `start_command`
- `stop_command`
- `process_name`
- `ready_check`
- `wake_policy`
- `idle_policy`

이 구조를 쓰면 `ollama`, `minecraft-vanilla`, `minecraft-modpacks`, `garrysmod` 모두 같은 제어 API에 묶을 수 있다.

## 6. 서비스별 현재 설계

### Ollama

- 위치: `homepc`
- 제공 방식: `gateway /ai` 를 통한 API 호출
- 시작 정책: 필요 시 기동, 요청이 이어지면 유지
- 종료 정책: idle 후 종료 후보
- 준비 완료: `http://127.0.0.1:11434/api/version` 성공

### Minecraft Vanilla

- 위치: `D:\Servers\Minecraft\Vanilla`
- 제공 방식: 공인 IP + 포트 직접 접속
- 시작 정책: 포털 버튼으로만 시작
- 종료 정책: 접속자 0명 + idle 조건
- 준비 완료: `25565/tcp` open

### Minecraft Modpacks

- 위치 규칙: `D:\Servers\Minecraft\Modpacks\<modpack-name>`
- 제공 방식: 공인 IP + 할당 포트 직접 접속
- 시작 정책: 포털 버튼 또는 향후 선택 UI
- 종료 정책: 접속자 0명 + idle 조건

## 7. 상태 모델

서비스 상태:

- `offline`
- `waking`
- `starting`
- `running`
- `stopping`
- `error`

호스트 상태:

- `asleep`
- `booting`
- `online-idle`
- `online-busy`
- `hibernating`
- `error`

## 8. WOL 흐름

기본 흐름:

1. 사용자가 포털에서 서비스 시작 요청
2. 게이트웨이가 `homepc` 상태 확인
3. 오프라인이면 `wakeonlan 9C-6B-00-57-73-3A`
4. `homepc` 온라인 확인
5. 백엔드 에이전트 응답 확인
6. 대상 서비스 시작
7. 서비스 준비 완료 판정
8. UI 상태 갱신

## 9. 자동 절전 금지 조건

아래 중 하나라도 참이면 `hibernate` 금지:

- 최근 사용자 입력 존재
- 콘솔/RDP 세션 활성
- `ollama` 요청 처리 중
- 게임 서버 프로세스 실행 중
- 게임 접속자 존재
- 예약 가동 시간대(`19:00 ~ 01:00`) 내
- `C:` 여유 공간 `20GB 미만`
- 수동 `no-sleep` 플래그 존재

## 10. 초기 운영 정책

### Ollama

- `OLLAMA_NUM_PARALLEL=1`
- `OLLAMA_MAX_LOADED_MODELS=1`
- `OLLAMA_MAX_QUEUE=1~2`
- `OLLAMA_KEEP_ALIVE=0` 또는 짧은 유지 시간

### Host hibernate

- `C:` 여유 `20GB 이상`일 때만 허용
- 최근 AI 요청 후 `30분` 이내면 유지
- 사용자가 직접 사용 중이면 무조건 금지

### Game servers

- 친구들이 켜는 구조 가능
- 단, 제어 API는 향후 인가 필요
- 현재는 관리자 또는 임시 보호 하에 운영 권장

## 11. 제어 API 보안 방향

서비스 이용은 공개 가능하지만, 제어 API는 공개 상태로 두면 안 된다.

단계별 권장:

### 1차

- 관리자 전용 또는 내부 보호
- 공개 포털 facade와 내부 control API 분리
- `start/stop/wake` 는 토큰 필요

### 2차

- 난수 기반 초대 토큰 API
- 토큰 만료 시간
- 허용 서비스 범위
- 사용 이력 로그

## 12. 구현 산출물

이번 스캐폴드에서 제공하는 대상:

- `service registry` 예시
- `gateway control API` 예시
- `backend agent` 예시
- 향후 `systemd`/Windows 서비스화용 템플릿

## 13. 아직 남은 정보

정확한 구현을 위해 아직 필요한 정보:

1. `minecraft-vanilla` 실제 시작 명령
2. `minecraft-vanilla` 실제 종료 방법
3. `modpack` 별 포트 배정 규칙
4. 작업 스케줄러 상세 정책
5. 초기 제어 API를 누구까지 허용할지

## 14. 현재 구현 원칙

- 구조는 범용으로 설계
- 서비스 정의는 설정 파일로 관리
- AI와 게임 서버는 같은 제어 평면에 편입
- 사용자 직접 사용 중에는 절대 자동 hibernate 금지
