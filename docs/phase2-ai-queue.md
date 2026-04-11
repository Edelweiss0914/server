# Phase 2 AI Queue Control

작성일: 2026-04-11

## 목적

현재 메인 페이지의 `/ai/api/generate` 요청은 게이트웨이에서 Windows `Ollama` 로 직접 전달된다. 이 상태에서는 여러 사용자가 동시에 요청을 보내면 GPU/VRAM 사용량이 급증하거나 응답 지연이 커질 수 있다.

이를 막기 위해 게이트웨이에 `단일 worker + 제한된 대기열` 구조를 둔다.

## 권장 구조

`Browser -> Nginx /ai -> cheeze-ai-queue.py -> Ollama on Windows`

이 구조의 효과:

- 동시에 여러 요청이 와도 실제 upstream 호출은 한 번에 하나만 수행
- 대기열 길이를 제한해 폭주 방지
- 큐가 가득 차면 `429` 반환
- 제어 지점을 게이트웨이에 두므로 프런트 우회 호출보다 안전

## 포함 파일

- `deploy/gateway/cheeze-ai-queue.py`
- `deploy/gateway/cheeze-ai-queue.service.example`
- `deploy/gateway/home-ai-location-queued.conf.example`

## 기본 동작

- `/api/generate`, `/api/tags`, `/api/version` 만 노출
- 한 번에 한 요청만 upstream 전달
- 기본 큐 길이: `2`
- 큐가 가득 차면:

```json
{
  "error": "queue_full",
  "message": "AI is busy right now. Please retry shortly.",
  "queue_limit": 2
}
```

## 배포 예시

게이트웨이에서:

```bash
mkdir -p /opt/cheeze-ai
cp cheeze-ai-queue.py /opt/cheeze-ai/cheeze-ai-queue.py
chmod +x /opt/cheeze-ai/cheeze-ai-queue.py

cp cheeze-ai-queue.service.example /etc/systemd/system/cheeze-ai-queue.service
systemctl daemon-reload
systemctl enable --now cheeze-ai-queue
systemctl status cheeze-ai-queue --no-pager
```

큐 상태 확인:

```bash
curl http://127.0.0.1:11435/healthz
```

Nginx는 `/ai/` location을 direct Ollama 대신 로컬 큐 서비스로 바꾼다.

## 검증

```bash
curl -X POST http://127.0.0.1:11435/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model":"huihui_ai/qwen3-vl-abliterated:8b-instruct","prompt":"안녕","stream":false}'
```

그리고 메인 페이지에서는 기존처럼 `/ai/api/generate` 를 사용한다.

## 운영 권고

- 기본값은 `worker 1`, `queue 2` 로 시작
- 사용자가 적고 응답 길이가 길다면 queue를 `1` 로 더 줄여도 된다
- 장기적으로는 사용자 인증, 요청 길이 제한, 모델별 별도 큐를 검토할 수 있다
