# WOL Start Flow

작성일: 2026-04-11

## 목적

서비스 시작 요청이 들어왔을 때 backend가 자고 있으면 자동으로 깨우고, backend agent가 올라올 때까지 기다린 뒤 서비스 시작을 이어가는 흐름을 만든다.

## 흐름

`start request -> backend health 확인 -> 필요 시 WOL -> backend health wait -> service start`

## 현재 구현

공개 `portal facade` 의 `/api/control/services/{name}/start` 는 내부 `cheeze-control-api` 를 통해 아래 순서로 동작한다.

1. backend agent `/healthz` 확인
2. 이미 online이면 바로 start 전달
3. offline이면 `wakeonlan <MAC>`
4. 최대 `150초` 동안 health 재시도
5. online 되면 backend agent에 start 전달
6. 응답에 `wake_result` 포함

추가 동작:

- backend가 sleep/hibernate 상태여서 `/services/{name}` 조회가 실패해도 게이트웨이는 `502` 대신 `offline` 상태 JSON 을 반환한다.
- 즉 homepage control card는 "backend가 잠들어 있음"을 오류가 아니라 정상적인 `꺼짐` 상태로 해석한다.

## 응답 예시

이미 backend가 online인 경우:

```json
{
  "accepted": true,
  "service": "minecraft-vanilla",
  "message": "Start command dispatched.",
  "wake_result": {
    "woke": false,
    "ready": true,
    "message": "backend agent already online"
  }
}
```

WOL 후 online 전환 성공:

```json
{
  "accepted": true,
  "service": "minecraft-vanilla",
  "message": "Start command dispatched.",
  "wake_result": {
    "woke": true,
    "ready": true,
    "message": "backend agent became reachable after wake"
  }
}
```

WOL 후 timeout:

```json
{
  "error": "backend_not_ready",
  "service": "minecraft-vanilla",
  "message": "backend agent did not become reachable before timeout",
  "wake_result": {
    "woke": true,
    "ready": false
  }
}
```

## 운영 의미

- 포털은 start 버튼 하나만 제공하면 된다
- backend가 이미 켜져 있으면 즉시 시작
- backend가 자고 있으면 자동으로 기상 후 시작
- 상태 폴링은 backend 절전 상태를 `offline` 으로 처리하므로 브라우저 콘솔에 반복 `502` 를 남기지 않아야 한다

## 장애 대응 메모

2026-04-11 확인된 문제:

- `homepc` 를 hibernate 시킨 뒤 homepage 에서 `minecraft-vanilla` 시작 버튼을 누르면
  - 상태 조회 `GET /control/services/minecraft-vanilla` 가 `502`
  - 시작 요청 `POST /control/services/minecraft-vanilla/start` 가 `504`
  로 보일 수 있었다.

원인:

- backend agent 비가용 상태를 status API 가 그대로 `502` 로 전달했다.
- WOL 대기 `90초` 와 nginx `/control/` read timeout `100초` 사이 여유가 너무 작았다.

코드 조치:

- `deploy/gateway/cheeze-control-api.py`
  - backend 비가용 시 status 조회를 `offline` payload 로 정규화
  - `backend_not_ready` 응답에 메시지 포함
  - 기본 wake timeout `150초` 로 상향
- `js/app.js`
  - start/stop 요청 진행 중에는 background polling 이 카드 상태를 덮어쓰지 않도록 보정
- `deploy/gateway/home-control-location.conf.example`
  - `proxy_send_timeout`, `proxy_read_timeout` 을 `210초` 로 상향

운영 반영 순서:

1. `gateway-lxc` 에 `deploy/gateway/cheeze-control-api.py` 교체
2. `gateway-lxc` 에 `deploy/gateway/cheeze-control-api.service.example` 값 반영
3. `gateway-lxc` nginx `home.conf` 의 `/control/` location timeout 을 `210초` 로 상향
4. 정적 파일 `js/app.js` 반영
5. `systemctl daemon-reload`
6. `systemctl restart cheeze-control-api`
7. `nginx -t && systemctl reload nginx`
8. `homepc` hibernate 상태에서 다시 실기 검증
