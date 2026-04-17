# Backend PC (homepc)

## 개요

게임 서버(Minecraft), Ollama AI, cheeze-backend-agent가 실행되는 Windows 11 홈 PC입니다.
평소에는 하이버네이션 상태를 유지하다가, Gateway LXC에서 WOL(Wake-on-LAN) 신호를 받아 부팅됩니다.

---

## 하드웨어 / OS

| 항목 | 값 |
|------|----|
| OS | Windows 11 Home |
| LAN IP | 192.168.50.85 |
| Tailscale IP | 100.86.252.21 |
| MAC 주소 | `9C-6B-00-57-73-3A` (WOL 대상) |

---

## 네트워크

| 인터페이스 | IP | 역할 |
|------------|----|------|
| 이더넷 (LAN) | 192.168.50.85 | 홈 네트워크 연결, WOL 수신 |
| Tailscale | 100.86.252.21 | Gateway LXC와 암호화 통신 |

- **WOL**: Gateway LXC가 `192.168.50.255` (브로드캐스트)로 매직 패킷 전송
- **Tailscale**: cheeze-backend-agent, Ollama 통신에 사용 (LAN이 아닌 Tailscale IP 경유)

---

## cheeze-backend-agent

Backend PC의 상태 보고 및 서비스 제어를 담당하는 Python HTTP 에이전트입니다.

| 항목 | 값 |
|------|----|
| 포트 | `5010` |
| 설치 경로 | `C:\ProgramData\CHEEZE\backend-agent\` (GitHub Actions 배포 시) |
| 실행 파일 | `cheeze-backend-agent.py` |
| 설정 파일 | `cheeze-backend-agent-config.json` |

### 주요 기능

- 시스템 상태 보고 (CPU, 메모리, 디스크)
- 게임 서버 시작/중지 (PowerShell 스크립트 실행)
- 하이버네이션 inhibit 플래그 관리
- 유휴 상태 감지 및 자동 하이버네이션 준비

### 설정 파일 구조 (`cheeze-backend-agent-config.json`)

```json
{
  "listen_host": "0.0.0.0",
  "listen_port": 5010,
  "agent_token": "<설정 필요>",
  "services": {
    "minecraft-vanilla": {
      "start_script": "D:\\Servers\\Control\\minecraft-vanilla\\start.ps1",
      "stop_script": "D:\\Servers\\Control\\minecraft-vanilla\\stop.ps1"
    },
    "minecraft-cobbleverse": {
      "start_script": "D:\\Servers\\Control\\minecraft-cobbleverse\\start.ps1",
      "stop_script": "D:\\Servers\\Control\\minecraft-cobbleverse\\stop.ps1"
    }
  }
}
```

> `agent_token`은 실제 값을 이 문서에 기재하지 않습니다. 배포 시 별도 설정 파일에서 관리합니다.

---

## 서버 디렉토리 구조

```
D:\Servers\
  Minecraft\
    Vanilla\                        # Vanilla Minecraft 서버 파일
    Modpacks\
      ssibal_cobbleverse_multi\     # Cobbleverse 모드팩 서버 파일

  Control\
    minecraft-vanilla\
      start.ps1                     # Vanilla 서버 시작 스크립트
      stop.ps1                      # Vanilla 서버 중지 스크립트
    minecraft-cobbleverse\
      start.ps1                     # Cobbleverse 서버 시작 스크립트
      stop.ps1                      # Cobbleverse 서버 중지 스크립트
```

---

## PowerShell 제어 스크립트

### start.ps1 (Vanilla 예시)

```powershell
# D:\Servers\Control\minecraft-vanilla\start.ps1
Set-Location "D:\Servers\Minecraft\Vanilla"
Start-Process -FilePath "java" `
    -ArgumentList "-Xmx4G -Xms1G -jar server.jar nogui" `
    -WindowStyle Hidden
```

### stop.ps1 (Vanilla 예시)

```powershell
# D:\Servers\Control\minecraft-vanilla\stop.ps1
# 실행 중인 서버 프로세스에 stop 명령 전송 또는 종료
Stop-Process -Name "java" -Force
```

---

## 게임 서버 포트

| 서버 | 포트 | 설명 |
|------|------|------|
| Minecraft Vanilla | 25565 | 기본 Minecraft 포트 |
| Minecraft Cobbleverse | 25566 | 모드팩 서버 포트 |

---

## 하이버네이션 관리

### 자동 하이버네이션 조건

모든 조건이 동시에 충족될 때만 하이버네이션이 허용됩니다:

| 조건 | 기준 |
|------|------|
| 모든 서비스 오프라인 | Minecraft 서버 등 관리 대상 서비스 모두 중지됨 |
| WTS 세션 없음 | Windows Terminal Service 활성 사용자 세션 없음 |
| no-sleep.flag 미존재 | inhibit 플래그 파일(`D:\Servers\Control\no-sleep.flag`)이 없음 |
| inhibit 스케줄 외 시간대 | 하이버네이션 억제 스케줄 시간대가 아님 |
| 디스크 여유 공간 | C: 드라이브 20GB 이상 여유 |

### Inhibit 플래그 (`no-sleep.flag`)

cheeze-backend-agent는 서비스 실행 중 하이버네이션을 방지하기 위해 inhibit 플래그 파일을 사용합니다.

```
# 플래그 파일 경로 (예시)
D:\Servers\Control\no-sleep.flag
```

- 파일이 존재하면 하이버네이션 차단
- 모든 서비스가 중지되고 조건 충족 시 파일 삭제 → 하이버네이션 허용

### 하이버네이션 흐름

```
서비스 중지 요청
      ↓
stop.ps1 실행
      ↓
서비스 상태 확인 (모두 오프라인?)
      ↓
WTS 세션 없음 확인
      ↓
no-sleep.flag 미존재 확인
      ↓
inhibit 스케줄 외 시간대 확인
      ↓
C: 드라이브 20GB+ 여유 확인
      ↓
no-sleep.flag 삭제 (존재 시)
      ↓
Windows 하이버네이션 실행
```

---

## 유휴 감지 및 자동 중지

cheeze-backend-agent가 주기적으로 시스템 상태를 확인하여 자동 하이버네이션을 준비합니다.

- 게임 서버 플레이어 수 모니터링 (RCON 또는 로그 파싱)
- 플레이어 0명 + 미활동 기준 시간 초과 시 서버 stop 스크립트 실행
- 이후 하이버네이션 조건 충족 시 자동 슬립

---

## GitHub Actions Runner

| 항목 | 값 |
|------|----|
| label | `homepc` |
| 역할 | Backend PC에서 실행되는 CI/CD 작업 (빌드, 배포 등) |
| OS | Windows 11 |

```powershell
# 러너 서비스 상태 확인 (PowerShell)
Get-Service -Name "actions.runner.*"
```

---

## Ollama

로컬 LLM 추론 서버입니다. Gateway LXC의 cheeze-ai-queue가 Tailscale을 통해 접근합니다.

| 항목 | 값 |
|------|----|
| 포트 | `11434` |
| 접근 URL | `http://100.86.252.21:11434` (Tailscale IP) |
| 관리 | Ollama 공식 Windows 설치 프로그램 사용 |

```powershell
# Ollama 상태 확인
ollama list
ollama ps
```

---

## 주요 운영 참고사항

- Backend PC가 하이버네이션 상태일 때 접근하려면 Gateway LXC에서 WOL을 먼저 전송해야 합니다.
- cheeze-control-api가 자동으로 WOL → 부팅 확인 → 명령 전달 순서를 처리합니다 (최대 150초 대기).
- Tailscale 서비스는 Windows 부팅 시 자동 시작되도록 설정해야 합니다.
- cheeze-backend-agent도 Windows 시작 프로그램 또는 Task Scheduler에 등록하여 자동 실행합니다.

---

## 관련 문서

- [Gateway LXC 상세](gateway-lxc.md)
- [Tailscale VPN 구성](tailscale-vpn.md)
- [Proxmox 호스트](proxmox-host.md)
