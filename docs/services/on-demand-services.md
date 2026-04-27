# 온디맨드 서비스 기술 명세서

## 개요

온디맨드 서비스는 cheeze-backend-agent가 수명주기를 관리하는 게임 서버 및 AI 서비스입니다. 평상시 오프라인 상태를 유지하다가 요청이 들어오면 자동으로 시작되고, 유휴 상태가 지속되거나 지정 시각이 되면 자동으로 중지됩니다. 모든 서비스가 오프라인이 되면 백엔드 PC는 하이버네이션 상태로 진입합니다.

---

## 관리 서비스 목록

### 1. Minecraft Vanilla

| 항목 | 값 |
|------|----|
| 서비스 ID | `minecraft-vanilla` |
| 포트 | `25565` |
| 서버 경로 | `D:\Servers\Minecraft\Vanilla` |
| 유휴 자동 중지 | 20분 |
| 강제 중지 시각 | 01:00 KST — **계획됨 (미구현)** |
| 준비 검사 | TCP 25565 |

### 2. Minecraft Cobbleverse

| 항목 | 값 |
|------|----|
| 서비스 ID | `minecraft-cobbleverse` |
| 포트 | `25566` |
| 서버 경로 | `D:\Servers\Minecraft\Modpacks\ssibal_cobbleverse_multi` |
| Java 버전 | Java 21 |
| JVM 옵션 | `-Xms6G -Xmx6G` |
| 모드 로더 | Fabric |
| 유휴 자동 중지 | 20분 |
| 강제 중지 시각 | 평일 01:00 KST (주말 제한 없음) — **계획됨 (미구현)** |
| 준비 검사 | TCP 25566 |

### 3. Ollama

| 항목 | 값 |
|------|----|
| 서비스 ID | `ollama` |
| 포트 | `11434` |
| 유휴 자동 중지 | 5분 |
| 강제 중지 시각 | 없음 |
| 준비 검사 | HTTP `http://localhost:11434/` |
| 기본 모델 | `huihui_ai/qwen3-vl-abliterated:8b-instruct` |

---

## WOL (Wake-on-LAN) 흐름

백엔드 PC가 하이버네이션 상태일 때 서비스 시작 요청이 들어오면 자동으로 깨웁니다.

```
서비스 시작 요청 (cheeze-portal-api)
  └─ cheeze-control-api: 백엔드 /healthz 확인
       ├─ 응답 있음 ──────────────────────────────────┐
       └─ 응답 없음 → WOL 매직 패킷 전송              │
                       └─ 3초마다 /healthz 폴링       │
                            (최대 150초)              │
                            ├─ 응답 있음 ─────────────┤
                            └─ 타임아웃 → 504 반환    │
                                                      ▼
                                          cheeze-backend-agent: 서비스 시작
                                            └─ 준비 검사 통과 → running
```

### WOL 파라미터

| 항목 | 값 |
|------|----|
| 대상 MAC | `9C-6B-00-57-73-3A` |
| 브로드캐스트 주소 | `192.168.50.255` |
| UDP 포트 | `9` |
| 웨이크 타임아웃 | `150초` |
| 폴링 간격 | `3초` |

---

## 하이버네이션 흐름

모든 온디맨드 서비스가 오프라인 상태가 되면 백엔드 PC는 하이버네이션을 시도합니다.

```
모든 서비스 offline
  └─ 조건 체크 (60초 간격)
       ├─ WTS 활성 세션 없음?     ─ No → 대기
       ├─ Inhibit 스케줄 외?      ─ No → 대기
       ├─ 디스크 여유 20GB 이상?  ─ No → 대기
       └─ no-sleep 플래그 없음?   ─ No → 대기
            │ 모두 Yes
            ▼
       shutdown /h /f 실행
```

### Inhibit 유예 기간

| 이벤트 | 유예 시간 | 설명 |
|--------|----------|------|
| 에이전트 시작 | 180초 | `start_watchdog()` 호출 시 자동 설정 |
| 시스템 재개(resume) | 180초 | watchdog 틱 간격이 임계값 초과 시 자동 감지 |
| 서비스 시작 요청 | 600초 | `/services/{id}/start` POST 성공 시 설정 |

유예 기간 중에는 모든 서비스가 오프라인이어도 하이버네이션이 실행되지 않습니다.

---

## 유휴 감시 및 경고 시스템

플레이어 수가 0인 상태가 유휴 시간(서비스별 설정) 동안 지속되면 자동 중지합니다.

### 경고 및 동작 타임라인

| 중지까지 남은 시간 | 동작 |
|-------------------|------|
| 30분 | RCON 경고 브로드캐스트 |
| 20분 | RCON 경고 브로드캐스트 |
| 10분 | RCON 경고 브로드캐스트 |
| 5분 | RCON 경고 브로드캐스트 + 자동 저장 트리거 |
| 1분 | RCON 경고 브로드캐스트 |
| 0분 | 서비스 자동 중지 |

---

## 자동 저장

| 방식 | 설명 |
|------|------|
| 스케줄 | 매 시각 `:00`, `:30`에 저장 명령 실행 |
| 인터벌 | 설정된 N분 간격으로 저장 명령 실행 |
| 유휴 5분 전 | 유휴 자동 중지 5분 전 저장 트리거 |

---

## 게임 서버 외부 접속

```
외부 플레이어
  └─ 인터넷
       └─ 공유기 포트포워딩
            ├─ 25565 → homepc:25565  (Minecraft Vanilla)
            └─ 25566 → homepc:25566  (Minecraft Cobbleverse)
```

Ollama는 외부 직접 접속을 허용하지 않습니다. Tailscale 경유 또는 cheeze-ai-queue를 통해서만 접근합니다.

---

## 플레이어 수 감지 방식

| 서비스 | 방식 |
|--------|------|
| Minecraft (Vanilla/Cobbleverse) | Server List Ping (varint handshake 프로토콜) |
| Ollama | `/api/ps` API — 로드된 모델 수를 활성 세션으로 간주 |

---

## no-sleep 플래그

하이버네이션을 일시적으로 억제해야 할 때 사용합니다.

| 동작 | 엔드포인트 | 설명 |
|------|-----------|------|
| 억제 활성화 | `POST /no-sleep` | 플래그 파일 생성, 하이버네이션 차단 |
| 억제 해제 | `DELETE /no-sleep` | 플래그 파일 제거, 하이버네이션 허용 |

---

## 의존성

| 의존 서비스 | 설명 |
|-------------|------|
| `cheeze-backend-agent` | 서비스 프로세스 직접 관리 |
| `cheeze-control-api` | WOL 처리 및 상위 요청 라우팅 |
| `cheeze-portal-api` | 외부 요청 인증 및 프록시 |
| `cheeze-ai-queue` | Ollama 요청 직렬화 |
| `cheeze-discord-bot` | Discord 명령어를 통한 서비스 제어 |
| Java 21 | Cobbleverse 실행 환경 |
| Fabric | Cobbleverse 모드 로더 |

---

## 로그 / 모니터링

```bash
# 전체 서비스 상태 확인
curl http://100.86.252.21:5010/services | jq .

# 유휴 상태 확인
curl http://100.86.252.21:5010/idle/status | jq .

# 하이버네이션 조건 점검
curl http://100.86.252.21:5010/hibernate/debug | jq .

# Minecraft Vanilla 콘솔 로그 (최근 50줄)
curl "http://100.86.252.21:5010/services/minecraft-vanilla/console?tail=50"

# no-sleep 플래그 설정 (원격 작업 중 하이버네이션 방지)
curl -X POST http://100.86.252.21:5010/no-sleep

# no-sleep 플래그 해제
curl -X DELETE http://100.86.252.21:5010/no-sleep
```

---

## 트러블슈팅

| 증상 | 원인 | 조치 |
|------|------|------|
| 서버 시작 요청 후 응답 없음 | 백엔드 PC 오프라인, WOL 대기 중 | WOL 타임아웃(150초) 대기; 이후에도 안 되면 PC 전원 및 BIOS WOL 설정 확인 |
| 서버가 `starting`에서 멈춤 | 준비 검사 실패 (포트 미오픈) | 서버 프로세스 로그 확인, 해당 포트 리스닝 여부 확인 |
| 유휴 중지가 발생하지 않음 | 플레이어 수 감지 실패 | Server List Ping 포트 확인, RCON 연결 확인 |
| 01:00에 서버가 중지되지 않음 | 에이전트 시간 설정 오류 | 백엔드 PC 시스템 시간 및 타임존 확인 |
| 하이버네이션이 실행되지 않음 | no-sleep 플래그, 세션 활성, inhibit 스케줄 | `GET /hibernate/debug` 로 조건별 원인 확인 |
| Cobbleverse 메모리 부족 | `-Xmx6G` 설정 불충분 | `config.json` JVM 옵션 수정, 시스템 메모리 여유 확인 |
| Ollama 자동 시작 안 됨 | `CHEEZE_INTERNAL_SECRET` 불일치 또는 control-api 미응답 | `CHEEZE_AI_BACKEND_BASE`, `CHEEZE_INTERNAL_SECRET` 환경변수 및 cheeze-control-api 상태 확인 |
| 외부에서 게임 서버 접속 불가 | 포트포워딩 미설정 또는 서버 미실행 | 공유기 포트포워딩(25565/25566) 확인, 서비스 상태 확인 |
| 경고 메시지가 표시되지 않음 | RCON 연결 실패 | RCON 포트, 패스워드(`config.json`) 및 서버 RCON 활성화 설정 확인 |
