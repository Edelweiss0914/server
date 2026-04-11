# Phase 2 Current Status

작성일: 2026-04-11
목적: 다음 작업에서 바로 참조할 수 있는 실제 배포 상태 기록

## 1. 현재 아키텍처

### Frontend

- Proxmox VE host: `ds-node1`
- Gateway LXC: `CT 200`
- Gateway LXC OS: `Rocky Linux 9.4`
- Gateway LXC 권한: `Privileged`
- Nginx: `1.20.1`
- Public domain:
  - `edelweiss0297.cloud`
  - `cloud.edelweiss0297.cloud`
  - `paperless.edelweiss0297.cloud`
  - `archive.edelweiss0297.cloud`
  - `ollama.edelweiss0297.cloud`

### Backend

- Windows desktop: `homepc`
- OS: `Windows 11 Home 25H2`
- Tailscale: `1.96.3`
- Ollama version (external API check): `0.20.5`

## 2. Tailscale 상태

### Gateway

- Node name: `gateway-lxc`
- Tailscale IPv4: `100.75.209.83`

### Windows backend

- Node name: `homepc`
- Tailscale IPv4: `100.86.252.21`

### 연결 검증 결과

- `tailscale ping` 성공
- 일반 `ping` 성공
- direct path 확인
- `gateway-lxc -> homepc:11434` HTTP 접근 성공

의미:

- `gateway-lxc` 와 `homepc` 간 Tailscale direct overlay가 정상 동작 중이다.

## 3. Ollama 공개 상태

### 직접 API 경로

- 내부 direct path:
  - `http://100.86.252.21:11434`

### 외부 공개 경로

- `https://ollama.edelweiss0297.cloud/api/tags`
- `https://ollama.edelweiss0297.cloud/api/version`

검증 결과:

- `/api/tags` 외부 `200 OK`
- `/api/version` 외부 `200 OK`

주의:

- 루트 `/` 는 웹 UI가 아니라 API 서비스이므로 `404` 또는 비슷한 응답이 나와도 이상하지 않다.

## 4. 메인 페이지 AI 연동 상태

### 현재 사용자 흐름

- 메인 페이지 검색창에 텍스트 입력
- 기존 서비스 카드가 계속 노출
- 결과 상단에 AI 카드 표시:
  - `"(검색어)을 질문하시겠습니까?"`
- 사용자가 AI 카드를 클릭할 때만 AI 요청 실행
- AI 답변 하단에 후속 질문 입력창 제공
- 후속 입력창에서 빈 상태 백스페이스를 눌러도 기존 답변 카드가 사라지지 않도록 수정됨

### 프론트 배포 경로

- `js/app.js`
- `js/services.js`
- `css/style.css`

### 메인 페이지 AI API 경로

- `https://edelweiss0297.cloud/ai/api/generate`

검증 결과:

- 게이트웨이 로컬:
  - `curl -X POST http://127.0.0.1/ai/api/generate -H "Host: edelweiss0297.cloud" ...`
  - 정상 JSON 응답 확인

## 5. 큐 게이트웨이 상태

### 현재 배포 상태

이미 실배포 완료됨.

확인 근거:

- `systemctl status cheeze-ai-queue --no-pager` 정상
- `curl http://127.0.0.1:11435/healthz` 정상
- `home.conf` 의 `/ai/` 가 `http://127.0.0.1:11435/` 로 프록시됨

### 현재 구조

`Browser -> Nginx /ai -> cheeze-ai-queue -> Ollama on homepc`

### 현재 healthz 기준 상태

```json
{"busy": false, "queue_depth": 0, "queue_limit": 2, "upstream": "http://100.86.252.21:11434"}
```

의미:

- 동시 실행: 1개
- 대기열 최대: 2개
- 현재 idle 상태

### 운영 의미

- 동시에 여러 요청이 들어와도 실제 Ollama upstream 호출은 직렬화된다
- 초과 요청은 대기열이 차면 거절될 수 있다
- 목적은 처리량 증가가 아니라 안정성 확보와 GPU 자원 보호다

## 6. Nginx 상태

### `home.conf`

- `edelweiss0297.cloud` 메인 페이지 제공
- `/ai/` location 존재
- 현재 `/ai/` 는 direct Ollama가 아니라 queue gateway(`127.0.0.1:11435`)로 전달

### `ollama.conf`

- `ollama.edelweiss0297.cloud` 서브도메인 제공
- upstream:
  - `100.86.252.21:11434`

## 7. Cloudflare 상태

- `ollama` 터널 레코드 추가 완료
- 외부 API 응답 확인 완료

## 8. GitHub 반영 상태

반영된 주요 커밋:

- `77dba42`
  - 메인 검색창 AI 제안 카드 추가
- `0595fa9`
  - 긴 답변 후 후속 질문 입력 UX 추가
- `4f79ee1`
  - 빈 후속 입력창 백스페이스 시 답변 카드 유지
- `9d02c04`
  - AI queue gateway 자산 추가

브랜치:

- `main`

원격:

- `origin https://github.com/Edelweiss0914/server.git`

## 9. 남은 운영 과제

### 아직 미완료

- Windows Ollama 리소스 제한 환경변수 적용
  - 예: `OLLAMA_NUM_PARALLEL=1`
  - `OLLAMA_MAX_LOADED_MODELS=1`
  - `OLLAMA_KEEP_ALIVE=0`
  - `OLLAMA_MAX_QUEUE=1` 또는 `2`
- Ollama 자동기동/영구화 정리
- queue contention 실제 동시 요청 테스트 결과 기록

### 권고

- 현재 홈서버 규모에서는
  - gateway queue 유지
  - Ollama 병렬성 1
  - loaded model 1
  - keep alive 최소화
  가 가장 안전한 기본값이다.

## 10. 다음 작업용 요약 프롬프트

```text
현재 프로젝트는 Proxmox 기반 홈 클라우드/AI 포털이다.

실제 배포 상태:
- Gateway LXC: CT 200, Rocky Linux 9.4, Privileged, nginx 1.20.1
- Tailscale:
  - gateway-lxc = 100.75.209.83
  - homepc = 100.86.252.21
- direct tailscale path 정상
- Windows Ollama는 0.0.0.0:11434 로 열려 있음
- 외부 API:
  - https://ollama.edelweiss0297.cloud/api/tags 정상
  - https://ollama.edelweiss0297.cloud/api/version 정상
- 메인 페이지 AI:
  - https://edelweiss0297.cloud/ai/api/generate 정상
  - 검색창에 AI 제안 카드 있음
  - 답변 하단 후속 질문 입력창 있음
- gateway queue:
  - cheeze-ai-queue.service 이미 배포 및 실행 중
  - /ai/ -> 127.0.0.1:11435
  - queue_limit=2

남은 주요 과제:
- Windows Ollama 리소스 제한 적용
- Ollama 자동기동/영구화
- queue 동시 요청 스트레스 테스트

참고 문서:
- docs/phase2-current-status.md
- docs/phase2-ai-queue.md
- docs/phase2-tailscale-preflight.md
- docs/phase2-tailscale-implementation.md
```
