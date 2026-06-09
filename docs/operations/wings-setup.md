# Pterodactyl Wings 설치 가이드 (homepc WSL2)

> 최초 작성: 2026-04-19
> 대상: homepc Windows 11 + WSL2 Ubuntu

## 전제 조건

- homepc Tailscale IP: `100.86.252.21` (고정)
- Panel URL: `https://panel.edelweiss0297.cloud`
- WSL2 배포판: Ubuntu (기설치)
- Windows Tailscale이 실행 중이며 Gateway와 연결됨

---

## 단계 1 — Docker Engine 설치 (WSL2 Ubuntu)

```bash
# Docker 공식 설치 스크립트
curl -fsSL https://get.docker.com | sh

# 현재 사용자에게 docker 그룹 추가
sudo usermod -aG docker $USER

# 그룹 반영 (재로그인 대신 현재 세션에 적용)
newgrp docker

# 확인
docker --version
docker run --rm hello-world
```

---

## 단계 2 — Wings 바이너리 설치

```bash
# 설정 디렉터리 생성
sudo mkdir -p /etc/pterodactyl

# Wings 최신 바이너리 다운로드
sudo curl -L -o /usr/local/bin/wings \
  "https://github.com/pterodactyl/wings/releases/latest/download/wings_linux_amd64"

# 실행 권한 부여
sudo chmod u+x /usr/local/bin/wings

# 버전 확인
wings --version
```

---

## 단계 3 — Panel에서 노드 생성

Panel 웹 UI(`https://panel.edelweiss0297.cloud`)에 접속 후:

1. `Admin Panel` → `Nodes` → `Create New` 클릭
2. 아래 값으로 설정:

| 항목 | 값 |
|------|-----|
| Name | `homepc-wsl2` |
| FQDN | `wings.edelweiss0297.cloud` |
| Communicate Over SSL | **Yes** (외부는 `wings.edelweiss0297.cloud:443`, Gateway nginx 뒤 프록시) |
| Behind Proxy | Yes |
| Daemon Port | `443` |
| Daemon SFTP Port | `2023` |
| Memory (할당 가능) | 적절히 설정 (예: 16384 MB) |
| Memory Overallocate | 0 |
| Disk (할당 가능) | 적절히 설정 (예: 200000 MB) |
| Disk Overallocate | 0 |

3. 저장 후 노드 상세 페이지 → **Configuration** 탭 클릭
4. `config.yml` 내용 복사

---

## 단계 4 — config.yml 저장

Panel의 Configuration 탭에서 복사한 내용을 WSL2에 붙여넣기:

```bash
sudo nano /etc/pterodactyl/config.yml
# 복사한 내용 붙여넣기 → Ctrl+O 저장 → Ctrl+X 종료
```

또는 Panel UI에서 직접 `Download` 버튼 클릭 후 파일을 WSL2로 이동:

```bash
# Windows 다운로드 폴더에서 WSL2로 복사 (경로는 환경에 따라 다름)
sudo cp /mnt/c/Users/<윈도우유저>/Downloads/config.yml /etc/pterodactyl/config.yml
```

---

## 단계 5 — Windows Firewall 포트 허용

PowerShell (관리자)에서 실행:

```powershell
# Wings API 포트
New-NetFirewallRule -DisplayName "Pterodactyl Wings" `
  -Direction Inbound -Protocol TCP -LocalPort 8081 -Action Allow

# Wings SFTP 포트
New-NetFirewallRule -DisplayName "Pterodactyl Wings SFTP" `
  -Direction Inbound -Protocol TCP -LocalPort 2023 -Action Allow
```

---

## 단계 6 — Wings 기동 (디버그 모드로 테스트)

WSL2에서:

```bash
sudo wings --debug
```

Panel 노드 상세 페이지에서 **Heart Beat** 상태가 초록색으로 변하면 연결 성공.

`Ctrl+C`로 종료 후 다음 단계로.

---

## 단계 7 — systemd 서비스 등록 (안정화 후)

```bash
sudo bash -c 'cat > /etc/systemd/system/wings.service << "EOF"
[Unit]
Description=Pterodactyl Wings Daemon
After=docker.service
Requires=docker.service
PartOf=docker.service

[Service]
User=root
WorkingDirectory=/etc/pterodactyl
LimitNOFILE=4096
PIDFile=/var/run/wings/daemon.pid
ExecStart=/usr/local/bin/wings
Restart=on-failure
StartLimitInterval=180
StartLimitBurst=30
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF'

sudo systemctl daemon-reload
sudo systemctl enable --now wings
sudo systemctl status wings
```

### Windows 자동 기동

`systemctl enable wings` 만으로는 충분하지 않다. Wings는 WSL2 내부 서비스이므로,
WSL 배포판이 내려가면 heartbeat도 다시 빨간색으로 변한다.

빠른 운영 복구용 권장 방식:

1. Windows 로그인 시 WSL 배포판을 깨운다.
2. 같은 작업에서 `wings.service` 를 시작한다.
3. 필요하면 절전 복귀 시에도 같은 스크립트를 다시 실행한다.

예시 PowerShell 스크립트:

```powershell
Start-Sleep -Seconds 8
wsl.exe -d Ubuntu-D -u root -- bash -lc "systemctl start wings && systemctl is-active wings"
```

중요:

- 작업 스케줄러 실행 계정은 **현재 로그인 사용자**를 사용한다.
- `SYSTEM` 계정으로 만들면 사용자 WSL 배포판(`Ubuntu-D` 등)을 찾지 못하거나 깨우지 못해 자동 복구가 실패할 수 있다.
- 배포판 이름은 `wsl -l -q` 결과와 정확히 일치해야 한다.

권장 트리거:

- `ONLOGON`
- 절전 복귀 이벤트 (`Microsoft-Windows-Power-Troubleshooter`, Event ID 1)

---

## 단계 8 — 신규 서버 프로비저닝 테스트

Panel에서:

1. `Admin Panel` → `Servers` → `Create New`
2. Node: `homepc-wsl2` 선택
3. Egg: `Minecraft` (Vanilla) 선택
4. 리소스 한도 설정 후 생성
5. 서버 Console 탭에서 기동 확인

---

## 주의사항

- Wings는 **root**로 실행해야 함 (Docker 컨테이너 관리 권한 필요)
- WSL2가 꺼지면 Wings도 중단됨. `systemctl enable` 은 WSL 내부에서만 유효하므로, Windows에서는 별도 Task Scheduler 작업으로 WSL과 Wings를 깨워야 한다.
- Panel ↔ Wings 통신은 `wings.edelweiss0297.cloud:443` → Gateway nginx → `100.86.252.21:8081` 프록시 경로를 사용한다.
- SFTP 포트(`2023`)는 서버 파일 관리용이다. Node 설정의 SFTP 포트와 WSL2 `config.yml`의 `bind_port`를 항상 같이 변경한다.

---

## 문제 해결

| 증상 | 원인 | 해결 |
|------|------|------|
| Panel에서 노드 Heart Beat 빨간색 | 방화벽 차단 또는 Wings 미기동 | Firewall 규칙 확인, `sudo wings --debug` 재실행 |
| Wings 기동 시 Docker 오류 | Docker 서비스 미시작 | `sudo service docker start` |
| config.yml 오류 | Panel과 Wings 버전 불일치 | Panel에서 config 재다운로드 |
| 서버 생성 후 Installing 상태 고착 | Docker 이미지 풀 실패 | WSL2 인터넷 연결 확인 |
