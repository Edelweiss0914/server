# Cobbleverse Handoff

작성일: 2026-04-12
목적: 다음 세션에서 Cobbleverse 서버/웹 연동 작업을 바로 이어가기 위한 현재 상태 요약

## 1. 현재 결론

- `Cobbleverse` 서버는 **실기동 성공 기록이 있음**
- 외부/내부 접속 로그가 `latest.log` 에 남아 있음
- 현재 사용자가 종료를 요청해서 **지금은 서버를 내려 둔 상태**
- 홈페이지 코드에는 `minecraft-cobbleverse` 카드가 추가됨
- 단, **공개 웹페이지에 실제 반영하려면 gateway 정적 파일 배포가 아직 필요**

## 2. 실제 경로

### 서버 루트

- `D:\Servers\Minecraft\Modpacks\cobbleverse_server_1.7.3`

### 제어 스크립트

- `D:\Servers\Control\minecraft-cobbleverse\start.ps1`
- `D:\Servers\Control\minecraft-cobbleverse\run.ps1`
- `D:\Servers\Control\minecraft-cobbleverse\stop.ps1`

### backend agent live 파일

- `D:\Servers\Control\backend-agent\cheeze-backend-agent.py`
- `D:\Servers\Control\backend-agent\config.json`

## 3. 현재 서버 상태

### 확인된 사실

- backend agent에는 `minecraft-cobbleverse` 서비스가 등록되어 있음
- 실기동 시 `25566` 포트가 `LISTENING` 상태가 되었음
- `latest.log` 에 아래가 확인됨
  - `Starting Minecraft server on *:25566`
  - `Done (...)!`
- 실제 접속 로그가 남음
  - `_CHEEZE_0297`
  - `vhvhvhvhfej`

### 현재 시점 상태

- 사용자가 서버 종료를 요청함
- 실제 `netstat` 기준으로는 `25566` 에 `LISTENING` 이 없음
- `TIME_WAIT` 만 남아 있음
- 제어 디렉터리에도 `minecraft.pid`, `wrapper.pid`, `stop.flag` 가 없음

따라서 **실제 서버 프로세스는 종료된 상태로 본다.**

주의:

- backend agent가 잠깐 `starting` 으로 보일 수 있음
- 이건 실제 포트 상태보다 덜 신뢰할 수 있다
- 서버 on/off 판단은 `netstat :25566` 기준으로 보는 것이 맞다

## 4. 이번 세션에서 한 일

### 1. 1.7.3 서버팩 생성

- `cobbleverse_server_1.7.2` 를 베이스로 복제
- 대상 폴더:
  - `D:\Servers\Minecraft\Modpacks\cobbleverse_server_1.7.3`

### 2. 필수 모드 버전 정리

반영된 핵심:

- `Cobblemon-fabric-1.7.3+1.21.1.jar`
- `capturexp-fabric-1.7.3-1.3.0.jar`
- `timcore-fabric-1.7.3-1.31.0.jar`
- `LumyMon-0.6.5.jar`
- `LegendaryMonuments-Cobbleverse.jar`

### 3. Java 런타임 수정

`run.ps1` 에서 Java 25가 아니라 Java 21을 사용하도록 수정:

- 현재 사용 경로:
  - `C:\Program Files (x86)\Minecraft Launcher\runtime\java-runtime-delta\windows-x64\java-runtime-delta\bin\java.exe`

### 4. mods 재동기화

클라이언트 인스턴스 기준:

- 원본:
  - `D:\CurseForge\Instances\COBBLEVERSE - Pokemon Adventure [Cobblemon]\mods`

서버용으로 선별 복사 후 적용:

- 현재 live `mods` 폴더는 이 인스턴스를 기준으로 재구성된 상태

백업 폴더:

- `mods.backup-20260412-004400`
- `mods.prepared-swap-backup-20260412-004742`

### 5. 데이터팩 패치

#### `COBBLEVERSE-DP-v19-CF`

- zip 대신 폴더형 서버 데이터팩으로 사용 중
- 위치:
  - `D:\Servers\Minecraft\Modpacks\cobbleverse_server_1.7.3\datapacks\COBBLEVERSE-DP-v19-CF`
- 수정:
  - `raid_den.json` 의 `lumymon:music.raid` 참조 제거

#### `Z-A-Mega-DP`

- zip 대신 폴더형 서버 데이터팩으로 사용 중
- 위치:
  - `D:\Servers\Minecraft\Modpacks\cobbleverse_server_1.7.3\datapacks\Z-A-Mega-DP`
- 수정:
  - `data/mega_showdown/mega_showdown/mega/*.json` 34개에 새 스키마용 `aspect_conditions` 구조 추가

백업 zip:

- `D:\Servers\Minecraft\Modpacks\cobbleverse_server_1.7.3\datapacks\_server_backups`

## 5. 현재 남은 경고

서버 기동 자체를 막지는 않는 것:

- `Missing data pack badgebox`
- `Can't keep up!` 성능 경고
- 일부 `.old File ... is corrupt or missing` 로그

해석:

- `badgebox`는 현재 접속 차단 원인이 아니라 startup warning 수준으로 보임
- `Can't keep up` 는 초기 로드 직후 흔한 경고이며 즉시 치명적이지 않음
- `.old File ...` 은 신규 플레이어/마이그레이션 시 남는 진행도 백업 파일 관련 경고

## 6. 웹 UI 상태

저장소 코드 기준 반영 완료:

- `js/services.js` 에 `minecraft-cobbleverse` 추가
- 검색/빠른접근/온디맨드 control 카드 설정에 포함
- `minecraft-vanilla` 와 같은 템플릿 사용
- `start` 버튼은 기존 WOL-aware start 경로를 그대로 사용

즉:

- `portal facade -> internal control API -> backend agent`
- 절전/최대절전 상태면 gateway가 WOL 송신 후 서비스 시작

## 7. 내일 가장 먼저 할 일

1. gateway 정적 파일 실제 배포

필수 파일:

- `js/services.js`
- 필요하면 `js/app.js`

2. gateway 홈페이지에서 `Cobbleverse` 카드 노출 확인

3. 홈페이지 `시작` 버튼으로 실제 `Cobbleverse` 시작 테스트

4. `homepc` 를 sleep/hibernate 상태로 둔 뒤 WOL-aware start 실험

5. 결과를 보고

- WOL 성공 시 end-to-end 완료 문서화
- 실패 시 gateway `portal facade` 와 `control API` 로그 기준으로 역추적

## 8. 빠른 재개 체크리스트

### 서버를 다시 켜려면

```powershell
Invoke-WebRequest -UseBasicParsing -Method POST http://127.0.0.1:5010/services/minecraft-cobbleverse/start
```

### 상태 확인

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5010/services/minecraft-cobbleverse
netstat -ano | findstr :25566
```

### 로그 확인

```powershell
Get-Content 'D:\Servers\Minecraft\Modpacks\cobbleverse_server_1.7.3\logs\latest.log' -Tail 120
```

### 서버가 멈추지 않을 때

1. 먼저 graceful stop:

```powershell
Invoke-WebRequest -UseBasicParsing -Method POST http://127.0.0.1:5010/services/minecraft-cobbleverse/stop
```

2. 그래도 남으면 관리자 권한으로:

```powershell
netstat -ano | findstr :25566
taskkill /PID <PID> /F
```

## 9. 핵심 판단

- **서비스 자체는 이미 성공**
- **내일의 핵심은 웹 연동 실배포 + WOL end-to-end 검증**
- 서버팩 내부의 치명적 모드 불일치 단계는 넘겼다
