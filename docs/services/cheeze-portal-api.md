# cheeze-portal-api 기술 명세서

## 개요

cheeze-portal-api는 CHEEZE 인프라의 공개 파사드(facade) 서비스입니다. 외부 클라이언트(Discord 봇, 웹 프론트엔드 등)가 서비스 제어 명령을 보낼 수 있는 단일 진입점을 제공합니다.

- **호스트**: Gateway LXC (`100.75.209.83`)
- **포트**: `11437`
- **역할**: 토큰 인증, 감사 로그 기록, 시간 제한 적용 후 내부 cheeze-control-api로 요청 프록시

---

## 엔드포인트

### 공개 / 읽기 전용

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| `GET` | `/healthz` | 서비스 헬스체크 | 불필요 |
| `GET` | `/services` | 전체 서비스 상태 목록 | 불필요 (공개) |
| `GET` | `/services/{service_id}` | 개별 서비스 상태 | 불필요 (공개) |

### 서비스 제어 (스코프 토큰 필요)

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| `POST` | `/services/{service_id}/start` | 서비스 시작 | `start` 액션 허용 토큰 |
| `POST` | `/services/{service_id}/stop` | 서비스 중지 | `stop` 액션 허용 토큰 |

### 관리자 전용

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| `GET` | `/services/{service_id}/console` | 콘솔 로그 조회 | `admin` role |
| `POST` | `/services/{service_id}/console` | 콘솔 명령 전송 | `admin` role |
| `POST` | `/host/wake` | WOL로 호스트 깨우기 | wake 액션이 허용된 토큰 |
| `GET` | `/admin/status` | 관리자 대시보드 데이터 | `admin` role |
| `GET` | `/admin/audit` | 감사 로그 조회 | `admin` role |
| `GET` | `/admin/ip-labels` | IP 라벨 목록 조회 | `admin` role |
| `POST` | `/admin/ip-labels` | IP 라벨 추가/수정 | `admin` role |
| `DELETE` | `/admin/ip-labels/{ip}` | IP 라벨 삭제 | `admin` role |

#### `/admin/audit` 쿼리 파라미터

| 파라미터 | 기본값 | 설명 |
|----------|--------|------|
| `limit` | `100` | 반환할 최대 항목 수 |
| `offset` | `0` | 건너뛸 항목 수 (페이지네이션) |

---

## 토큰 시스템

모든 인증 요청에는 HTTP 헤더 `X-Cheeze-Control-Token`에 토큰 값을 포함해야 합니다.

### 토큰 필드 정의

| 필드 | 타입 | 설명 |
|------|------|------|
| `token_id` | string | 토큰 고유 식별자 |
| `label` | string | 사람이 읽을 수 있는 토큰 이름 |
| `role` | string | `admin` 또는 `friend` |
| `allowed_services` | string[] | 접근 허용 서비스 ID 목록 (`*` = 전체) |
| `allowed_actions` | string[] | 허용 액션 목록 (`start`, `stop`, `console` 등) |
| `expires_at` | ISO 8601 | 토큰 만료 시각 (null = 무기한) |
| `revoked_at` | ISO 8601 | 토큰 폐기 시각 (null = 유효) |

토큰 원본값은 SHA-256 해시로 저장됩니다. 실제 토큰 원문은 레지스트리 파일에 저장되지 않습니다.

### role 권한 요약

| role | 서비스 상태 조회 | 서비스 시작/중지 | 콘솔 | WOL | 관리자 API |
|------|:--------------:|:---------------:|:----:|:---:|:----------:|
| `admin` | O | O (제한 없음) | O | O | O |
| `friend` | O | O (스코프 내) | X | X | X |

---

## 시간 제한

특정 서비스에 대해 시작 또는 중지 명령이 차단되는 시간대를 설정할 수 있습니다.

**예시 — Minecraft Cobbleverse:**
- 차단 시간대: 01:00 ~ 10:00 KST (평일만)
- **주말(토/일)에는 시간 제한 미적용** — 서버가 1시 이후에도 계속 가동됨
- 해당 시간대에 `start` 요청 시 `403` 응답 반환

시간 제한은 `cheeze-portal-api` 소스 코드 내 `SERVICE_TIME_RESTRICTIONS`에서 관리됩니다. 현재는 **minecraft-cobbleverse**만 해당됩니다 (평일 01:00 ~ 10:00 KST 시작 차단, 주말 제한 없음).

---

## 감사 로그

모든 제어 요청은 JSON Lines 형식으로 기록됩니다.

### 로그 항목 필드

| 필드 | 설명 |
|------|------|
| `timestamp` | ISO 8601 UTC 시각 |
| `service_id` | 대상 서비스 ID |
| `action` | 수행한 액션 (start, stop, console 등) |
| `result` | 처리 결과 (`rejected`, `forwarded`, `failed`, `error`) |
| `status_code` | HTTP 응답 코드 |
| `token_id` | 요청에 사용된 토큰 ID |
| `token_label` | 토큰 레이블 (사람이 읽을 수 있는 이름) |
| `token_role` | 토큰 역할 (`admin`, `friend` 등) |
| `remote_ip` | 요청자 IP (`CF-Connecting-IP` → `X-Real-IP` → `X-Forwarded-For` → 소켓 주소 순으로 읽음) |
| `user_agent` | 요청자 User-Agent |
| `error` | 오류 발생 시 오류 코드 (없으면 `null`) |

로그 파일 경로는 `CHEEZE_PORTAL_AUDIT_LOG` 환경변수로 지정합니다.

---

## 설정 (환경변수)

| 환경변수 | 설명 | 기본값 / 예시 |
|----------|------|------|
| `CHEEZE_PORTAL_LISTEN_HOST` | 바인딩 호스트 | `127.0.0.1` |
| `CHEEZE_PORTAL_LISTEN_PORT` | 바인딩 포트 | `11437` |
| `CHEEZE_INTERNAL_CONTROL_BASE` | cheeze-control-api 베이스 URL | `http://127.0.0.1:11436` |
| `CHEEZE_PORTAL_TOKEN_REGISTRY` | 토큰 레지스트리 파일 경로 | `/etc/cheeze/tokens.json` |
| `CHEEZE_PORTAL_AUDIT_LOG` | 감사 로그 파일 경로 | `/var/log/cheeze/audit.jsonl` |
| `CHEEZE_PORTAL_CONTROL_TOKEN` | 레거시 단일 토큰 (평문, 토큰 레지스트리 우선) | *(빈 문자열)* |
| `CHEEZE_PORTAL_CONTROL_HEADER` | 인증 헤더명 | `X-Cheeze-Control-Token` |
| `CHEEZE_PORTAL_REQUEST_TIMEOUT` | 내부 control-api 요청 타임아웃 (초) | `210` |
| `CHEEZE_PORTAL_IP_LABELS` | IP 라벨 파일 경로 | `/opt/cheeze-control/portal-ip-labels.json` |
| `CHEEZE_INTERNAL_SECRET` | 내부 서비스 간 인증 시크릿 (X-Cheeze-Internal-Token 헤더로 전달) | *(시크릿)* |

> 시크릿(토큰 원문 등)은 환경변수나 설정 파일에 평문으로 저장하지 마세요.

---

## 의존성

| 의존 서비스 | 방향 | 설명 |
|-------------|------|------|
| `cheeze-control-api` | 하위 | 모든 제어 요청을 내부 API로 프록시 |
| 토큰 레지스트리 파일 | 파일 | JSON 토큰 정의 파일 |
| 감사 로그 파일 | 파일 | JSON Lines 로그 파일 (쓰기 권한 필요) |

cheeze-portal-api는 Gateway LXC에서 실행되며, cheeze-control-api는 동일 LXC의 `localhost`에서 실행됩니다.

---

## 로그 / 모니터링

- **헬스체크**: `GET /healthz` — 응답 `200 OK` 확인
- **감사 로그**: `CHEEZE_PORTAL_AUDIT_LOG` 경로의 JSONL 파일
- **관리자 대시보드**: `GET /admin/status` — 현재 서비스 상태 및 최근 이벤트 요약
- **감사 로그 조회**: `GET /admin/audit?limit=50&offset=0`

```bash
# 최근 감사 로그 10줄 확인
tail -10 /var/log/cheeze/audit.jsonl | jq .
```

---

## 트러블슈팅

| 증상 | 원인 | 조치 |
|------|------|------|
| `401 Unauthorized` | 토큰 누락 또는 해시 불일치 | `X-Cheeze-Control-Token` 헤더 확인, 토큰 레지스트리 확인 |
| `403 Forbidden` | role 부족 또는 시간 제한 | 토큰 role/scope 확인, 현재 시각이 차단 시간대인지 확인 |
| `404 Not Found` | 존재하지 않는 `service_id` | 레지스트리에 등록된 서비스 ID 확인 |
| `429 Too Many Requests` | 큐 초과 (AI 큐 경유 시) | 잠시 후 재시도 |
| `502 Bad Gateway` | cheeze-control-api 응답 없음 | `systemctl status cheeze-control-api` 확인 |
| 감사 로그 기록 안 됨 | 파일 경로 또는 권한 문제 | `CHEEZE_PORTAL_AUDIT_LOG` 경로 및 쓰기 권한 확인 |
| 토큰 만료 오류 | `expires_at` 경과 | 토큰 레지스트리에서 해당 토큰 갱신 또는 재발급 |
