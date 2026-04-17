# CHEEZE 운영/유지보수 체크리스트

> 최종 업데이트: 2026-04-17

## 목차

1. [일일 점검](#1-일일-점검)
2. [주간 점검](#2-주간-점검)
3. [월간 점검](#3-월간-점검)
4. [백업 전략](#4-백업-전략)
5. [토큰 관리](#5-토큰-관리)
6. [인증서 및 터널 관리](#6-인증서-및-터널-관리)
7. [시스템 업데이트](#7-시스템-업데이트)
8. [새 Minecraft 모드팩 추가](#8-새-minecraft-모드팩-추가)
9. [디스크 용량 모니터링](#9-디스크-용량-모니터링)

---

## 1. 일일 점검

### 서비스 상태 확인

```bash
# Gateway에서
systemctl status cheeze-portal-api cheeze-control-api cheeze-ai-queue cheeze-discord-bot
systemctl status cloudflared nginx
```

**체크 항목:**

- [ ] 모든 CHEEZE 서비스 `active (running)` 상태
- [ ] Cloudflare Tunnel 연결 유지
- [ ] Nginx 정상 응답
- [ ] 감사 로그에 비정상적인 인증 실패 급증 없음

### 감사 로그 빠른 확인

```bash
# 오늘 감사 로그 확인
grep "$(date -u +%Y-%m-%d)" /opt/cheeze-control/portal-control-audit.log | \
  python3 -c "
import sys, json
for line in sys.stdin:
    try:
        e = json.loads(line)
        if e.get('result') not in ('ok',):
            print(f\"{e['timestamp']} | {e['result']} | {e.get('service_id')} | {e.get('ip_label') or e.get('ip')}\")
    except: pass
"
```

---

## 2. 주간 점검

**체크 항목:**

- [ ] 디스크 용량 확인 (`df -h`)
- [ ] 감사 로그 파일 크기 확인
- [ ] 각 서비스 메모리/CPU 사용량 확인 (`htop` 또는 `ps aux`)
- [ ] GitHub Actions 배포 히스토리 확인 (실패한 잡 없는지)
- [ ] 만료 예정 토큰 확인 (30일 이내 만료)
- [ ] Tailscale 연결 상태 확인

### 만료 예정 토큰 확인

```bash
python3 -c "
import json
from datetime import datetime, timezone, timedelta

with open('/opt/cheeze-control/portal-control-tokens.json') as f:
    data = json.load(f)

now = datetime.now(timezone.utc)
warn_before = now + timedelta(days=30)

for t in data.get('tokens', []):
    exp = t.get('expires_at')
    if exp:
        exp_dt = datetime.fromisoformat(exp.replace('Z', '+00:00'))
        if exp_dt < warn_before and not t.get('revoked_at'):
            days_left = (exp_dt - now).days
            print(f\"[경고] {t['token_id']} ({t['label']}): {days_left}일 후 만료\")
"
```

---

## 3. 월간 점검

**체크 항목:**

- [ ] 시스템 패키지 업데이트 (Gateway LXC, Proxmox 호스트)
- [ ] Python 의존성 취약점 확인
- [ ] 불필요한 토큰 폐기/정리
- [ ] 백업 복구 테스트 (Nextcloud 파일 1개 복구 테스트)
- [ ] SSL 인증서 만료일 확인 (Cloudflare 관리이므로 자동 갱신되지만 확인)
- [ ] 감사 로그 아카이브 및 정리
- [ ] Nextcloud/Paperless 업데이트
- [ ] 디스크 S.M.A.R.T 상태 확인 (중요 데이터 저장 디스크)

### 감사 로그 아카이브

```bash
# 3개월 이전 로그 아카이브
LOG=/opt/cheeze-control/portal-control-audit.log
ARCHIVE=/opt/cheeze-control/audit-archive/

mkdir -p $ARCHIVE
CUTOFF=$(date -d "3 months ago" +%Y-%m-%d)

# 오래된 항목 분리 (python3)
python3 -c "
import json, sys
from datetime import datetime, timezone, timedelta

cutoff = datetime.now(timezone.utc) - timedelta(days=90)
recent = []
old = []

with open('$LOG') as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            e = json.loads(line)
            ts = datetime.fromisoformat(e['timestamp'].replace('Z', '+00:00'))
            (old if ts < cutoff else recent).append(line)
        except:
            recent.append(line)

with open('$LOG', 'w') as f:
    f.write('\n'.join(recent) + '\n')

with open('${ARCHIVE}audit-$(date +%Y%m).log', 'w') as f:
    f.write('\n'.join(old) + '\n')

print(f'유지: {len(recent)}건, 아카이브: {len(old)}건')
"
```

---

## 4. 백업 전략

### 4.1 백업 대상

| 데이터 | 위치 | 중요도 | 백업 방법 |
|--------|------|--------|-----------|
| Nextcloud 파일 | Nextcloud 데이터 디렉토리 | 높음 | Nextcloud 내장 백업 or rsync |
| Nextcloud DB | PostgreSQL/MariaDB | 높음 | `occ maintenance:mode`, DB dump |
| Paperless-NGX 문서 | Paperless 미디어 디렉토리 | 높음 | rsync to 외장 스토리지 |
| Paperless DB | SQLite/PostgreSQL | 높음 | DB dump |
| 토큰 레지스트리 | `/opt/cheeze-control/portal-control-tokens.json` | 높음 | git에 예제만, 실제는 별도 백업 |
| IP 라벨 | `/opt/cheeze-control/portal-ip-labels.json` | 낮음 | 수동 복사 |
| 감사 로그 | `/opt/cheeze-control/portal-control-audit.log` | 중간 | 월간 아카이브 |
| Nginx 설정 | `/etc/nginx/` | 중간 | git 또는 별도 백업 |

### 4.2 Nextcloud 백업

```bash
# 1. 유지보수 모드 활성화
sudo -u www-data php /var/www/nextcloud/occ maintenance:mode --on

# 2. 파일 백업 (rsync)
rsync -avz /var/www/nextcloud/data/ /backup/nextcloud/data/

# 3. DB 백업 (MariaDB 예시)
mysqldump --single-transaction nextcloud > /backup/nextcloud/nextcloud-$(date +%Y%m%d).sql

# 4. 유지보수 모드 해제
sudo -u www-data php /var/www/nextcloud/occ maintenance:mode --off
```

### 4.3 Paperless-NGX 백업

```bash
# 문서 백업
rsync -avz /opt/paperless/media/ /backup/paperless/media/

# DB 백업 (SQLite 예시)
cp /opt/paperless/data/db.sqlite3 /backup/paperless/db-$(date +%Y%m%d).sqlite3
```

---

## 5. 토큰 관리

### 5.1 새 토큰 발급

```bash
# Gateway에서 토큰 생성 스크립트 실행
cd /opt/cheeze-control
python3 /var/www/home/deploy/gateway/generate-control-token.py
```

> 스크립트 경로: `/var/www/home/deploy/gateway/generate-control-token.py`

출력된 토큰값은 생성 시에만 확인 가능합니다. 즉시 수신자에게 전달하고 별도 저장하지 않습니다.

생성된 해시를 `/opt/cheeze-control/portal-control-tokens.json`에 추가:

```json
{
  "token_id": "friend-002",
  "label": "친구 B",
  "role": "friend",
  "token_hash": "<sha256-hash>",
  "allowed_services": ["minecraft-cobbleverse"],
  "allowed_actions": ["start", "stop"],
  "expires_at": "2027-01-01T00:00:00+09:00",
  "revoked_at": null
}
```

Portal API 재시작 불필요 — 파일은 매 요청마다 읽힙니다.

### 5.2 토큰 순환 (갱신)

1. 새 토큰 발급 (위 절차)
2. 수신자에게 새 토큰 전달
3. 이전 토큰의 `revoked_at` 설정:

```json
{
  "revoked_at": "2026-04-17T10:00:00+09:00"
}
```

### 5.3 토큰 폐기 (즉시)

```bash
# 레지스트리 편집
nano /opt/cheeze-control/portal-control-tokens.json

# 해당 토큰에 revoked_at 추가
# "revoked_at": "2026-04-17T10:00:00+09:00"
```

변경 즉시 적용됩니다 (재시작 불필요).

### 5.4 토큰 관리 원칙

- 최소 권한 원칙: 필요한 서비스/액션만 허용
- 만료일 설정 권장: 장기 미사용 토큰은 자동 만료
- 토큰 공유 금지: 인물/목적당 별도 토큰 발급
- 폐기 후 삭제하지 말 것: 감사 목적으로 `revoked_at` 기록 유지

---

## 6. 인증서 및 터널 관리

### 6.1 Cloudflare SSL 인증서

Cloudflare가 관리하는 인증서는 자동 갱신됩니다. 별도 작업 불필요.

**확인:**
- Cloudflare 대시보드 → SSL/TLS → Edge Certificates
- 만료 90일 전 자동 갱신

### 6.2 Cloudflare Tunnel

```bash
# Tunnel 상태 확인
systemctl status cloudflared

# Tunnel 커넥터 업데이트
cloudflared update
systemctl restart cloudflared

# 자동 업데이트 설정 확인
systemctl cat cloudflared
```

### 6.3 Tailscale

```bash
# Tailscale 업데이트 (Ubuntu/Debian)
apt update && apt install tailscale

# 인증 키 만료 확인
tailscale status

# 키 갱신 필요 시
tailscale up --authkey <new-auth-key>
```

---

## 7. 시스템 업데이트

### 7.1 Gateway LXC (Ubuntu/Debian)

```bash
# 패키지 업데이트
apt update && apt upgrade -y

# 서비스 재시작 필요 여부 확인
needrestart -b

# Python 패키지 업데이트 (필요 시)
pip3 list --outdated
```

**주의:** 커널 업데이트 후 LXC 재시작이 필요할 수 있습니다. Proxmox 관리 콘솔에서 진행합니다.

### 7.2 Nextcloud 업데이트

```bash
# 유지보수 모드 활성화
sudo -u www-data php /var/www/nextcloud/occ maintenance:mode --on

# 백업 수행 (4.2 참고)

# Nextcloud 업데이터 실행
sudo -u www-data php /var/www/nextcloud/updater/updater.phar

# DB 마이그레이션
sudo -u www-data php /var/www/nextcloud/occ upgrade

# 유지보수 모드 해제
sudo -u www-data php /var/www/nextcloud/occ maintenance:mode --off
```

### 7.3 Python 스크립트 업데이트

`git push` → GitHub Actions 자동 배포로 처리됩니다. [배포 절차](deployment.md) 참고.

---

## 8. 새 Minecraft 모드팩 추가

### 8.1 서버 파일 준비 (Windows PC)

1. 모드팩 서버 파일 다운로드 및 압축 해제
2. `eula.txt` → `eula=true` 설정
3. `server.properties` 기본 설정

### 8.2 Backend Agent 설정 추가

`deploy/backend/cheeze-backend-agent.py` 또는 설정 파일에 새 서비스 항목 추가:

```python
# 서비스 설정 예시
{
    "id": "minecraft-newpack",
    "name": "New Modpack",
    "type": "minecraft",
    "server_dir": "D:/Servers/newpack",
    "start_cmd": ["java", "-Xmx8G", "-jar", "server.jar", "nogui"],
    "port": 25566,
}
```

### 8.3 Control API 서비스 등록

`deploy/gateway/cheeze-control-api.py`에 서비스 ID 등록 및 포트 매핑 추가.

### 8.4 Portal API 시간 제한 (선택)

`deploy/gateway/cheeze-portal-api.py`의 `SERVICE_TIME_RESTRICTIONS`에 추가:

```python
SERVICE_TIME_RESTRICTIONS: dict = {
    "minecraft-newpack": {
        "start": {
            "blocked_start": 1,
            "blocked_end": 10,
            "allowed_window": "10:00 ~ 01:00 KST",
        },
    },
}
```

### 8.5 프론트엔드 등록

`js/services.js`의 `SERVICES` 배열에 추가 (상세는 [웹 페이지 가이드](../frontend/web-pages.md) 참고).

`index.html`의 `APP_CONFIG.control.services`에 서비스 ID 추가.

### 8.6 토큰 스코프 업데이트 (필요 시)

기존 토큰의 `allowed_services`가 `["*"]`이면 자동으로 허용됩니다.
특정 서비스만 허용된 토큰에는 새 서비스 ID를 추가합니다.

---

## 9. 디스크 용량 모니터링

### 9.1 현재 사용량 확인

```bash
# 파티션별 사용량
df -h

# 디렉토리별 사용량 (상위 10개)
du -sh /opt/cheeze-control/* | sort -rh | head -10
du -sh /var/www/home/* | sort -rh | head -10

# 로그 파일 크기
du -sh /var/log/nginx/
du -sh /opt/cheeze-control/portal-control-audit.log
journalctl --disk-usage
```

### 9.2 용량 임계값 권장

| 경로 | 경고 | 위험 |
|------|------|------|
| 루트 파티션 | 70% | 85% |
| Nextcloud 데이터 | 80% | 90% |
| 로그 파티션 | 75% | 90% |

### 9.3 공간 확보

```bash
# 오래된 journald 로그 정리 (30일 이전)
journalctl --vacuum-time=30d

# APT 캐시 정리
apt autoremove -y && apt clean

# 감사 로그 아카이브 (3. 월간 점검 참고)
```
