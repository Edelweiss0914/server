# Agent Work Log

작성일: 2026-04-11
목적: 사용자 요청, 수행 작업, 발생 오류, 해결 내용을 누적 기록한다.

## 기록 규칙

- 각 사용자 요청은 날짜 기준으로 남긴다.
- 오류가 있으면 증상, 원인, 해결을 함께 기록한다.
- 보안 관련 변경은 `docs/security-hardening.md` 와 함께 갱신한다.

---

## 2026-04-11

### 요청: WOL 미동작 및 시작 시 `Unexpected` 계열 오류 조사

작업:

- gateway control API와 프런트 제어 흐름 점검
- `wakeonlan` 호출 인자와 시작 응답 파싱 경로 점검
- 게이트웨이 테스트 추가

오류 기록:

1. 증상:
   - 절전 상태에서 WOL이 동작하지 않음
   - 시작 시 브라우저에서 `Unexpected` 계열 오류가 노출될 수 있었음

2. 원인:
   - `wakeonlan` 이 하이픈(`-`) 구분 MAC 주소를 거부
   - gateway가 비JSON 응답을 바로 `json.loads()` 하면서 실패 가능

3. 해결:
   - `deploy/gateway/cheeze-control-api.py`
     - MAC 주소를 `:` 형식으로 정규화
     - WOL 브로드캐스트 타깃을 환경변수로 설정 가능하게 변경
     - 비JSON backend 응답을 안전하게 요약 처리
   - `deploy/gateway/test_cheeze_control_api.py`
     - MAC 정규화, WOL 명령 생성, 비JSON 응답 처리 테스트 추가
   - `js/app.js`
     - control 오류를 더 구체적인 메시지로 정규화

검증:

- `python -m unittest deploy/gateway/test_cheeze_control_api.py`
- gateway-lxc 실기 검증에서 `/host/wake` 가 `202 Accepted` 로 전환됨

### 요청: 공개 웹페이지에 노출된 백엔드 호출 구조 개편

작업:

- 현재 문서 아키텍처와 실제 배포 구조 비교
- 공개 포털과 내부 제어 평면을 분리하는 최소 개편 방향 결정
- 공개 facade 스캐폴드 구현 시작

결정:

- 내부 `cheeze-control-api` 는 localhost 내부용으로 유지
- 공개 브라우저는 새 `portal facade` 만 호출
- 쓰기 동작(`start`, `stop`, `wake`)은 관리자 제어 토큰 필요

현재 반영 파일:

- `deploy/gateway/cheeze-portal-api.py`
- `deploy/gateway/cheeze-portal-api.service.example`
- `deploy/gateway/install-portal-api.sh.example`
- `deploy/gateway/test_cheeze_portal_api.py`
- `deploy/gateway/home-control-location.conf.example`
- `js/services.js`
- `js/app.js`

검증:

- `python -m unittest deploy/gateway/test_cheeze_control_api.py deploy/gateway/test_cheeze_portal_api.py`
- `python -m py_compile deploy/gateway/cheeze-control-api.py deploy/gateway/cheeze-portal-api.py`
- `node --check js/app.js`
- `node --check js/services.js`

남은 확인:

- gateway-lxc 에 새 portal facade 배포
- nginx 공개 경로를 `/api/control/` 로 전환
- 관리자 토큰 설정 후 브라우저 제어 검증

### 요청: 이후 작업과 오류/해결을 문서에 계속 기록

작업:

- 이 로그 문서 추가
- 보안 변경 추적용 `docs/security-hardening.md` 추가
- 이후 요청 시 로그를 계속 누적하도록 작업 기준 고정

### 요청: gateway-lxc nginx 공개 경로 최종 점검

작업:

- `home.conf` 의 공개 제어 프록시 대상 점검
- 새 공개 facade 포트와 내부 control API 포트 구분 확인

오류 기록:

1. 증상:
   - nginx 공개 경로를 `/api/control/` 로 바꾸는 과정에서 잘못된 upstream 포트가 들어갈 수 있음

2. 원인:
   - 공개 facade 는 `127.0.0.1:11437` 이어야 하는데 내부 control API 포트 `11436` 으로 연결하면 구조 분리가 무너짐

3. 해결:
   - `home.conf` 의 `/api/control/` 는 반드시 `proxy_pass http://127.0.0.1:11437/;` 로 설정
   - 내부 `cheeze-control-api` 는 계속 `127.0.0.1:11436` 에 유지

추가 오류 기록:

1. 증상:
   - `curl http://127.0.0.1/api/control/services` 가 `404 Not Found`

2. 원인:
   - nginx `server_name` 이 `edelweiss0297.cloud` 인 상태에서 `Host: 127.0.0.1` 요청을 보내면 다른 서버 블록으로 매칭될 수 있음

3. 해결:
   - 외부 공개 경로 검증은 실제 도메인으로 호출하거나 `Host: edelweiss0297.cloud` 헤더를 넣고 확인

### 요청: 종료 동작에도 토큰이 필요한지 정책 확인

결정:

- 1차 보안 단계에서는 `stop` 도 토큰이 필요하다.

이유:

- `stop` 역시 서비스 중단을 일으키는 파괴적 제어 동작이다.
- 공개 웹에서 무인증 `stop` 이 가능하면 악의적 서비스 중단이 가능해진다.
- 2차 단계에서 토큰 범위(`start`만 허용, `stop` 금지 등)를 서비스별로 나눌 수 있다.

### 요청: 2차 보안 진행

작업:

- portal facade 에 다중 토큰 레지스트리 검증 추가
- 서비스/액션 범위 제한 추가
- 만료/폐기 토큰 차단 추가
- 감사 로그 append 추가
- 토큰 레지스트리 예시 파일 추가

현재 반영 파일:

- `deploy/gateway/cheeze-portal-api.py`
- `deploy/gateway/test_cheeze_portal_api.py`
- `deploy/gateway/portal-control-tokens.example.json`
- `deploy/gateway/cheeze-portal-api.service.example`
- `deploy/gateway/install-portal-api.sh.example`
- `docs/security-hardening.md`

구현 내용:

- 레거시 관리자 환경변수 토큰은 하위호환 유지
- 레지스트리 파일 기반 토큰 검증 추가
- 토큰별 `allowed_services`, `allowed_actions`, `expires_at`, `revoked_at` 지원
- `timestamp`, `token_id`, `service_id`, `action`, `remote_ip`, `user_agent`, `result` 를 감사 로그에 남김

검증:

- `python -m unittest deploy/gateway/test_cheeze_control_api.py deploy/gateway/test_cheeze_portal_api.py`
- `python -m py_compile deploy/gateway/cheeze-control-api.py deploy/gateway/cheeze-portal-api.py`

남은 확인:

- gateway-lxc 에 실제 토큰 레지스트리 파일 배포
- 레거시 단일 관리자 토큰을 계속 유지할지, registry-only 로 전환할지 운영 결정
- 브라우저에서 제한 토큰 사용 시 허용/거부 동작 실기 확인
