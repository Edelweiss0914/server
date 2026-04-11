# WOL Start Flow

작성일: 2026-04-11

## 목적

서비스 시작 요청이 들어왔을 때 backend가 자고 있으면 자동으로 깨우고, backend agent가 올라올 때까지 기다린 뒤 서비스 시작을 이어가는 흐름을 만든다.

## 흐름

`start request -> backend health 확인 -> 필요 시 WOL -> backend health wait -> service start`

## 현재 구현

`cheeze-control-api`의 `/services/{name}/start` 는 다음 순서로 동작한다.

1. backend agent `/healthz` 확인
2. 이미 online이면 바로 start 전달
3. offline이면 `wakeonlan <MAC>`
4. 최대 `90초` 동안 health 재시도
5. online 되면 backend agent에 start 전달
6. 응답에 `wake_result` 포함

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
