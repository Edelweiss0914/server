# cheeze-backend-agent 기술 명세서

## 개요

cheeze-backend-agent는 Windows 백엔드 PC에서 실행되는 에이전트 서비스입니다. 게임 서버 및 AI 서비스의 프로세스 수명주기를 직접 관리하고, 플레이어 수 모니터링, 유휴 감지, 자동 저장, 하이버네이션 트리거 등의 기능을 담당합니다.

- **호스트**: Backend PC (`100.86.252.21`)
- **포트**: `5010`
- **런타임**: Python (Windows)
- **설정 파일**: `config.json`

---

## 엔드포인트

### 서비스 상태

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/healthz` | 에이전트 헬스체크 |
| `GET` | `/services` | 전체 서비스 상태 + 플레이어 수 |
| `GET` | `/services/{service_id}` | 개별 서비스 상태 |

### 서비스 제어

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/services/{service_id}/start` | 서비스 시작 |
| `POST` | `/services/{service_id}/stop` | 서비스 중지 |

### 콘솔 / RCON

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/services/{service_id}/console` | 콘솔 로그 조회 |
| `POST` | `/services/{service_id}/console` | RCON 명령 전송 |

#### `/services/{service_id}/console` 쿼리 파라미터 (GET)

| 파라미터 | 기본값 | 설명 |
|----------|--------|------|
| `offset` | `0` | 로그 시작 오프셋 |
| `tail` | `300` | 최대 반환 줄 수 |

### 유휴 / 하이버네이션

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/idle/status` | 유휴 감시 현재 상태 |
| `GET` | `/hibernate/debug` | 하이버네이션 조건 상세 디버그 |

### 시스템 리소스

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/system/resources` | CPU/메모리/디스크 사용률 (Windows 네이티브) |

#### `/system/resources` 응답 구조

```json
{
  "cpu": { "percent": 6 },
  "memory": { "total_gb": 63.12, "used_gb": 25.51, "percent": 40 },
  "disk": [
    { "drive": "C:", "total_gb": 255.02, "used_gb": 217.86, "free_gb": 37.16, "percent": 85.4 },
    { "drive": "D:", "total_gb": 976.56, "used_gb": 894.96, "free_gb": 81.6, "percent": 91.6 }
  ]
}
```

> CPU는 PowerShell `Get-CimInstance Win32_Processor`로 측정합니다 (wmic 제거됨 — Windows 11에서 지원 중단).
| `POST` | `/no-sleep` | no-sleep 플래그 생성 (하이버네이션 억제) |
| `DELETE` | `/no-sleep` | no-sleep 플래그 제거 |

---

## 서비스 상태 머신

```
offline → starting → running → stopping → offline
```

| 상태 | 설명 |
|------|------|
| `offline` | 프로세스 없음 |
| `starting` | 프로세스 시작됨, 준비 검사 대기 중 |
| `running` | 준비 검사 통과, 정상 운영 중 |
| `stopping` | 중지 명령 전송됨, 종료 대기 중 |

### 준비 검사 방식

| 방식 | 설명 |
|------|------|
| `http` | 지정된 URL에 HTTP GET 폴링, `2xx` 응답 시 준비 완료 |
| `tcp` | 지정된 호스트:포트에 TCP 소켓 연결 성공 시 준비 완료 |

---

## 플레이어 수 모니터링

| 서비스 | 방식 | 설명 |
|--------|------|------|
| Minecraft | Server List Ping | varint handshake 프로토콜로 현재 접속자 수 조회 |
| Ollama | `/api/ps` | 로드된 모델 수를 "플레이어 수"로 환산 — **계획됨 (미구현)** |

플레이어 수는 유휴 감지의 기준값으로 사용됩니다.

---

## RCON

Minecraft RCON 프로토콜(인증 + 패킷 프레이밍)을 사용하여 실행 중인 서버에 명령을 전달합니다.

- 경고 메시지는 한국어 색상 메시지로 브로드캐스트됩니다.
- `/services/{service_id}/console` POST 엔드포인트를 통해 임의 명령 전달 가능

---

## 유휴 감시

- **폴링 간격**: 60초
- **추적 단위**: 서비스별 독립 추적

### 경고 임계값 (서비스 중지 전 남은 시간)

| 남은 시간 | 동작 |
|----------|------|
| 30분 전 | RCON 경고 브로드캐스트 |
| 20분 전 | RCON 경고 브로드캐스트 |
| 10분 전 | RCON 경고 브로드캐스트 |
| 5분 전 | RCON 경고 브로드캐스트 + 자동 저장 트리거 |
| 1분 전 | RCON 경고 브로드캐스트 |
| 0분 (만료) | 서비스 자동 중지 |

---

## 자동 저장

| 방식 | 설명 |
|------|------|
| 스케줄 | 매 시각 `:00` 및 `:30`에 저장 명령 실행 |
| 인터벌 | 설정된 N분마다 저장 명령 실행 |

---

## 시간 제한 (강제 중지)

설정된 종료 시각(`stop_at`)에 실행 중인 서비스를 강제 중지합니다.

**예시**: `stop_at: "01:00"` → 평일 01:00 KST에 자동 중지
- **주말(토/일)에는 시간 제한 미적용** — 강제 중지 및 경고 발송이 건너뜀

---

## 하이버네이션

모든 조건이 충족되면 `shutdown /h /f` 명령으로 Windows 하이버네이션을 실행합니다.

### 하이버네이션 조건 (모두 충족 필요)

| 조건 | 설명 |
|------|------|
| 모든 서비스 오프라인 | 관리되는 서비스가 전부 `offline` 상태 |
| WTS 세션 없음 | 활성 Windows 터미널 세션 없음 |
| Inhibit 스케줄 외 | 현재 시각이 inhibit(억제) 스케줄 범위 밖 |
| 디스크 여유공간 20GB 이상 | 하이버네이션 파일 생성 공간 확보 |
| no-sleep 플래그 없음 | `POST /no-sleep`으로 생성된 플래그 파일 없음 |

### Inhibit 유예 기간

| 트리거 | 유예 시간 | 설명 |
|--------|----------|------|
| 에이전트 시작 (startup) | 180초 | `start_watchdog()` 호출 시 자동 설정 |
| 시스템 재개 (resume) | 180초 | watchdog 틱 간격이 임계값 초과 시 자동 감지 |
| 서비스 시작 요청 (start_request) | 600초 | `/services/{id}/start` POST 성공 시 설정 |

---

## 프로세스 관리 / 자동 재시작

에이전트는 `restart-loop.ps1` 래퍼를 통해 Windows Scheduled Task로 실행됩니다.

### Scheduled Task 구성

| 항목 | 값 |
|------|----|
| 태스크 이름 | `CHEEZE Backend Agent` |
| 실행 파일 | `powershell -File restart-loop.ps1` |
| 사용자 | `SYSTEM` |
| 트리거 1 | `AtStartup` (StartWhenAvailable 포함) |
| 트리거 2 | `EventID=107` — Microsoft-Windows-Kernel-Power (sleep/hibernate resume) |

### 재시작 동작

```
[restart-loop.ps1]
  └─ python cheeze-backend-agent.py  ← 에이전트 실행
       │
       └─ (종료 시: 크래시·kill·자체 업데이트 등)
            └─ 5초 후 자동 재시작
```

| 시나리오 | 복구 방식 |
|----------|----------|
| 프로세스 크래시 / 외부 kill | `restart-loop.ps1`이 5초 후 재시작 |
| 정상 부팅 | `AtStartup` 트리거 |
| Hibernate / sleep resume (WoL 포함) | `EventID=107` 트리거 |

### 수동 제어

```powershell
# 중지
Stop-ScheduledTask -TaskName "CHEEZE Backend Agent"

# 시작
Start-ScheduledTask -TaskName "CHEEZE Backend Agent"

# 상태 확인
Get-ScheduledTask -TaskName "CHEEZE Backend Agent"
(Get-ScheduledTask -TaskName "CHEEZE Backend Agent").Triggers
```

---

## 자체 업데이트

에이전트 스크립트 파일의 MD5 해시를 watchdog 틱마다 확인합니다. 변경이 감지되면 현재 프로세스를 종료하고 새 프로세스를 실행합니다. `restart-loop.ps1`이 종료된 프로세스를 5초 내에 재시작합니다.

---

## 설정 (환경변수)

| 환경변수 | 설명 | 기본값 |
|----------|------|------|
| `CHEEZE_BACKEND_LISTEN_HOST` | 바인딩 호스트 | `0.0.0.0` |
| `CHEEZE_BACKEND_LISTEN_PORT` | 바인딩 포트 | `5010` |
| `CHEEZE_BACKEND_CONFIG` | 설정 파일 경로 (미설정 시 스크립트 인근 후보 파일 자동 탐색) | *(자동 탐색)* |
| `CHEEZE_BACKEND_REQUEST_TIMEOUT` | 준비 검사 HTTP/TCP 연결 타임아웃 (초) | `5` |

---

## 설정 파일 (`config.json`)

에이전트는 `config.json` 파일로 동작을 정의합니다.

### 주요 섹션

| 섹션 | 설명 |
|------|------|
| `services` | 서비스 정의 목록 (ID, 포트, 경로, JVM 옵션, 준비 검사, 유휴 시간 등) |
| `hibernation` | 하이버네이션 정책 (활성화 여부, inhibit 스케줄, 디스크 임계값) |
| `host` | 호스트 정보 (MAC, IP 등) |

> `config.json`에는 시크릿(RCON 패스워드 등)이 포함될 수 있습니다. 파일 권한을 적절히 설정하세요.

---

## 의존성

| 의존 서비스 | 방향 | 설명 |
|-------------|------|------|
| `cheeze-control-api` | 상위 | 모든 요청의 발신원 |
| Minecraft 프로세스 | 하위 | 직접 프로세스 관리 |
| Ollama 프로세스 | 하위 | 직접 프로세스 관리 |
| Windows OS | 시스템 | `shutdown /h /f`, WTS API 등 |

---

## 로그 / 모니터링

- **헬스체크**: `GET /healthz`
- **유휴 상태**: `GET /idle/status` — 각 서비스의 마지막 활동 시각, 유휴 경과 시간
- **하이버네이션 조건**: `GET /hibernate/debug` — 각 조건별 충족 여부 상세 출력

```bash
# 에이전트 헬스체크
curl http://100.86.252.21:5010/healthz

# 유휴 상태 확인
curl http://100.86.252.21:5010/idle/status | jq .

# 하이버네이션 조건 디버그
curl http://100.86.252.21:5010/hibernate/debug | jq .
```

---

## 트러블슈팅

| 증상 | 원인 | 조치 |
|------|------|------|
| 서비스가 `starting`에서 멈춤 | 준비 검사 실패 (포트 미오픈, HTTP 오류) | 준비 검사 URL/포트 확인, 서비스 프로세스 로그 확인 |
| 유휴 경고가 발송되지 않음 | RCON 연결 실패 | RCON 포트 및 패스워드 확인 (`config.json`) |
| 하이버네이션이 예상보다 일찍 실행됨 | inhibit 스케줄 미설정 | `config.json`의 `hibernation.inhibit_schedule` 확인 |
| 하이버네이션이 실행되지 않음 | no-sleep 플래그 존재 또는 조건 미충족 | `GET /hibernate/debug`로 각 조건 확인 |
| 자동 저장이 동작하지 않음 | RCON 명령 실패 | RCON 연결 상태 및 서버 상태(`running`) 확인 |
| 에이전트가 갑자기 재시작됨 | 자체 업데이트 감지 | 스크립트 파일 변경 이력 확인 |
| `5010` 포트 외부 접근 불가 | 방화벽 또는 Tailscale 미연결 | Windows 방화벽 인바운드 규칙 및 Tailscale 연결 상태 확인 |
| Hibernate 후 서비스 시작 요청이 504 반환 | EventID=107 트리거 미등록으로 resume 시 에이전트 미기동 | `(Get-ScheduledTask -TaskName "CHEEZE Backend Agent").Triggers`에서 `MSFT_TaskEventTrigger` 확인. 없으면 deploy push로 재등록 |
| 에이전트 크래시 후 자동 재기동 안 됨 | Scheduled Task가 `restart-loop.ps1`이 아닌 python 직접 실행 중 | `(Get-ScheduledTask -TaskName "CHEEZE Backend Agent").Actions`에서 Execute 확인. `python`이면 deploy push로 교체 필요 |
