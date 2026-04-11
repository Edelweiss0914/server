# WOL Plan

작성일: 2026-04-11
목적: `gateway-lxc` 와 `homepc` 기반의 범용 온디맨드 서비스 기상/제어 구조 설계

## 1. 목표

현재 홈 포털은 이미 `AI -> gateway -> queue -> Ollama` 경로를 확보했다.
다음 단계는 이를 `AI 전용`이 아니라 `범용 서비스 오케스트레이션`으로 확장하는 것이다.

대상:

- `homepc` 1대
- 현재 서비스:
  - `ollama`
  - `minecraft-java`
- 향후 추가 예정:
  - `garrysmod`
  - 기타 백엔드 서비스

핵심 요구:

- 백엔드는 평소 `hibernate`
- 필요 시 게이트웨이가 `WOL`로 기상
- 서비스별 시작/종료/상태 제어
- 사용자가 PC를 직접 쓰는 중에는 정책에 의해 절전 진입 금지
- 공용 사용 가능하더라도 제어 평면은 안전해야 함

## 2. 현재 전제

- Gateway: `gateway-lxc`
- Backend: `homepc`
- Backend MAC: `9C-6B-00-57-73-3A`
- 절전 목표 상태: `hibernate`
- 서비스 노출 정책:
  - `ollama`: 포털을 통한 API 사용
  - `minecraft-java`: 공인 IP + 포트 기반 직접 접속
  - 이후 게임 서버도 동일 패턴 가능
- 동시 실행: 허용
- 리소스 제한: 필요

## 3. 권장 아키텍처

```text
Browser
  -> gateway-lxc portal
  -> gateway control API
  -> wake-on-lan to homepc
  -> backend agent on homepc
  -> start/stop/status per service
```

구성 요소:

1. `gateway portal`
- 상태 표시
- 시작/종료 버튼
- WOL 요청
- 서비스 준비 완료 확인

2. `gateway control API`
- `/services`
- `/services/{name}/status`
- `/services/{name}/start`
- `/services/{name}/stop`
- `/host/wake`

3. `backend agent`
- `homepc`에서 항상 대기
- 서비스별 시작/종료/상태 관리
- idle 판단
- hibernate 진입 여부 최종 결정

## 4. 서비스 상태 모델

각 서비스는 아래 상태를 갖는 것을 권장한다.

- `offline`
- `waking`
- `starting`
- `running`
- `stopping`
- `error`

호스트 상태는 별도로 가진다.

- `asleep`
- `booting`
- `online-idle`
- `online-busy`
- `hibernating`
- `error`

## 5. WOL 동작 방식

### 기본 흐름

1. 사용자가 포털에서 서비스 시작 요청
2. 게이트웨이가 `homepc` 온라인 여부 확인
3. 오프라인이면 `wakeonlan 9C-6B-00-57-73-3A`
4. `homepc` 부팅 대기
5. 백엔드 에이전트 온라인 확인
6. 지정 서비스 시작
7. 서비스 준비 완료 판정
8. 포털 상태를 `running` 으로 전환

### AI 예시

1. 사용자가 AI 카드 클릭
2. 게이트웨이가 `homepc` 와 `ollama` 상태 확인
3. 필요 시 WOL
4. `ollama` 준비 완료 확인
5. `/ai` 요청 전달

### 게임 서버 예시

1. 사용자가 `Minecraft 서버 켜기` 클릭
2. 게이트웨이가 `homepc` 상태 확인
3. 필요 시 WOL
4. `minecraft-java` 시작
5. 포트/프로세스 기준 준비 완료 확인
6. 포털에 `가동 중` 표시
7. 사용자는 공인 IP:25565 로 직접 접속

## 6. 절전 방지 정책

가장 중요한 요구사항:

`사용자가 homepc를 직접 사용 중일 때는 어떤 자동 정책도 hibernate를 트리거하면 안 된다.`

이를 위해 백엔드 에이전트가 아래 조건을 모두 확인해야 한다.

### 절전 금지 조건

하나라도 참이면 절전 금지:

1. 최근 사용자 입력이 있음
- 최근 N분 내 키보드/마우스 입력

2. 대화형 세션이 활성 상태
- 로컬 로그인 세션
- 원격 데스크톱 세션

3. AI 작업 진행 중
- Ollama 요청 처리 중
- queue 또는 upstream 작업 감지

4. 게임 서버 가동 중
- Minecraft/Garry's Mod 프로세스 실행 중
- 접속자 1명 이상

5. 예약 작업 시간대
- 작업 스케줄러 기반 강제 가동 시간대

6. 시스템 자원 활동이 높음
- CPU/GPU/디스크 활동이 일정 임계치 이상

### 절전 허용 조건

아래를 모두 만족할 때만 hibernate 후보:

- 사용자 입력 idle 시간이 기준 이상
- 활성 세션 없음
- AI 작업 없음
- 게임 서버 꺼짐 또는 접속자 0
- 예약 가동 시간대 아님
- 최근 N분 내 서비스 요청 없음

권장 기준 시작값:

- 사용자 입력 idle: `20분`
- AI idle grace: `30분`
- 게임 서버 접속자 0 유지: `20분`
- 최종 host hibernate 후보: `30분 이상`

## 7. 절전 방지 구현 방향

Windows에서 가장 현실적인 구현:

### 백엔드 에이전트의 체크 항목

1. 사용자 입력 idle 시간
- `GetLastInputInfo` 기반

2. 활성 세션 존재 여부
- 콘솔 세션
- RDP 세션

3. 서비스별 프로세스 확인
- `ollama`
- `java` (minecraft)
- `srcds` 또는 게임별 프로세스

4. 서비스별 세부 상태 확인
- Ollama health
- 게임 포트 open 여부
- 접속자 수 확인 가능 시 활용

5. 최근 요청 타임스탬프
- gateway가 시작 요청/AI 요청 시 heartbeat 갱신

### 추가 보호 장치

- 사용자가 직접 `수동 잠금 금지` 플래그를 켤 수 있는 파일/토글 제공
- 예: `C:\ProgramData\cheeze-agent\no-sleep.flag`
- 해당 파일이 존재하면 절전 금지

이 플래그는 수동 작업, 게임 설치, 로컬 점검 시 유용하다.

## 8. Hibernate 관련 주의

Windows `hibernate`는 메모리 내용을 디스크의 `hiberfil.sys` 에 저장한다.

따라서:

- 시스템 드라이브 용량 여유가 부족하면 실패 가능
- RAM 64GB 환경에서는 `hiberfil.sys` 크기가 무시할 수 없을 정도로 큼

권장:

- `C:`에 최소 `30GB+` 여유 확보
- 실제로는 더 넉넉한 여유가 안전

확인 항목:

```powershell
powercfg /a
powercfg /h /type full
dir C:\hiberfil.sys
```

## 9. 서비스별 권장 정책

### Ollama

- 상시 완전 상주보다는 `조건부 상시`
- 마지막 요청 후 일정 시간 유지
- idle이면 종료 또는 host hibernate 후보

권장 초기값:

- `OLLAMA_NUM_PARALLEL=1`
- `OLLAMA_MAX_LOADED_MODELS=1`
- `OLLAMA_MAX_QUEUE=1~2`
- `OLLAMA_KEEP_ALIVE=0` 또는 매우 짧게

### Minecraft Java

- 자동기동 아님
- 포털의 시작 버튼으로만 가동
- 접속자 0명이 일정 시간 지속되면 종료 후보

### Garry's Mod

- Minecraft와 같은 구조로 편입 가능
- 서비스 정의만 추가하면 됨

## 10. UI 방향

메인 포털에서 서비스별 카드에 아래를 제공하는 방향을 권장한다.

- 상태 표시
  - `꺼짐`
  - `켜는 중`
  - `가동 중`
  - `오류`
- 버튼
  - `시작`
  - `종료`
  - `상태 새로고침`

AI는 예외적으로 지금처럼 검색창 UX를 유지하되, 상태 배지 정도는 추가 가능하다.

## 11. 보안 원칙

중요:

- 서비스 이용은 공개 가능해도
- 시작/종료/WOL 같은 제어 API는 공개로 두면 안 된다

권장:

- 제어 API는 인증 필요
- 최소한 관리자 토큰, 세션, 또는 Tailscale 내부 전용으로 제한

## 12. 구현 순서 권장안

1. `WOL` 단독 검증
2. `homepc` 백엔드 에이전트 구현
3. `Minecraft` 시작/종료/상태 연동
4. `AI` idle 정책과 host hibernate 정책 통합
5. 추가 게임 서버 편입

이 순서가 좋은 이유:

- 가장 먼저 “깨우기”가 안정화돼야 함
- 그 다음 “서비스 제어”
- 마지막에 “자동 잠재우기”

## 13. 구현 전에 추가로 필요한 정보

아래 정보가 있어야 실제 구현으로 넘어갈 수 있다.

### 필수

1. `homepc` 현재 유선 LAN IP
2. `Minecraft Java` 서버 실행 경로
3. `Minecraft Java` 시작 명령
4. `Minecraft Java` 종료 방법
5. `작업 스케줄러`로 허용할 고정 시간대가 있는지
6. 제어 API를 관리자만 쓸지 여부

### 있으면 좋은 정보

7. 향후 `Garry's Mod` 실행 경로/명령
8. Windows에서 사용할 백엔드 에이전트를 `PowerShell`로 할지 `Python`으로 할지 선호
9. `C:` 드라이브 남은 용량
10. BIOS/Windows에서 WOL 활성화 상태 확인 결과

## 14. 다음 작업용 요약

```text
목표는 gateway-lxc + homepc 구조에서 범용 온디맨드 서비스 오케스트레이션을 구현하는 것이다.

확정:
- 대상 백엔드: homepc 1대
- MAC: 9C-6B-00-57-73-3A
- 절전 목표: hibernate
- 서비스:
  - ollama
  - minecraft-java
  - 이후 garrysmod 등 확장 예정
- 정책:
  - AI와 게임 동시 실행 허용
  - 리소스 제한 필요
  - AI는 검색창 UX 유지
  - 게임은 시작/종료 버튼 + 상태 표시

절전 방지 원칙:
- 사용자가 homepc를 직접 사용하는 중이면 자동 hibernate 금지
- 최근 입력, 활성 세션, AI 작업, 게임 서버, 예약 시간, 고부하 상태를 모두 확인해야 함

다음 구현 전에 필요한 정보:
- homepc 유선 LAN IP
- Minecraft 실행 경로/시작 명령/종료 방법
- 작업 스케줄러 허용 시간대
- 제어 API 인증 범위
```
