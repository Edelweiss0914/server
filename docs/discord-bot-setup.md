# Discord Bot Setup

작성일: 2026-04-11
목적: `gateway-lxc` 에 CHEEZE Discord 게임 제어 봇을 배포하기 위한 최소 설정 절차

## 1. 현재 결정

- 배치 위치: `gateway-lxc`
- 언어: `Python`
- 초기 대상: `minecraft-vanilla`
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

## 5. 봇이 사용할 제어 권한

Discord 봇은 웹 토큰을 사용자에게 나눠주기보다, 봇이 직접 portal facade 를 호출하는 direct control 방식으로 시작한다.

따라서 봇 전용 관리자 토큰 1개가 필요하다.

권장:

- `portal-control-tokens.json` 에 `discord-bot-admin` 항목 추가
- `allowed_services`: `["minecraft-vanilla"]`
- `allowed_actions`: `["start", "stop"]`

## 6. 예시 토큰 항목

```json
{
  "token_id": "discord-bot-admin",
  "label": "Discord Bot Control Token",
  "role": "admin",
  "token_hash": "REPLACE_WITH_SHA256_HEX_OF_REAL_TOKEN",
  "allowed_services": ["minecraft-vanilla"],
  "allowed_actions": ["start", "stop"],
  "expires_at": null,
  "revoked_at": null
}
```

## 7. systemd 환경변수 예시

파일:

- `deploy/discord-bot/cheeze-discord-bot.service.example`

중요 값:

```ini
Environment=DISCORD_BOT_TOKEN=CHANGE_ME
Environment=DISCORD_APPLICATION_ID=1492519354129055939
Environment=DISCORD_GUILD_ID=1492516751362097265
Environment=DISCORD_ADMIN_ROLE_IDS=1492517995711561910
Environment=DISCORD_MEMBER_ROLE_IDS=1492518234878906459
Environment=CHEEZE_PORTAL_API_BASE=http://127.0.0.1:11437
Environment=CHEEZE_BOT_CONTROL_TOKEN=CHANGE_ME_TO_A_REGISTRY_ADMIN_TOKEN
```

`CHEEZE_BOT_CONTROL_TOKEN` 은 위 6번 항목의 평문 토큰 값이다.

## 8. 설치 순서

```bash
cd /var/www/home
sudo mkdir -p /opt/cheeze-bot
sudo cp deploy/discord-bot/cheeze-discord-bot.py /opt/cheeze-bot/cheeze-discord-bot.py
sudo cp deploy/discord-bot/requirements.txt /opt/cheeze-bot/requirements.txt
sudo cp deploy/discord-bot/cheeze-discord-bot.service.example /etc/systemd/system/cheeze-discord-bot.service
sudo python3 -m pip install -r /opt/cheeze-bot/requirements.txt
sudo systemctl daemon-reload
sudo systemctl enable --now cheeze-discord-bot
```

## 9. 운영 메모

- `/games` 와 `/status` 는 멤버 이상 허용
- `/start` 는 멤버 이상 허용
- `/stop` 는 관리자만 허용
- 자동 종료 정책이 아직 없으므로 `stop` 은 보수적으로 관리자 전용 유지
