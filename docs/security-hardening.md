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

2026-04-11 운영 결정:

- 레거시 관리자 환경변수 토큰은 제거했다.
- 이후 운영 기준은 registry 기반 토큰만 사용한다.

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

## 8. 2026-04-11 보안 수정 반영 (3차)

### 수정 완료

#### [HIGH] 타이밍 공격 차단

- `cheeze-portal-api.py`
  - `token_matches_record`: `==` 비교 → `hmac.compare_digest` 교체
  - 레거시 환경변수 토큰 비교도 동일 적용
- 근거: Python `==` 문자열 비교는 첫 불일치 바이트에서 즉시 반환하므로 응답 시간 차이로 해시 추론 가능

#### [HIGH] nginx rate limit 추가

- `home-control-location.conf.example`
  - `limit_req zone=cheeze_control burst=3 nodelay` 추가
  - `limit_req_status 429` 추가
- 서버 nginx `http {}` 블록에 아래 선언 필요:
  ```nginx
  limit_req_zone $binary_remote_addr zone=cheeze_control:10m rate=5r/m;
  ```

#### [MEDIUM] service_id 경로 파라미터 검증

- `cheeze-portal-api.py`
  - `^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$` 패턴 검증 추가
  - GET/POST 모든 service_id 진입 경로에 적용
  - 실패 시 `400 invalid_service_id`

#### [MEDIUM] /healthz 내부 정보 노출 제거

- `cheeze-portal-api.py`: `internal_control_base`, `audit_log_path` 제거
- `cheeze-control-api.py`: `backend_agent_base`, `wol_mac`, `wol_target_ip`, `wol_target_port` 제거

#### [MEDIUM] 프론트엔드 XSS 방지

- `js/app.js`
  - `renderResultCard`, `renderQuickCard`, `renderControlCard` 의 서비스 텍스트 속성 전체에 `escapeHtml` 적용
  - 대상: `service.url`(href), `service.name`, `service.nameKo`, `service.description`, `service.category`, `service.id`(data 속성)

### 미완료 항목 (다음 단계)

- **[MEDIUM]** 내부 control API(11436) 공유 비밀 헤더 인증 — 서버 배포 변경 필요
- **[LOW]** 감사 로그 append-only 권한 (`chattr +a /opt/cheeze-control/portal-control-audit.log`)
- **[LOW]** nginx 보안 헤더 (`X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `CSP`)

## 9. 다음 단계

### 4차

- 비동기 job 모델
- 감사 로그 구조화
- 토큰 회전 절차
- Discord 봇 단기 토큰 발급

## 9. 다음 보안/운영 방향

### Discord 발급 토큰

희망 운영 방향:

- Discord 봇이 제어 토큰을 발급한다.
- 발급된 토큰은 약 3분간만 유효하다.
- 토큰은 첫 사용 즉시 만료된다.
- 3분이 지나도 미사용이면 자동 만료된다.
- 수동 폐기는 registry 에서 삭제 또는 `revoked_at` 설정으로 처리한다.

권장 구현 방식:

1. Discord 봇은 평문 토큰 1개를 생성한다.
2. 봇은 `token_hash`, `expires_at`, `allowed_services`, `allowed_actions`, `use_once=true` 성격의 항목을 registry 저장소에 기록한다.
3. portal facade 는 성공적으로 허용된 첫 요청 직후 해당 토큰을 삭제하거나 `revoked_at` 을 기록한다.
4. 만료된 토큰은 주기적으로 정리한다.

실무 메모:

- 단순 운영이라면 "삭제"만으로도 사실상 폐기다.
- 감사 목적을 남기고 싶으면 즉시 삭제보다 `revoked_at` 기록 후 주기 정리가 더 낫다.

### Rate Limit

목적:

- 누군가가 반복적으로 `start/stop/wake` 를 때려서 서비스나 host를 흔드는 것을 막는다.

개념:

- 같은 토큰이 짧은 시간에 너무 많이 요청하면 차단
- 같은 IP가 짧은 시간에 너무 많이 요청하면 차단
- 같은 서비스에 연속 `start` 요청이 들어오면 차단

권장 1차 규칙:

- 토큰별 `start/stop/wake` : 1분당 3회 이하
- IP별 `start/stop/wake` : 1분당 10회 이하
- 같은 서비스 `start` : 진행 중이면 추가 요청 거부

응답:

- 초과 시 `429 Too Many Requests`
- 응답 본문에 재시도까지 남은 시간 포함

### Job Model

목적:

- `wake -> boot wait -> backend agent wait -> service start` 같은 긴 작업을 브라우저 요청 한 번에 묶지 않는다.

개념:

지금:

```text
브라우저가 start 요청 -> 응답이 끝날 때까지 오래 대기
```

job 모델:

```text
브라우저가 start 요청 -> 서버는 job_id 즉시 반환
브라우저는 /jobs/{id} 상태만 조회
실제 wake/start 작업은 서버 내부에서 계속 진행
```

장점:

- nginx timeout 의존성이 줄어든다.
- 브라우저가 중간에 끊겨도 작업이 계속된다.
- 관리자 페이지에서 작업 진행률을 보여주기 쉽다.

권장 job 상태:

- `queued`
- `waking`
- `waiting_backend`
- `starting_service`
- `running`
- `failed`

### 관리자 페이지

희망 방향:

- 웹 UI에서 웹서비스, 게임서버, AI, 각종 API 상태를 모니터링
- 제어 작업과 감사 로그도 함께 확인

권장 화면 구성:

1. Host 요약
- `gateway-lxc`
- `homepc`
- host online/offline
- last wake

2. Service 패널
- `ollama`
- `minecraft-vanilla`
- 이후 서비스들
- state, last action, last change time

3. Job 패널
- 최근 start/stop/wake 작업
- 진행 중 작업
- 실패 원인

4. Audit 패널
- 누가 어떤 토큰으로 무엇을 했는지
- 성공/거부/실패

### 로그 파일 운영

권장안:

1. 로그 분리
- 감사 로그: `portal-control-audit.log`
- 애플리케이션 에러 로그: systemd journal 또는 별도 앱 로그
- job 로그: job 모델 도입 후 별도 파일 또는 상태 저장소

2. 회전
- `logrotate` 사용
- 일 단위 또는 크기 기준 회전
- 최근 14~30개 보관

3. 형식
- JSON Lines 유지
- 한 줄 = 한 이벤트
- 관리자 페이지는 이 파일을 읽거나, 나중에 sqlite로 옮긴다.

4. 보관 정책
- 감사 로그는 최소 30일 이상 권장
- 에러 로그는 짧게 보관해도 무방

5. 장기 방향
- 처음에는 JSONL 파일
- 관리자 페이지와 검색이 중요해지면 sqlite 로 이전

## 7. 문서 운영 규칙

- 사용자 요청 작업은 `docs/agent-work-log.md` 에 기록한다.
- 오류가 발생하면 원인, 증상, 해결을 함께 기록한다.
- 보안 구조가 바뀌면 이 문서를 갱신한다.
