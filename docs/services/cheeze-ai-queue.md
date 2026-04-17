# cheeze-ai-queue 기술 명세서

## 개요

cheeze-ai-queue는 Ollama AI 요청을 직렬화하는 큐 서비스입니다. 동시에 여러 AI 요청이 들어올 때 순서대로 처리하여 Ollama 서버의 과부하를 방지하고, Ollama가 오프라인 상태이면 자동으로 시작 요청을 보냅니다.

- **호스트**: Gateway LXC (`100.75.209.83`)
- **포트**: `11435`
- **역할**: AI 요청 직렬화, Ollama 자동 시작, 큐 초과 시 429 반환

---

## 엔드포인트

### 상태

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/healthz` | 큐 서비스 상태 및 큐 깊이 확인 |

#### `/healthz` 응답 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `queue_depth` | int | 현재 대기 중인 요청 수 |
| `queue_limit` | int | 최대 허용 큐 깊이 |
| `busy` | bool | 워커가 현재 요청을 처리 중인지 여부 |
| `upstream` | string | Ollama 업스트림 URL 및 상태 |

### AI 요청 (Ollama 프록시)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/generate` | AI 생성 요청 (자동 시작 없이 Ollama로 전달만 함) |
| `POST` | `/api/generate` | AI 생성 요청 (Ollama 오프라인 시 자동 시작 후 전달) |
| `GET` | `/api/tags` | 사용 가능한 모델 목록 |
| `POST` | `/api/tags` | 모델 목록 (요청 바디 포함) |
| `GET` | `/api/version` | Ollama 버전 정보 |

모든 `/api/*` 요청은 Ollama 업스트림으로 프록시됩니다. 큐에 여유가 있으면 대기열에 추가되고, 초과 시 즉시 `429 Too Many Requests`를 반환합니다.

---

## 큐 동작

| 항목 | 값 |
|------|----|
| 최대 큐 깊이 | `CHEEZE_AI_MAX_QUEUE` (기본 `2`) |
| 워커 수 | `1` (직렬 처리) |
| 큐 초과 시 | `429 Too Many Requests` 즉시 반환 |

### 처리 흐름

```
클라이언트 요청
  └─ 큐 여유 있음? ──No──→ 429 반환
       │ Yes
       ▼
  대기열 추가
       │
       ▼
  워커가 요청 처리
       │
  Ollama 업스트림 확인
       ├─ 온라인 → 요청 전달 → 응답 반환
       └─ 오프라인 (POST /api/generate만) → cheeze-control-api /services/ollama/start 호출
                       └─ Ollama 준비 대기 (CHEEZE_AI_OLLAMA_START_TIMEOUT 초)
                            ├─ 준비 완료 → 요청 전달 → 응답 반환
                            └─ 타임아웃 → 503 반환
```

---

## Ollama 자동 시작

`POST /api/generate` 요청 시 Ollama(`cheeze-backend-agent` 관리)가 오프라인이면:

1. **cheeze-control-api** (`CHEEZE_AI_BACKEND_BASE`, 기본 `http://127.0.0.1:11436`)의 `/services/ollama/start` 엔드포인트를 호출합니다.
   - `X-Cheeze-Internal-Secret` 헤더에 `CHEEZE_INTERNAL_SECRET` 값을 포함합니다.
2. Ollama 업스트림이 응답할 때까지 `CHEEZE_AI_OLLAMA_POLL_INTERVAL`마다 폴링합니다.
3. 준비 완료 후 원래 요청을 Ollama로 전달합니다.
4. `CHEEZE_AI_OLLAMA_START_TIMEOUT` 내에 준비되지 않으면 `503`을 반환합니다.

`GET /api/generate`는 자동 시작 없이 Ollama로 바로 전달만 합니다.

> 자동 시작 인증은 포털 토큰이 아니라 **내부 시크릿** (`CHEEZE_INTERNAL_SECRET`, `X-Cheeze-Internal-Secret` 헤더)을 사용합니다.

---

## 설정 (환경변수)

| 환경변수 | 설명 | 기본값 |
|----------|------|------|
| `CHEEZE_AI_LISTEN_HOST` | 바인딩 호스트 | `127.0.0.1` |
| `CHEEZE_AI_LISTEN_PORT` | 바인딩 포트 | `11435` |
| `CHEEZE_AI_UPSTREAM` | Ollama 업스트림 베이스 URL | `http://100.86.252.21:11434` |
| `CHEEZE_AI_MAX_QUEUE` | 최대 큐 깊이 | `2` |
| `CHEEZE_AI_TIMEOUT` | 요청 최대 대기 시간 (초) | `360` |
| `CHEEZE_AI_BACKEND_BASE` | cheeze-control-api 베이스 URL (Ollama 자동 시작용) | `http://127.0.0.1:11436` |
| `CHEEZE_INTERNAL_SECRET` | 내부 인증 시크릿 (X-Cheeze-Internal-Secret 헤더로 전달) | *(시크릿)* |
| `CHEEZE_AI_OLLAMA_START_TIMEOUT` | Ollama 자동 시작 대기 타임아웃 (초) | `120` |
| `CHEEZE_AI_OLLAMA_POLL_INTERVAL` | Ollama 준비 폴링 간격 (초) | `3` |

> 내부 시크릿(`CHEEZE_INTERNAL_SECRET`)은 환경변수로 관리하세요. 평문으로 코드에 포함하지 마세요.

---

## 의존성

| 의존 서비스 | 방향 | 설명 |
|-------------|------|------|
| Ollama | 하위 | AI 요청 처리 업스트림 |
| `cheeze-control-api` | 하위 | Ollama 자동 시작 요청 경로 (`127.0.0.1:11436`) |
| `cheeze-backend-agent` | 간접 | Ollama 프로세스 실제 관리 주체 |

---

## 로그 / 모니터링

- **헬스체크**: `GET /healthz` — `queue_depth`, `busy`, `upstream` 상태 확인
- 큐가 지속적으로 가득 찬 경우(`queue_depth == queue_limit`) 처리 속도 저하 또는 클라이언트 과다 요청 가능성

```bash
# 큐 상태 확인
curl http://100.75.209.83:11435/healthz | jq .

# 모델 목록 확인
curl http://100.75.209.83:11435/api/tags | jq .
```

---

## 트러블슈팅

| 증상 | 원인 | 조치 |
|------|------|------|
| `429 Too Many Requests` | 큐가 가득 참 | 잠시 후 재시도; `CHEEZE_AI_MAX_QUEUE` 값 검토 |
| `503 Service Unavailable` | Ollama 자동 시작 타임아웃 | `CHEEZE_AI_TIMEOUT` 값 늘리기; 백엔드 PC 상태 확인 |
| `/healthz`에서 `upstream` 오프라인 | Ollama 미실행 또는 백엔드 오프라인 | 백엔드 에이전트 상태 확인 (`GET /services/ollama`) |
| 요청이 큐에서 오래 대기 | 앞선 요청의 처리 시간이 긴 경우 | 모델 크기 또는 `CHEEZE_AI_TIMEOUT` 확인 |
| 자동 시작이 동작하지 않음 | `CHEEZE_INTERNAL_SECRET` 불일치 또는 control-api 미응답 | `CHEEZE_AI_BACKEND_BASE` 및 `CHEEZE_INTERNAL_SECRET` 환경변수 확인, cheeze-control-api 상태 확인 |
