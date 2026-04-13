# CHEEZE 자동 배포 (GitHub Actions)

## 개요

`main` 브랜치에 push하면 GitHub Actions가 자동으로:
- gateway LXC에서 `git pull` + 변경된 서비스만 재시작
- Windows homepc에서 `git pull` + 백엔드 에이전트 재시작

수동으로 SSH 접속하거나 git pull 명령을 실행할 필요가 없습니다.

---

## 아키텍처

```
git push (main)
    │
    └─ GitHub Actions
          ├─ Job: deploy-gateway  [self-hosted, gateway]
          │     git pull /var/www/home
          │     변경 파일 감지
          │     ├─ cheeze-portal-api.py  → /opt/cheeze-control/ + restart
          │     ├─ cheeze-control-api.py → /opt/cheeze-control/ + restart
          │     ├─ cheeze-ai-queue.py    → /opt/cheeze-ai/      + restart
          │     ├─ cheeze-discord-bot.py → /opt/cheeze-bot/     + restart
          │     └─ index.html / css / js → git pull 자체로 완료
          │
          └─ Job: deploy-homepc   [self-hosted, homepc]
                git pull D:\Project
                변경 파일 감지
                └─ cheeze-backend-agent.py → C:\ProgramData\CHEEZE\... + 태스크 재시작
```

---

## 최초 설정 (한 번만)

### 1단계 — SSH 인증 키 설정 (gateway)

HTTPS 대신 SSH를 사용해야 비밀번호 없이 git pull이 가능합니다.

```bash
# gateway에서 실행
ssh-keygen -t ed25519 -C "cheeze-gateway-deploy" -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub
```

출력된 공개키를 GitHub → Settings → Deploy keys → Add deploy key에 등록합니다.
(Read access만으로 충분)

```bash
# SSH 설정 추가
cat >> ~/.ssh/config << 'EOF'
Host github.com
  IdentityFile ~/.ssh/github_deploy
  StrictHostKeyChecking no
EOF

# remote URL을 SSH로 변경
cd /var/www/home
git remote set-url origin git@github.com:Edelweiss0914/server.git
git pull  # 테스트
```

### 2단계 — gateway에 runner 설치

```bash
mkdir -p /opt/github-runner && cd /opt/github-runner

# GitHub → 저장소 → Settings → Actions → Runners → New self-hosted runner
# Linux x64 선택 후 표시되는 Download/Configure 명령어 그대로 실행
# config.sh 실행 시 labels 입력란에: gateway

# 서비스로 등록
./svc.sh install
./svc.sh start
systemctl status actions.runner.*
```

### 3단계 — homepc에 runner 설치 (PowerShell 관리자)

```powershell
mkdir C:\actions-runner; cd C:\actions-runner

# GitHub → 저장소 → Settings → Actions → Runners → New self-hosted runner
# Windows x64 선택 후 표시되는 명령어 그대로 실행
# config.cmd 실행 시 labels 입력란에: homepc

# Windows 서비스로 등록
.\svc.ps1 install
.\svc.ps1 start
Get-Service -Name "actions.runner.*"
```

### 4단계 — homepc git SSH 설정

```powershell
# Git Bash 또는 PowerShell에서
ssh-keygen -t ed25519 -C "cheeze-homepc-deploy" -f "$env:USERPROFILE\.ssh\github_deploy_homepc"
Get-Content "$env:USERPROFILE\.ssh\github_deploy_homepc.pub"
```

공개키를 GitHub Deploy keys에 추가 (gateway 키와 별개로 등록).

```powershell
# SSH config 추가 (C:\Users\zoop7\.ssh\config)
Add-Content "$env:USERPROFILE\.ssh\config" @"
Host github.com
  IdentityFile $env:USERPROFILE\.ssh\github_deploy_homepc
  StrictHostKeyChecking no
"@

# remote URL 변경
cd D:\Project
git remote set-url origin git@github.com:Edelweiss0914/server.git
git pull  # 테스트
```

---

## 배포 흐름 확인

push 후 GitHub → 저장소 → Actions 탭에서 실시간 로그 확인 가능.

각 Job의 "Pull & deploy" 스텝에서:
- `Changed files` 목록으로 무엇이 감지됐는지 확인
- `✓ [서비스명] restarted` 메시지로 재시작 여부 확인

---

## 장애 대응

### Runner가 오프라인 상태 (GitHub Actions 탭에서 회색 표시)

**gateway runner:**
```bash
systemctl status actions.runner.*
systemctl restart actions.runner.*
journalctl -u actions.runner.* -n 50
```

**homepc runner:**
```powershell
Get-Service -Name "actions.runner.*"
Restart-Service -Name "actions.runner.*"
```

---

### 배포 Job이 실패한 경우

1. GitHub Actions 탭 → 실패한 Job 클릭 → 로그 확인
2. 오류 내용에 따라 아래 수동 복구 절차 진행

---

### 수동 복구 절차

push는 됐지만 자동 배포가 실패했을 때 직접 배포합니다.

**gateway — 전체 수동 배포:**
```bash
cd /var/www/home
git pull origin main

# 필요한 서비스만 선택해서 실행
cp deploy/gateway/cheeze-portal-api.py /opt/cheeze-control/cheeze-portal-api.py
systemctl restart cheeze-portal-api

cp deploy/gateway/cheeze-control-api.py /opt/cheeze-control/cheeze-control-api.py
systemctl restart cheeze-control-api

cp deploy/gateway/cheeze-ai-queue.py /opt/cheeze-ai/cheeze-ai-queue.py
systemctl restart cheeze-ai-queue

cp deploy/discord-bot/cheeze-discord-bot.py /opt/cheeze-bot/cheeze-discord-bot.py
systemctl restart cheeze-discord-bot
```

**homepc — 수동 배포:**
```powershell
cd D:\Project
git pull origin main

Stop-ScheduledTask -TaskName "CHEEZE Backend Agent"
Start-Sleep -Seconds 2
Copy-Item "deploy\backend\cheeze-backend-agent.py" "C:\ProgramData\CHEEZE\backend-agent\cheeze-backend-agent.py" -Force
Start-ScheduledTask -TaskName "CHEEZE Backend Agent"
```

---

### 잘못된 코드가 배포된 경우 (롤백)

```bash
# gateway에서
cd /var/www/home
git log --oneline -10          # 되돌릴 커밋 해시 확인
git revert HEAD                # 가장 최근 커밋 되돌리기 (새 커밋 생성)
git push origin main           # push → 자동 배포로 롤백 적용
```

또는 특정 커밋으로 되돌리기:
```bash
git revert <커밋해시>
git push origin main
```

> `git reset --hard`는 사용하지 마세요. push force가 필요해지고 이력이 사라집니다.

---

### 서비스 상태 확인

```bash
# gateway — 전체 서비스 상태 한눈에
systemctl status cheeze-portal-api cheeze-control-api cheeze-ai-queue cheeze-discord-bot --no-pager

# 특정 서비스 로그
journalctl -u cheeze-ai-queue -n 50 --no-pager
```

```powershell
# homepc — 백엔드 에이전트 상태
Get-ScheduledTask -TaskName "CHEEZE Backend Agent"
# 로그 위치: C:\ProgramData\CHEEZE\backend-agent\
```

---

## 파일-서비스 매핑 참조

| 변경 파일 (git 경로) | 배포 위치 | 재시작 서비스 |
|----------------------|-----------|---------------|
| `deploy/gateway/cheeze-portal-api.py` | `/opt/cheeze-control/` | `cheeze-portal-api` |
| `deploy/gateway/cheeze-control-api.py` | `/opt/cheeze-control/` | `cheeze-control-api` |
| `deploy/gateway/cheeze-ai-queue.py` | `/opt/cheeze-ai/` | `cheeze-ai-queue` |
| `deploy/discord-bot/cheeze-discord-bot.py` | `/opt/cheeze-bot/` | `cheeze-discord-bot` |
| `deploy/backend/cheeze-backend-agent.py` | `C:\ProgramData\CHEEZE\backend-agent\` | CHEEZE Backend Agent (태스크) |
| `index.html`, `admin.html`, `servers.html`, `css/`, `js/` | `/var/www/home/` (git 자체) | 불필요 |

> `config.json` 등 민감 정보가 담긴 설정 파일은 자동 배포 대상에서 제외됩니다.
> 설정 변경 시 해당 머신에서 직접 수정 후 서비스를 재시작하세요.

