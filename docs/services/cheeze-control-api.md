# cheeze-control-api 기술 명세서

## 개요

cheeze-control-api는 CHEEZE 인프라의 내부 제어 API입니다. cheeze-portal-api로부터 프록시된 요청을 받아 백엔드 에이전트(`cheeze-backend-agent`)로 전달하거나, 백엔드가 오프라인일 때 WOL(Wake-on-LAN)을 통해 호스트를 깨웁니다.

- **호스트**: Gateway LXC (`100.75.209.83`)
- **포트**: `11436`
- **접근 제한**: `localhost`에서만 접근 가능 (외부 노출 없음)
- **역할**: 서비스 상태 집계, WOL 처리, 백엔드 오프라인 폴백

---

## 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/healthz` | 서비스 헬스체크 |
| `GET` | `/registry` | 서비스 레지스트리 내용 로드 및 반환 |
| `GET` | `/services` | 전체 서비스 상태 (백엔드 프록시 또는 오프라인 폴백) |
| `GET` | `/services/{service_id}` | 개별 서비스 상태 |
| `GET` | `/services/{service_id}/console` | 콘솔 로그 스트리밍 |
| `POST` | `/services/{service_id}/start` | 서비스 시작 (필요 시 호스트 자동 웨이크) |
| `POST` | `/services/{service_id}/stop` | 서비스 중지 |
| `POST` | `/services/{service_id}/console` | RCON 명령 전달 |
| `POST` | `/host/wake` | WOL 매직 패킷 전송 |
| `GET` | `/idle/status` | 백엔드 유휴 상태 프록시 |
| `GET` | `/hibernate/debug` | 하이버네이션 조건 디버그 프록시 |
| `GET`/`POST`/`DELETE` | `/no-sleep` | no-sleep 플래그 조회/설정/해제 |
| `GET` | `/system/resources` | Backend PC 리소스 프록시 (CPU/메모리/디스크) |
| `GET` | `/gateway/resources` | Gateway VM 자체 리소스 수집 (CPU/메모리/디스크) |

---

## WOL (Wake-on-LAN) 동작

서비스 시작 요청 시 백엔드 PC가 오프라인이면 자동으로 WOL 시퀀스를 실행합니다.

### WOL 동작 방식

WOL 매직 패킷은 UDP 소켓 직접 전송이 아니라 **외부 바이너리 subprocess 호출** 방식으로 전송됩니다. 기본적으로 `wakeonlan` 바이너리를 사용하며, `CHEEZE_WOL_COMMAND`로 전체 명령을 커스터마이즈하거나 `CHEEZE_WOL_BINARY`로 바이너리명을 변경할 수 있습니다.

### WOL 파라미터

| 항목 | 값 |
|------|----|
| 대상 MAC | `9C-6B-00-57-73-3A` |
| 브로드캐스트 주소 | `192.168.50.255` |
| UDP 포트 | `9` |
| 웨이크 대기 타임아웃 | `150초` |
| 헬스체크 폴링 간격 | `3초` |

### WOL 흐름

```
POST /services/{id}/start
  └─ 백엔드 /healthz 확인
       ├─ 응답 있음 → 바로 start 요청 전달
       └─ 응답 없음 → WOL 매직 패킷 전송
                       └─ 3초마다 /healthz 폴링 (최대 150초)
                            ├─ 응답 있음 → start 요청 전달
                            └─ 타임아웃 → 504 반환
```

---

## 오프라인 폴백

백엔드 PC(`cheeze-backend-agent`)에 도달할 수 없을 때, `GET /services` 및 `GET /services/{service_id}` 요청은 서비스 레지스트리 파일을 기반으로 모든 서비스를 `offline` 상태로 반환합니다. 오류 대신 예측 가능한 응답을 유지하기 위한 설계입니다.

---

## 설정 (환경변수)

| 환경변수 | 설명 | 기본값 / 예시 |
|----------|------|------|
| `CHEEZE_CONTROL_LISTEN_HOST` | 바인딩 호스트 | `127.0.0.1` |
| `CHEEZE_CONTROL_LISTEN_PORT` | 바인딩 포트 | `11436` |
| `CHEEZE_BACKEND_AGENT_BASE` | 백엔드 에이전트 베이스 URL | `http://100.86.252.21:5010` |
| `CHEEZE_BACKEND_MAC` | WOL 대상 MAC 주소 | `9C-6B-00-57-73-3A` |
| `CHEEZE_WOL_TARGET_IP` | WOL 브로드캐스트 IP | `192.168.50.255` |
| `CHEEZE_WOL_TARGET_PORT` | WOL UDP 포트 | `9` |
| `CHEEZE_SERVICE_REGISTRY` | 서비스 레지스트리 파일 경로 | `/etc/cheeze/services.json` |
| `CHEEZE_BACKEND_TIMEOUT` | 백엔드 에이전트 요청 타임아웃 (초) | `8` |
| `CHEEZE_BACKEND_WAKE_TIMEOUT` | WOL 후 백엔드 대기 타임아웃 (초) | `150` |
| `CHEEZE_BACKEND_WAKE_POLL` | WOL 폴링 간격 (초) | `3` |
| `CHEEZE_WOL_COMMAND` | 커스텀 WOL 명령 전체 (설정 시 바이너리/파라미터 무시) | *(빈 문자열)* |
| `CHEEZE_WOL_BINARY` | WOL 바이너리명 | `wakeonlan` |
| `CHEEZE_INTERNAL_SECRET` | 내부 인증 시크릿 (X-Cheeze-Internal-Token 헤더로 수신) | *(시크릿)* |

> 이 서비스는 `localhost`에서만 바인딩해야 합니다. 외부 네트워크에 노출하지 마세요.

---

## 내부 인증 (X-Cheeze-Internal-Token)

cheeze-control-api는 `CHEEZE_INTERNAL_SECRET`이 설정된 경우 모든 요청에서 `X-Cheeze-Internal-Token` 헤더를 검증합니다. 헤더 값이 시크릿과 일치하지 않으면 `401 Unauthorized`를 반환합니다.

- `CHEEZE_INTERNAL_SECRET`이 비어 있으면 인증 없이 모든 요청을 허용합니다 (하위 호환).
- cheeze-portal-api는 내부 요청 시 자동으로 이 헤더를 포함합니다.
- cheeze-ai-queue도 동일한 시크릿을 사용하여 ollama 시작 요청을 보냅니다.

---

## 의존성

| 의존 서비스 | 방향 | 설명 |
|-------------|------|------|
| `cheeze-portal-api` | 상위 | 모든 요청의 발신원 |
| `cheeze-backend-agent` | 하위 | 서비스 상태 및 제어 명령 대상 |
| 서비스 레지스트리 파일 | 파일 | 오프라인 폴백 및 서비스 목록 제공 |
| 로컬 네트워크 (UDP:9) | 네트워크 | WOL 매직 패킷 전송 경로 |

- cheeze-control-api와 cheeze-portal-api는 동일 LXC에서 실행됩니다.
- 백엔드 에이전트는 Tailscale 경유 (`100.86.252.21:5010`) 또는 로컬 네트워크로 접근합니다.

---

## 로그 / 모니터링

- **헬스체크**: `GET /healthz` — `200 OK` 확인
- **서비스 레지스트리 확인**: `GET /registry`
- **백엔드 연결 확인**: `GET /services` 응답의 소스 확인 (`backend` vs `fallback`)

```bash
# 헬스체크
curl http://127.0.0.1:11436/healthz

# 전체 서비스 상태 확인
curl http://127.0.0.1:11436/services | jq .

# WOL 수동 트리거
curl -X POST http://127.0.0.1:11436/host/wake
```

---

## 트러블슈팅

| 증상 | 원인 | 조치 |
|------|------|------|
| `GET /services` 전체 `offline` 반환 | 백엔드 에이전트 미응답 | `CHEEZE_BACKEND_AGENT_BASE` URL 확인, 백엔드 PC 전원 및 에이전트 프로세스 확인 |
| WOL 후 타임아웃 (504) | PC가 WOL에 반응하지 않거나 150초 초과 | BIOS WOL 설정 확인, MAC 주소 오타 확인, 네트워크 브로드캐스트 경로 확인 |
| `POST /services/{id}/start` 즉시 실패 | 서비스 레지스트리에 없는 ID | `/registry` 응답에서 등록된 서비스 ID 목록 확인 |
| 포트 11436 접근 불가 | 외부에서 접근 시도 | `localhost` 전용 서비스임을 확인; cheeze-portal-api를 통해 접근 |
| WOL 패킷 전송됐으나 PC 안 켜짐 | 공유기 설정 또는 BIOS 문제 | 공유기의 UDP 브로드캐스트 포워딩 설정 확인, BIOS "Wake on LAN" 옵션 활성화 확인 |
