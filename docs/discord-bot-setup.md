# Discord Bot Setup

작성일: 2026-04-11
목적: `gateway-lxc` 에 CHEEZE Discord 범용 게임 서버 제어 봇을 배포하기 위한 최소 설정 절차

## 1. 현재 결정

- 배치 위치: `gateway-lxc`
- 언어: `Python`
- 기본 관리 대상:
  - `minecraft-vanilla`
  - `minecraft-cobbleverse`
- 초기 명령:
  - `/games`
  - `/start`
  - `/status`
  - `/stop` (관리자 전용)

## 2. 현재 제공된 Discord 값

- Guild ID: `1492516751362097265`
- 관리자 역할 ID: `1492517995711561910`
- 멤버 역할 ID: `1492518234878906459`
- Application ID: `1492519354129055939`
- Public Key: `cff71bcafad2a3a9332a72d9944a20aa89000c0899ff4d203b45afc7de9e1897`

주의:

- Public Key 는 interactions 서명 검증용 값이라 비밀값이 아니다.
- 진짜 비밀값은 `DISCORD_BOT_TOKEN` 이다.

## 3. Discord Developer Portal 에서 해야 할 일

1. 애플리케이션 생성
2. `Bot` 탭에서 bot user 추가
3. Bot Token 발급 후 별도 안전한 곳에 저장
4. 봇을 대상 Guild 에 초대

권장 초대 scope:

- `bot`
- `applications.commands`

## 4. gateway-lxc 배포 위치

권장 위치:

- 코드: `/opt/cheeze-bot`
- systemd: `/etc/systemd/system/cheeze-discord-bot.service`
- 비밀 환경파일: `/etc/cheeze-bot/cheeze-discord-bot.env`

## 5. 봇이 사용할 제어 권한

Discord 봇은 웹 토큰을 사용자에게 나눠주기보다, 봇이 직접 portal facade 를 호출하는 direct control 방식으로 시작한다.

권장 모델은 봇 전용 제어 토큰을 액션별로 분리하는 것이다.

권장:

- `portal-control-tokens.json` 에 `discord-bot-start`, `discord-bot-stop` 항목 추가
- `allowed_services`: `["minecraft-vanilla", "minecraft-cobbleverse"]`
- `allowed_actions`:
  - start 토큰: `["start"]`
  - stop 토큰: `["stop"]`

하위 호환:

- 기존 단일 `CHEEZE_BOT_CONTROL_TOKEN` 도 계속 사용할 수 있다.
- 다만 새 배포는 `CHEEZE_BOT_START_CONTROL_TOKEN`, `CHEEZE_BOT_STOP_CONTROL_TOKEN` 분리를 권장한다.

## 6. 예시 토큰 항목

```json
{
  "token_id": "discord-bot-start",
  "label": "Discord Bot Multi-Server Start Token",
  "role": "admin",
  "token_hash": "REPLACE_WITH_SHA256_HEX_OF_REAL_TOKEN",
  "allowed_services": ["minecraft-vanilla", "minecraft-cobbleverse"],
  "allowed_actions": ["start"],
  "expires_at": null,
  "revoked_at": null
}
```

```json
{
  "token_id": "discord-bot-stop",
  "label": "Discord Bot Multi-Server Stop Token",
  "role": "admin",
  "token_hash": "REPLACE_WITH_SHA256_HEX_OF_REAL_TOKEN",
  "allowed_services": ["minecraft-vanilla", "minecraft-cobbleverse"],
  "allowed_actions": ["stop"],
  "expires_at": null,
  "revoked_at": null
}
```

## 7. systemd + env 파일 예시

파일:

- `deploy/discord-bot/cheeze-discord-bot.service.example`
- `deploy/discord-bot/cheeze-discord-bot.env.example`

service 예시:

```ini
EnvironmentFile=/etc/cheeze-bot/cheeze-discord-bot.env
```

env 파일 예시:

```ini
DISCORD_BOT_TOKEN=CHANGE_ME
DISCORD_APPLICATION_ID=1492519354129055939
DISCORD_GUILD_ID=1492516751362097265
DISCORD_ADMIN_ROLE_IDS=1492517995711561910
DISCORD_MEMBER_ROLE_IDS=1492518234878906459
CHEEZE_PORTAL_API_BASE=http://127.0.0.1:11437
CHEEZE_PORTAL_CONTROL_HEADER=X-Cheeze-Control-Token
CHEEZE_BOT_START_CONTROL_TOKEN=CHANGE_ME_TO_A_REGISTRY_START_TOKEN
CHEEZE_BOT_STOP_CONTROL_TOKEN=CHANGE_ME_TO_A_REGISTRY_STOP_TOKEN
CHEEZE_BOT_REQUEST_TIMEOUT=30
CHEEZE_MANAGED_GAME_SERVERS=minecraft-vanilla,minecraft-cobbleverse
```

`CHEEZE_BOT_START_CONTROL_TOKEN` 과 `CHEEZE_BOT_STOP_CONTROL_TOKEN` 은 위 6번 항목의 평문 토큰 값이다.

중요:

- 실제 비밀값은 unit 파일 안에 직접 넣지 않는다.
- `/etc/cheeze-bot/cheeze-discord-bot.env` 로 분리하고 `chmod 600` 을 건다.
- 이미 봇이 배포된 상태라면 현재 service 파일의 비밀값을 env 파일로 옮긴 뒤 service 파일에서는 제거한다.

## 8. 설치 순서

```bash
cd /var/www/home
sudo mkdir -p /opt/cheeze-bot
sudo mkdir -p /etc/cheeze-bot
sudo cp deploy/discord-bot/cheeze-discord-bot.py /opt/cheeze-bot/cheeze-discord-bot.py
sudo cp deploy/discord-bot/requirements.txt /opt/cheeze-bot/requirements.txt
sudo cp deploy/discord-bot/cheeze-discord-bot.service.example /etc/systemd/system/cheeze-discord-bot.service
sudo cp deploy/discord-bot/cheeze-discord-bot.env.example /etc/cheeze-bot/cheeze-discord-bot.env
sudo chmod 600 /etc/cheeze-bot/cheeze-discord-bot.env
sudo python3 -m pip install -r /opt/cheeze-bot/requirements.txt
sudo systemctl daemon-reload
sudo systemctl enable --now cheeze-discord-bot
```

## 8-1. 실제 env 파일 값 예시

```ini
DISCORD_BOT_TOKEN=여기에_디스코드_봇_토큰
DISCORD_APPLICATION_ID=1492519354129055939
DISCORD_GUILD_ID=1492516751362097265
DISCORD_ADMIN_ROLE_IDS=1492517995711561910
DISCORD_MEMBER_ROLE_IDS=1492518234878906459
CHEEZE_PORTAL_API_BASE=http://127.0.0.1:11437
CHEEZE_PORTAL_CONTROL_HEADER=X-Cheeze-Control-Token
CHEEZE_BOT_START_CONTROL_TOKEN=여기에_봇_전용_start_평문_토큰
CHEEZE_BOT_STOP_CONTROL_TOKEN=여기에_봇_전용_stop_평문_토큰
CHEEZE_BOT_REQUEST_TIMEOUT=30
CHEEZE_MANAGED_GAME_SERVERS=minecraft-vanilla,minecraft-cobbleverse
```

## 8-2. 실제 gateway-lxc 적용 순서

1. 최신 코드 받기

```bash
cd /var/www/home
git pull origin main
```

2. 봇 디렉터리 준비

```bash
sudo mkdir -p /opt/cheeze-bot
sudo mkdir -p /etc/cheeze-bot
sudo cp deploy/discord-bot/cheeze-discord-bot.py /opt/cheeze-bot/cheeze-discord-bot.py
sudo cp deploy/discord-bot/requirements.txt /opt/cheeze-bot/requirements.txt
sudo chmod +x /opt/cheeze-bot/cheeze-discord-bot.py
```

3. 의존성 설치

```bash
sudo python3 -m pip install -r /opt/cheeze-bot/requirements.txt
```

4. service + env 파일 배치

```bash
sudo cp deploy/discord-bot/cheeze-discord-bot.service.example /etc/systemd/system/cheeze-discord-bot.service
sudo cp deploy/discord-bot/cheeze-discord-bot.env.example /etc/cheeze-bot/cheeze-discord-bot.env
sudo chmod 600 /etc/cheeze-bot/cheeze-discord-bot.env
sudo nano /etc/cheeze-bot/cheeze-discord-bot.env
```

5. 값 채우기

- `DISCORD_BOT_TOKEN`
- `CHEEZE_BOT_START_CONTROL_TOKEN`
- `CHEEZE_BOT_STOP_CONTROL_TOKEN`

6. 실행

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cheeze-discord-bot
sudo systemctl status cheeze-discord-bot --no-pager
```

7. 로그 확인

```bash
journalctl -u cheeze-discord-bot -n 50 --no-pager
```

8. slash command 확인

- Discord 서버에서 `/games`
- `/status minecraft-vanilla`
- `/status minecraft-cobbleverse`
- `/start minecraft-vanilla`
- `/start minecraft-cobbleverse`

## 9. 운영 메모

- `/games` 와 `/status` 는 멤버 이상 허용
- `/start` 는 멤버 이상 허용
- `/stop` 는 관리자만 허용
- 봇 전용 제어 토큰은 `allowed_services` / `allowed_actions` 로 게임 서버와 `start`/`stop` 범위를 명시적으로 제한한다.
- 가능하면 `start` 와 `stop` 토큰을 분리해 least-privilege 구성을 유지한다.
- 자동 종료 정책이 아직 없으므로 `stop` 은 보수적으로 관리자 전용 유지
- 이미 봇이 서버에 올라가 있다면 이번 보안 수정의 핵심은 "service 파일에서 비밀값 제거, env 파일로 이동, 재시작 후 slash command 재검증" 이다.
- Troubleshooting: if autocomplete only shows `minecraft-vanilla`, verify `/etc/cheeze-bot/cheeze-discord-bot.env` sets `CHEEZE_MANAGED_GAME_SERVERS=minecraft-vanilla,minecraft-cobbleverse` and restart `cheeze-discord-bot`.
