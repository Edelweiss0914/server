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

## 6. 현재 2차 보안 구현

### 1차

- 관리자 토큰 기반 제어
- 공개 facade + 내부 control API 분리

### 1차 브라우저 검증 기준

브라우저에서 확인할 항목:

1. 홈페이지 로드 시 서비스 상태 조회가 정상 동작한다.
2. `시작` 버튼 클릭 시 관리자 제어 토큰 입력창이 뜬다.
3. `종료` 버튼 클릭 시에도 관리자 제어 토큰 입력창이 뜬다.
4. 잘못된 토큰 입력 시:
   - 시작이 실행되지 않는다.
   - 종료도 실행되지 않는다.
   - 프런트가 "토큰이 없거나 올바르지 않다"는 메시지를 보여준다.
5. 올바른 토큰 입력 시:
   - `X-Cheeze-Control-Token` 헤더와 함께 `/api/control/services/{id}/start` 요청이 나간다.
   - 서비스 상태가 `waking -> starting -> running` 흐름으로 전이한다.
   - `stop` 요청도 같은 헤더로 전달된다.
6. 새로고침 후 같은 브라우저 세션에서는 토큰이 `sessionStorage` 에 남아 재입력을 요구하지 않는다.

주의:

- 현재 토큰 저장 위치는 `sessionStorage` 이므로 브라우저 탭/세션이 종료되면 다시 입력해야 한다.
- 1차 단계에서는 사용자 계정 개념이 없고, 관리자 토큰 단일 값만 사용한다.
- 1차 단계에서는 `stop` 도 파괴적 제어 동작으로 취급하므로 토큰이 필요하다.

### 2차

- 다중 토큰 레지스트리
- 서비스 범위 제한
- 액션 범위 제한
- 만료 시간
- 요청 이력 로그

### 2차 설계안

현재 반영:

- 파일: `deploy/gateway/portal-control-tokens.example.json`
- 파일: `deploy/gateway/cheeze-portal-api.py`
- portal facade 는 아래를 지원한다.
  - 레거시 단일 환경변수 관리자 토큰
  - 토큰 레지스트리 파일 기반 다중 토큰
  - `allowed_services`
  - `allowed_actions`
  - `expires_at`
  - `revoked_at`
  - 감사 로그 append

목표:

- 관리자 단일 토큰을 넘어, 사용자별 또는 공유 링크별 제어 범위를 제한한다.
- 누가 어떤 서비스를 언제 켰는지 남긴다.
- 토큰이 유출돼도 전체 제어권으로 바로 이어지지 않게 한다.

권장 구조:

```text
Browser
  -> portal facade
  -> token validation layer
  -> policy check (service scope / expiry / action scope)
  -> internal control API
```

필요 구성:

1. 토큰 저장소
- 파일 또는 sqlite
- 필드:
  - `token_id`
  - `token_hash`
  - `label`
  - `role`
  - `allowed_services`
  - `allowed_actions`
  - `expires_at`
  - `created_at`
  - `revoked_at`

현재 2차 구현에서는 파일형 JSON 레지스트리를 사용한다.

2. 역할 모델
- `admin`
  - 모든 서비스 start/stop/wake 허용
- `friend`
  - 허용된 게임 서버만 start 가능
  - stop 은 허용 여부를 별도 설정
- `readonly`
  - 상태 조회만 허용

3. 서비스 범위
- 예:
  - `minecraft-vanilla:start`
  - `minecraft-modpacks/*:start`
  - `ollama:deny`

4. 토큰 만료
- 일회성 초대 토큰
- N시간/일 단위 만료
- 수동 폐기 가능

5. 감사 로그
- 필드:
  - `timestamp`
  - `token_id`
  - `service_id`
  - `action`
  - `remote_ip`
  - `user_agent`
  - `result`

현재 기본 로그 파일:

- `/opt/cheeze-control/portal-control-audit.log`

6. 최소 rate limit
- 토큰별
- IP별
- 서비스별 연속 start 제한

구현 순서:

1. portal facade 에 토큰 검증 계층 추가
2. 토큰 저장소 파일/DB 도입
3. 감사 로그 추가
4. 친구용 제한 토큰 발급 도구 추가
5. 프런트에 "읽기 전용 / 제어 가능" 상태 반영

현재 완료:

- 1, 2, 3

다음 후보:

- 4, 5

운영 메모:

- `CHEEZE_PORTAL_CONTROL_TOKEN` 은 레거시 관리자 토큰으로 계속 동작한다.
- 2차를 본격 사용하려면 `CHEEZE_PORTAL_TOKEN_REGISTRY` 경로의 실제 토큰 파일을 배포하고, 토큰은 평문 대신 SHA-256 해시로 저장한다.
- registry 기반 운영 중에도 레거시 환경변수 토큰을 남겨두면 관리자 우회 통로가 유지되므로, 완전 전환 시에는 환경변수 토큰을 비우는 편이 낫다.

## 7. 토큰 생성과 배치 방법

핵심:

- 토큰 평문은 사람에게만 전달한다.
- 서버에는 평문 대신 SHA-256 해시만 저장한다.
- 실제 운영 파일은 예시 파일과 분리한다.

권장 배치 위치:

- 실제 토큰 레지스트리:
  - `/opt/cheeze-control/portal-control-tokens.json`
- 감사 로그:
  - `/opt/cheeze-control/portal-control-audit.log`

예시 파일:

- `deploy/gateway/portal-control-tokens.example.json`

해시 생성 위치:

- 신뢰할 수 있는 로컬 작업 PC
- 또는 `gateway-lxc` 자체

중요:

- 토큰 평문은 shell history, 문서, git 커밋에 남기지 않는 편이 낫다.
- 가능하면 임시 생성 후 사용자에게만 전달하고, 저장소에는 해시만 남긴다.

### 방법 1. 저장소 스크립트 사용

파일:

- `deploy/gateway/generate-control-token.py`

예시:

```bash
cd /var/www/home
python3 deploy/gateway/generate-control-token.py \
  --token-id friend-minecraft-24h \
  --label "Friend Minecraft Start Token" \
  --role friend \
  --services minecraft-vanilla \
  --actions start \
  --expires-at 2026-04-12T12:00:00+00:00
```

이 스크립트는 아래를 출력한다.

- 평문 토큰
- SHA-256 해시
- `portal-control-tokens.json` 에 넣을 JSON 항목

### 방법 2. openssl 사용

```bash
printf '%s' '여기에_실제_토큰' | openssl dgst -sha256
```

출력된 해시값만 `token_hash` 에 넣는다.

### 방법 3. Python 한 줄 사용

```bash
python3 - <<'PY'
import hashlib
token = '여기에_실제_토큰'
print(hashlib.sha256(token.encode('utf-8')).hexdigest())
PY
```

### 실제 운영 파일 만들기

```bash
sudo cp /var/www/home/deploy/gateway/portal-control-tokens.example.json /opt/cheeze-control/portal-control-tokens.json
sudo nano /opt/cheeze-control/portal-control-tokens.json
```

`REPLACE_WITH_SHA256_HEX_OF_REAL_TOKEN` 자리에 생성한 해시를 넣는다.

그 다음 service 파일에서 경로 확인:

```ini
Environment=CHEEZE_PORTAL_TOKEN_REGISTRY=/opt/cheeze-control/portal-control-tokens.json
Environment=CHEEZE_PORTAL_AUDIT_LOG=/opt/cheeze-control/portal-control-audit.log
```

반영:

```bash
sudo systemctl daemon-reload
sudo systemctl restart cheeze-portal-api
```

확인:

```bash
curl http://127.0.0.1:11437/healthz
```

응답에서 `token_registry_configured: true` 가 보여야 한다.

배제한 것:

- 2차 단계에서는 아직 전체 계정 시스템이나 SSO를 도입하지 않는다.
- 2차 단계에서는 내부 control API 자체를 복잡하게 만들지 않고, 정책 판단은 facade 에 둔다.

## 8. 다음 단계

### 3차

- 비동기 job 모델
- 감사 로그 구조화
- rate limit
- 토큰 회전 절차

## 7. 문서 운영 규칙

- 사용자 요청 작업은 `docs/agent-work-log.md` 에 기록한다.
- 오류가 발생하면 원인, 증상, 해결을 함께 기록한다.
- 보안 구조가 바뀌면 이 문서를 갱신한다.
