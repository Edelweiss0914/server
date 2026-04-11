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

### 요청: 해시 생성 위치와 방법 안내

작업:

- 토큰 해시 생성 절차를 보안 문서에 추가
- 토큰 생성 helper 스크립트 추가

반영 파일:

- `deploy/gateway/generate-control-token.py`
- `docs/security-hardening.md`

결정:

- 해시는 신뢰 가능한 로컬 작업 PC 또는 `gateway-lxc` 에서 생성 가능
- 저장소와 서버 설정에는 평문 토큰이 아니라 `SHA-256` 해시만 저장
- 실제 운영 레지스트리 파일은 `/opt/cheeze-control/portal-control-tokens.json` 으로 둔다

### 요청: 최종 보안 판단과 다음 운영 방향 정리

사용자 결정:

- 레거시 관리자 환경변수 토큰은 직접 제거함
- 이후 토큰 발급은 Discord 봇 기반 단기 토큰으로 가고 싶음
- 토큰 유효시간은 약 3분
- 토큰은 첫 사용 즉시 만료
- 미사용 시 3분 후 만료

추가 요구:

- rate limit 필요
- job 모델 필요
- 관리자 페이지에서 상태/로그 모니터링 필요

문서 반영:

- `docs/security-hardening.md` 에 아래를 추가
  - 레거시 토큰 제거 운영 결정
  - Discord 봇 발급 토큰 방향
  - rate limit 개념과 권장 규칙
  - job 모델 개념과 상태 제안
  - 관리자 페이지 구성 방향
  - 로그 파일 운영 권장안

### 요청: Discord 봇 권장 아키텍처와 gateway-lxc 상태 평가

질문 요지:

- Discord 봇을 어떤 방식으로 두는 게 좋은지
- 1회용 3분 토큰을 당사자 전용으로 만들 수 있는지
- 게임 정보 종합 제공 봇으로 확장 가능한지
- gateway-lxc 가 현재까지 작업 기준으로 과도하게 무거운지

결론:

- Discord 봇은 `gateway-lxc` + `Python` 이 권장
- 게임 상태 종합 제공 기능은 공개 채널
- 민감한 토큰/승인/개인 정보는 DM
- "토큰을 발급받은 당사자만 사용"을 강하게 보장하려면 Discord OAuth 또는 봇 직접 제어 방식이 필요
- 단기적으로는 Discord 봇이 토큰을 발급하기보다 직접 portal facade 에 제어 요청을 대행하는 방식이 더 단순하고 안전
- 현재 gateway-lxc 는 아직 감당 가능한 수준이지만, Discord 봇 + 관리자 페이지 + job 저장소까지 붙으면 분리 시점을 검토해야 함

문서 반영:

- `docs/security-hardening.md` 에 Discord 봇 권장안과 gateway-lxc 상태 판단 추가

### 요청: Discord 봇 구현 준비 정보 정리

사용자 제공 정보:

- Discord 봇은 처음부터 구성해야 함
- 언어는 `Python`
- 초기 대상 서비스는 `minecraft-vanilla` 만
- 자동 종료 시스템은 아직 없음
- `gateway-lxc` 의 현재 제어 경로:
  - `/opt/cheeze-control/cheeze-control-api.py`
  - `/opt/cheeze-control/cheeze-portal-api.py`
  - `/opt/cheeze-control/portal-control-tokens.json`
  - `/opt/cheeze-control/portal-control-audit.log`
- Python 버전은 `3.9.18`

결정:

- Discord 봇은 `gateway-lxc` 에 배치
- 설치 위치는 제어 평면과 가까운 별도 디렉터리 사용을 권장
- 초기 명령 범위는 `minecraft-vanilla` 중심으로 최소화

남은 필수 정보:

- Discord Bot Token
- Guild ID
- 허용할 Role 이름 또는 Role ID
- 봇을 DM 허용 상태로 쓸지 여부

### 요청: Discord 봇 MVP 스캐폴드 구현

작업:

- `gateway-lxc` 배치 기준 Python Discord 봇 골격 추가
- Guild/Role 기반 권한 체크 추가
- `minecraft-vanilla` 전용 `/games`, `/start`, `/status`, `/stop` 명령 추가
- portal facade direct control 방식으로 설계

반영 파일:

- `deploy/discord-bot/cheeze-discord-bot.py`
- `deploy/discord-bot/requirements.txt`
- `deploy/discord-bot/cheeze-discord-bot.service.example`
- `deploy/discord-bot/install-discord-bot.sh.example`
- `docs/discord-bot-setup.md`

현재 필요한 남은 비밀값:

- `DISCORD_BOT_TOKEN`
- `CHEEZE_BOT_CONTROL_TOKEN`

결정:

- 사용자에게 웹 토큰을 발급하는 방식보다, Discord 봇이 직접 portal facade 를 호출하는 direct control 방식을 먼저 구현
- `/stop` 은 자동 종료 정책이 없으므로 관리자 전용

### 요청: Discord 봇 실제 배포 단계로 진행

작업:

- `docs/discord-bot-setup.md` 에 실제 service 예시 추가
- `gateway-lxc` 적용 순서를 복붙 가능한 절차로 정리

현재 남은 사용자 작업:

- `DISCORD_BOT_TOKEN` 실제 값 입력
- `CHEEZE_BOT_CONTROL_TOKEN` 평문 토큰 입력
- `gateway-lxc` 에서 service 실행
- Discord 내 slash command 실기 확인

추가 진행:

- 초기 Discord 초대 실패는 있었지만, 이후 봇 초대 완료
- 다음 확인 단계는 bot 로그인 및 slash command sync 성공 여부

추가 결과:

- `cheeze-discord-bot.service` 는 현재 `active (running)`
- Discord gateway 연결 성공 로그 확인
- 초기 `403 Missing Access` 는 봇 초대 후 해소됨
- 남은 확인은 Discord 클라이언트에서 slash command 노출 및 실제 명령 실행

### 요청: 보안 평가 후 발견 사항 코드 수정

보안 평가 결과 (2026-04-11):

- 전체 위험 수준: MEDIUM
- Critical 0 / High 2 / Medium 4 / Low 3

수행 작업:

1. **[HIGH] 타이밍 공격 차단** (`cheeze-portal-api.py`)
   - `token_matches_record`: `==` → `hmac.compare_digest` 교체
   - 레거시 환경변수 토큰 비교도 동일하게 교체
   - `import hmac` 추가

2. **[HIGH] nginx rate limit 추가** (`home-control-location.conf.example`)
   - `limit_req zone=cheeze_control burst=3 nodelay` 적용
   - `limit_req_status 429` 설정
   - 주석으로 http 블록 `limit_req_zone` 선언 안내 추가

3. **[MEDIUM] service_id 경로 파라미터 검증** (`cheeze-portal-api.py`)
   - `SERVICE_ID_PATTERN = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$')` 추가
   - `valid_service_id()` 함수 추가
   - GET `/services/{id}`, POST `/services/{id}/start|stop` 진입 시 검증
   - 검증 실패 시 `400 invalid_service_id` 반환
   - `import re` 추가

4. **[MEDIUM] /healthz 내부 정보 노출 제거**
   - `cheeze-portal-api.py`: `internal_control_base`, `audit_log_path` 필드 제거
   - `cheeze-control-api.py`: `backend_agent_base`, `wol_mac`, `wol_target_ip`, `wol_target_port` 필드 제거

5. **[MEDIUM] 프론트엔드 XSS 방지** (`js/app.js`)
   - `renderResultCard`: `service.url`, `service.name`, `service.nameKo`, `service.description`, `service.category`, `urlDisplay` 에 `escapeHtml` 적용
   - `renderQuickCard`: `service.url`, `service.description`, `service.nameKo`, `service.name` 에 적용
   - `renderControlCard`: `service.id`, `service.name`, `service.nameKo`, `service.category`, `service.description` 에 적용

검증:

- `python -m py_compile deploy/gateway/cheeze-control-api.py deploy/gateway/cheeze-portal-api.py` → OK
- `node --check js/app.js` → OK
- `python -m unittest deploy/gateway/test_cheeze_control_api.py deploy/gateway/test_cheeze_portal_api.py` → 17건 OK

남은 항목 (미수정):

- **[MEDIUM]** 내부 control API(11436) 공유 비밀 헤더 인증 — 인프라 변경 필요, 별도 수행
- **[LOW]** 감사 로그 append-only 권한 (`chattr +a`) — 서버 배포 시 적용
- **[LOW]** nginx 보안 헤더 (`X-Frame-Options` 등) — 상위 nginx 설정에서 확인 필요

### 요청: window.prompt() 토큰 입력을 커스텀 모달로 교체

작업:

- `index.html`: `</body>` 바로 위에 native `<dialog>` 기반 토큰 입력 모달 추가
  - 자물쇠 SVG 아이콘 + 제목("제어 토큰 확인") + 동적 부제(`id="tokenDialogSub"`)
  - 비밀번호 input (`id="tokenInput"`) + 눈 아이콘 토글 버튼 (`id="tokenEyeBtn"`)
  - 취소/확인 버튼 (`id="tokenCancelBtn"`, `id="tokenConfirmBtn"`)

- `css/style.css`: 파일 끝에 `/* ─── 토큰 입력 모달 ─── */` 블록 추가
  - `.token-dialog`: `position:fixed; inset:0; margin:auto; width:min(420px, calc(100vw - 32px))`
  - `::backdrop`: `rgba(0,0,0,0.45)` + `backdrop-filter:blur(3px)` + 페이드인 애니메이션
  - `@keyframes token-dialog-in`: `translateY(14px) scale(0.97)` → none
  - `.token-input`: 포커스 시 `border-color:var(--border-focus)` + `box-shadow:0 0 0 4px rgba(79,127,255,.12)`
  - CSS 변수만 사용하여 다크/라이트 테마 자동 대응

- `js/app.js`: `promptForControlActionToken` + `resolveControlActionToken` 교체
  - `showTokenDialog(serviceName, action)` 추가: Promise 반환, 이벤트 정리 포함
  - `resolveControlActionToken(serviceName, action)` async 함수로 교체
  - `invokeControlAction` 내 호출 부분을 `await resolveControlActionToken(service.name, action)` 으로 변경

검증:

- `node --check js/app.js` → SYNTAX OK

### 요청: gateway-lxc 서비스 배포 후 /healthz 내부 정보 노출 확인

오류 기록:

1. 증상:
   - `git pull` 후 `systemctl restart` 해도 `/healthz` 응답에 `internal_control_base`, `audit_log_path` 가 계속 노출됨

2. 원인:
   - 서비스는 `/opt/cheeze-control/cheeze-portal-api.py` 를 직접 실행
   - `git pull` 은 `/var/www/home/deploy/gateway/cheeze-portal-api.py` 만 업데이트
   - 배포 시 `/opt/cheeze-control/` 으로 파일을 복사하는 단계가 누락됨

3. 해결:
   - `cp /var/www/home/deploy/gateway/cheeze-portal-api.py /opt/cheeze-control/cheeze-portal-api.py`
   - `sudo systemctl restart cheeze-portal-api`

4. 교훈:
   - git pull 이후 반드시 `/opt/cheeze-control/` 으로 파일 복사 필요
   - `install-portal-api.sh.example` 스크립트를 참고하여 배포 절차 준수

### 요청: 유효한 Discord 봇 토큰 노출 정리 및 저장 방식 수정

사용자 추가 정보:

- Discord 봇은 이미 서버에 배포되어 있음
- slash command 테스트도 완료된 상태임

오류 기록:

1. 증상:
   - 유효한 `DISCORD_BOT_TOKEN` 이 로컬 agent 로그에 평문으로 남아 있었음
   - 봇 배포 예시가 systemd service 파일 본문에 비밀값을 직접 넣는 흐름으로 작성되어 있었음

2. 원인:
   - 이전 대화 입력이 `.omx/logs/turns-2026-04-11.jsonl` 에 그대로 기록됨
   - `deploy/discord-bot/cheeze-discord-bot.service.example` 와 `docs/discord-bot-setup.md` 가 inline `Environment=` 예시를 사용함

3. 해결:
   - `.omx/logs/turns-2026-04-11.jsonl` 의 실제 Discord 봇 토큰 값을 로컬에서 마스킹
   - `deploy/discord-bot/cheeze-discord-bot.service.example` 를 `EnvironmentFile=/etc/cheeze-bot/cheeze-discord-bot.env` 방식으로 변경
   - `deploy/discord-bot/cheeze-discord-bot.env.example` 추가
   - `deploy/discord-bot/install-discord-bot.sh.example` 에 env 파일 생성 및 `chmod 600` 처리 추가
   - `docs/discord-bot-setup.md` 를 env 파일 기준으로 수정하고, 이미 배포된 봇의 secret migration 절차 반영
   - `docs/security-hardening.md` 에 Discord 봇 비밀값 취급 규칙 추가

### 요청: Cobblemon 모드팩 작업 착수

작업:

- 범용 modpack 템플릿 대신 `minecraft-cobbleverse` 전용 스캐폴드 추가
- backend agent / orchestrator 예시 설정에 Cobblemon 서비스 항목 추가
- 제어 스크립트 예시와 문서에 Cobblemon 기준 경로/포트/메모리 시작값 반영

반영 파일:

- `deploy/backend/minecraft-cobbleverse/start.ps1.example`
- `deploy/backend/minecraft-cobbleverse/run.ps1.example`
- `deploy/backend/minecraft-cobbleverse/stop.ps1.example`
- `deploy/backend/cheeze-backend-agent-config.example.json`
- `deploy/orchestrator/service-registry.example.json`
- `deploy/backend/minecraft-control-plan.md`
- `docs/orchestrator-current-status.md`

결정:

- 서비스 ID는 `minecraft-cobbleverse`
- 기본 경로는 `D:\Servers\Minecraft\Modpacks\cobbleverse_server_1.7.3`
- 제어 경로는 `D:\Servers\Control\minecraft-cobbleverse`
- 기본 포트는 `25566`
- 메모리 예시는 `6G/6G` 로 두되, 실제 서버팩 기준으로 재확정 필요
- 실행 진입점은 `fabric-server-launch.jar` 기준으로 맞춤

### 요청: Cobbleverse 1.7.3 서버팩 실서비스 기동

작업:

- `cobbleverse_server_1.7.2` 를 기준으로 `D:\Servers\Minecraft\Modpacks\cobbleverse_server_1.7.3` 생성
- `COBBLEVERSE-1.7.31-CF.zip` 의 `overrides` 에서 서버용 변경분 선별 반영
- live backend agent 설정 파일 `D:\Servers\Control\backend-agent\config.json` 에 `minecraft-cobbleverse` 서비스 추가
- `D:\Servers\Control\minecraft-cobbleverse` 제어 스크립트 생성
- live 기동 실패 원인을 단계별로 수정 후 재검증

오류 기록:

1. 증상:
   - 첫 기동 시 `tmcraft 1.7.3` 와 `Cobblemon 1.7.1`, `capturexp 1.7.1`, `tim_core 1.7.1` 버전 충돌
   - Java 25 실행으로 `Cobblemon 1.7.3` 요구 조건 불일치
   - `COBBLEVERSE-DP-v19-CF.zip` 내 `lumymon:music.raid` 참조로 biome 데이터팩 로드 실패
   - 이후 일부 레시피가 `zamega:*`, `lumymon:*` 항목을 참조하면서 초기 로드 경고 발생

2. 원인:
   - client overrides 일부만 반영한 상태에서 핵심 1.7.3 서버 의존성 jar가 누락됨
   - live `run.ps1` 가 `java-runtime-epsilon` (Java 25) 를 가리킴
   - 서버 데이터팩에 서버 환경에 없는 사운드 이벤트 참조가 포함됨
   - live backend config 파일을 BOM 포함 UTF-8로 다시 쓰면서 agent가 설정 파싱 중 실패

3. 해결:
   - Modrinth CDN에서 아래 jar를 직접 받아 교체
     - `Cobblemon-fabric-1.7.3+1.21.1.jar`
     - `capturexp-fabric-1.7.3-1.3.0.jar`
     - `timcore-fabric-1.7.3-1.31.0.jar`
   - 구버전 jar 제거
     - `Cobblemon-fabric-1.7.1+1.21.1.jar`
     - `capturexp-fabric-1.7.1-1.3.0.jar`
     - `timcore-fabric-1.7.1-1.27.0.jar`
   - live `D:\Servers\Control\minecraft-cobbleverse\run.ps1` 를 Java 21 경로로 수정
     - `java-runtime-delta` 사용
   - `COBBLEVERSE-DP-v19-CF.zip` 를 서버용 폴더 데이터팩으로 풀고 `raid_den.json` 의 `music` 항목 제거
   - duplicate `extra/Terralith-DP.zip` 제거
   - live backend config를 BOM 없는 UTF-8로 다시 저장
   - backend agent 상태 판정 로직은 control PID 파일 우선 방식으로 개선

검증:

- `http://127.0.0.1:5010/services` 에서 `minecraft-cobbleverse` 가 `running`
- `netstat -ano | findstr :25566` 에서 `LISTENING`
- `latest.log` 에서 아래 확인
  - `Starting Minecraft server on *:25566`
  - `Done (...)!`

현재 결과:

- `minecraft-cobbleverse` 서비스가 실제로 기동됨
- backend agent 기준 `ready=true`, `state=running`

### 요청: Cobbleverse를 홈페이지 UI와 WOL 흐름에 연결

작업:

- `js/services.js` 에 검색/빠른접근용 `minecraft-cobbleverse` 항목 추가
- 홈페이지 on-demand control 카드 설정에 `minecraft-cobbleverse` 추가
- 기존 `minecraft-vanilla` 와 동일한 카드 템플릿, 토큰 입력, 상태 폴링, start/stop 버튼 흐름 재사용
- 문서에 Cobbleverse도 동일한 WOL-aware start 경로를 탄다는 점 기록

결과:

- 홈페이지에서 `Minecraft Vanilla` 와 같은 방식으로 `Cobbleverse` 카드가 노출됨
- `시작` 버튼은 동일하게 `portal facade -> control API -> backend agent` 경로를 사용
- backend가 잠들어 있으면 gateway WOL 후 서비스 시작을 이어가는 동일 흐름을 적용

### 요청: 현재까지 작업 전부를 내일 이어갈 수 있게 문서화

작업:

- 현재 실제 Cobbleverse 상태를 기준으로 handoff 문서 신규 작성
- 재개 프롬프트 `docs/restart-handoff-prompt.md` 를 Cobbleverse 포함 최신 상태로 갱신
- `docs/orchestrator-current-status.md` 에 Cobbleverse 현재 상태와 내일 작업 포인트 반영

반영 파일:

- `docs/cobbleverse-handoff-2026-04-12.md`
- `docs/restart-handoff-prompt.md`
- `docs/orchestrator-current-status.md`

현재 확정 상태:

- Cobbleverse 서버는 실기동 성공 기록이 있음
- 실제 접속 로그도 남아 있음
- 현재 시점에는 사용자 요청으로 서버를 내려 둔 상태
- 다음 세션의 핵심 작업은 homepage 실배포와 WOL end-to-end 검증
