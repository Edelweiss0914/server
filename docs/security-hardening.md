# Security Hardening

작성일: 2026-04-11
목적: 공개 포털과 내부 제어 평면을 분리하고, 제어 API의 노출 범위를 단계적으로 줄이기 위한 기준 문서

## 1. 핵심 원칙

- 공개 웹페이지는 포털 UI와 상태 조회만 담당한다.
- 실제 제어 API는 내부 전용으로 유지한다.
- `WOL`, `start`, `stop` 같은 쓰기 동작은 인증 없는 공개 경로에 두지 않는다.
- 긴 작업은 브라우저가 직접 내부 제어 API를 기다리는 구조로 만들지 않는다.
- 모든 보안 변경은 작업 로그와 함께 기록한다.

## 2. 현재 위험 요약

기존 구조의 위험:

- 브라우저가 공개 경로 `/control` 을 직접 호출했다.
- 공개 nginx 프록시가 내부 제어 API를 그대로 노출했다.
- 제어 요청과 상태 조회가 같은 표면에 섞여 있었다.
- 장시간 `wake -> boot wait -> backend agent wait -> service start` 흐름이 브라우저 요청 하나에 묶여 있었다.

## 3. 2026-04-11 기준 개편 방향

목표 구조:

```text
Browser
  -> public homepage
  -> public portal facade (/api/control)
  -> internal control API (127.0.0.1 only)
  -> backend agent on homepc
  -> service scripts
```

적용 원칙:

- 브라우저는 더 이상 내부 `/control` API를 직접 호출하지 않는다.
- 공개 facade는 상태 조회만 공개로 허용한다.
- `start`, `stop`, `wake` 는 `X-Cheeze-Control-Token` 검증 후에만 내부 제어 API로 전달한다.
- 내부 제어 API는 계속 `127.0.0.1:11436` 에서만 유지한다.

## 4. 현재 저장소 반영 항목

### 내부 제어 API

- 파일: `deploy/gateway/cheeze-control-api.py`
- 역할:
  - WOL 전송
  - backend online wait
  - backend agent start/stop 전달

### 공개 portal facade

- 파일: `deploy/gateway/cheeze-portal-api.py`
- 역할:
  - 브라우저 공개 엔드포인트 제공
  - 상태 조회 프록시
  - 제어 토큰 검증
  - 내부 control API 전달

### 프런트엔드

- 파일: `js/app.js`
- 변경 방향:
  - direct `/control` 호출 제거
  - `/api/control` facade 사용
  - 시작/종료 시 관리자 토큰 요구
  - 잘못된 토큰/비설정 상태를 구체적인 오류로 표시

### 공개 nginx 예시

- 파일: `deploy/gateway/home-control-location.conf.example`
- 공개 경로를 `/control/` 에서 `/api/control/` 로 전환

## 5. 운영 체크리스트

배포 시 반드시 확인:

1. `cheeze-control-api` 는 `127.0.0.1:11436` 에서만 수신
2. `cheeze-portal-api` 는 `127.0.0.1:11437` 에서만 수신
3. nginx 는 `/api/control/` 만 외부에 노출
4. `CHEEZE_PORTAL_CONTROL_TOKEN` 은 긴 난수 값으로 설정
5. 토큰은 저장소에 커밋하지 않음
6. 배포 후 `/api/control/healthz` 로 `action_token_configured=true` 확인

## 6. 다음 보안 단계

### 1차

- 관리자 토큰 기반 제어
- 공개 facade + 내부 control API 분리

### 2차

- 친구용 초대 토큰
- 서비스 범위 제한
- 만료 시간
- 요청 이력 로그

### 3차

- 비동기 job 모델
- 감사 로그 구조화
- rate limit
- 토큰 회전 절차

## 7. 문서 운영 규칙

- 사용자 요청 작업은 `docs/agent-work-log.md` 에 기록한다.
- 오류가 발생하면 원인, 증상, 해결을 함께 기록한다.
- 보안 구조가 바뀌면 이 문서를 갱신한다.
