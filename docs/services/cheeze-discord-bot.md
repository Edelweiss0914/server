# cheeze-discord-bot 기술 명세서

## 개요

cheeze-discord-bot은 Discord 슬래시 명령어를 통해 게임 서버를 제어하는 봇입니다. cheeze-portal-api를 통해 서비스 시작/중지/상태 조회를 수행하며, Discord 역할 기반 접근 제어를 적용합니다.

- **호스트**: Gateway LXC (`100.75.209.83`) 또는 별도 컨테이너
- **프로토콜**: Discord Interactions (슬래시 명령어)
- **역할**: Discord 사용자 권한 검사 후 cheeze-portal-api 호출

---

## 슬래시 명령어

| 명령어 | 설명 | 최소 권한 |
|--------|------|----------|
| `/games` | 전체 게임 서버 상태 조회 | 멤버 이상 |
| `/start <server>` | 지정 서버 시작 | 멤버 이상 |
| `/status <server>` | 지정 서버 상태 확인 | 멤버 이상 |
| `/stop <server>` | 지정 서버 중지 | 관리자만 |

### `<server>` 선택 가능 값

| 값 | 서비스 ID |
|----|----------|
| `minecraft-vanilla` | `minecraft-vanilla` |
| `minecraft-cobbleverse` | `minecraft-cobbleverse` |

---

## 역할 기반 접근 제어

Discord 역할 ID로 권한을 정의합니다.

| 권한 등급 | 환경변수 | 허용 명령어 |
|----------|---------|------------|
| 관리자 | `DISCORD_ADMIN_ROLE_IDS` | 모든 명령어 (`/stop` 포함) |
| 멤버 | `DISCORD_MEMBER_ROLE_IDS` | `/games`, `/start`, `/status` |

- 사용자가 여러 역할을 가진 경우 가장 높은 권한이 적용됩니다.
- 권한 없는 사용자는 에러 메시지를 수신합니다.

---

## 서비스 상태 라벨 (한국어)

봇이 Discord에 표시하는 상태 문자열입니다.

| 내부 상태 | 표시 문자열 |
|----------|------------|
| `offline` | 꺼짐 |
| `starting` | 켜는 중 |
| `running` | 가동 중 |
| `stopping` | 종료 중 |
| `waking` | 깨우는 중 |
| `error` | 오류 |

---

## 토큰 분리

봇은 시작용과 중지용 토큰을 별도로 사용합니다.

| 토큰 | 용도 | 환경변수 |
|------|------|---------|
| Start 토큰 | `/start` 명령어 실행 | `CHEEZE_BOT_START_CONTROL_TOKEN` |
| Stop 토큰 | `/stop` 명령어 실행 | `CHEEZE_BOT_STOP_CONTROL_TOKEN` |

각 토큰은 cheeze-portal-api 토큰 레지스트리에 `allowed_actions`가 각각 `start` 또는 `stop`으로 제한된 `friend` role 토큰으로 등록되어야 합니다.

---

## 설정 (환경변수)

| 환경변수 | 설명 | 기본값 / 예시 |
|----------|------|------|
| `DISCORD_BOT_TOKEN` | Discord 봇 토큰 | *(시크릿)* |
| `DISCORD_APPLICATION_ID` | Discord 애플리케이션 ID | *(시크릿)* |
| `DISCORD_GUILD_ID` | 봇이 운영되는 Discord 서버 ID | *(시크릿)* |
| `DISCORD_ADMIN_ROLE_IDS` | 관리자 역할 ID 목록 (쉼표 구분) | *(시크릿)* |
| `DISCORD_MEMBER_ROLE_IDS` | 멤버 역할 ID 목록 (쉼표 구분) | *(시크릿)* |
| `CHEEZE_PORTAL_API_BASE` | cheeze-portal-api 베이스 URL | `http://127.0.0.1:11437` |
| `CHEEZE_BOT_START_CONTROL_TOKEN` | 서비스 시작 전용 토큰 | *(시크릿)* |
| `CHEEZE_BOT_STOP_CONTROL_TOKEN` | 서비스 중지 전용 토큰 | *(시크릿)* |
| `CHEEZE_BOT_CONTROL_TOKEN` | 레거시 폴백 토큰 (시작/중지 토큰 미설정 시 사용) | *(시크릿)* |
| `CHEEZE_PORTAL_CONTROL_HEADER` | 포털 인증 헤더명 | `X-Cheeze-Control-Token` |
| `CHEEZE_BOT_REQUEST_TIMEOUT` | 포털 API 요청 타임아웃 (초) | `30` |
| `CHEEZE_MANAGED_GAME_SERVERS` | 봇이 제어하는 서버 ID 목록 (쉼표 구분) | `minecraft-vanilla,minecraft-cobbleverse` |

> 모든 시크릿 값은 환경변수 또는 시크릿 관리 시스템으로 주입하세요. 코드나 설정 파일에 평문으로 포함하지 마세요.

---

## 의존성

| 의존 서비스 | 방향 | 설명 |
|-------------|------|------|
| Discord API | 외부 | 슬래시 명령어 수신 및 응답 전송 |
| `cheeze-portal-api` | 하위 | 서비스 상태 조회 및 제어 요청 |

---

## 로그 / 모니터링

- Discord Developer Portal에서 봇 연결 상태 확인 가능
- cheeze-portal-api 감사 로그에서 봇 토큰 ID로 봇 요청 추적 가능
- 봇 프로세스 표준 출력/에러 로그를 systemd 또는 PM2로 수집 권장

```bash
# 봇 프로세스 상태 확인 (systemd 기준)
systemctl status cheeze-discord-bot

# 봇이 보낸 최근 요청 감사 로그 필터링
grep '"token_id":"bot-start"' /var/log/cheeze/audit.jsonl | tail -20 | jq .
```

---

## 트러블슈팅

| 증상 | 원인 | 조치 |
|------|------|------|
| 슬래시 명령어가 Discord에 나타나지 않음 | 명령어 미등록 또는 `DISCORD_GUILD_ID` 오류 | Discord 애플리케이션 명령어 등록 확인, Guild ID 확인 |
| `/start` 실행 시 "권한 없음" 응답 | 사용자 역할 미설정 | `DISCORD_MEMBER_ROLE_IDS`에 해당 역할 ID 추가 확인 |
| `/stop` 실행 시 "권한 없음" 응답 | 관리자 역할 미보유 | `DISCORD_ADMIN_ROLE_IDS`에 해당 역할 ID 추가 확인 |
| 명령어 실행 후 응답 없음 | cheeze-portal-api 연결 실패 | `CHEEZE_PORTAL_API_BASE` 확인, 포털 API 상태 확인 |
| 상태가 항상 "꺼짐"으로 표시 | 포털 API 응답 오류 또는 백엔드 오프라인 | `GET /services` 직접 호출로 상태 확인 |
| 봇 토큰 인증 실패 (401) | 토큰 만료 또는 레지스트리 불일치 | cheeze-portal-api 토큰 레지스트리에서 봇 토큰 확인 |
| 봇이 응답하지 않음 (Discord timeout) | 봇 프로세스 다운 또는 응답 지연 | 봇 프로세스 재시작, 포털 API 응답 시간 확인 |
