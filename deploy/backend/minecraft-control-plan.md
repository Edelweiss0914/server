# Minecraft Control Plan

## 시작/종료 명령은 누가 정해야 하는가

실제 시작/종료 명령은 서버 구성을 아는 운영자가 정해야 한다.

이유:

- 서버 jar 이름이 다를 수 있음
- 메모리 할당량이 다를 수 있음
- 모드팩마다 전용 시작 스크립트가 있을 수 있음
- 종료 방식도 환경마다 다름

따라서 제어 시스템은 "스크립트를 호출"하고, 실제 스크립트 내용은 운영자가 맞춰 넣는 방식이 가장 안전하다.

## 권장 폴더 구조

```text
D:\Servers\Minecraft\Vanilla
D:\Servers\Minecraft\Modpacks\<modpack-name>
D:\Servers\Control\minecraft-vanilla
D:\Servers\Control\minecraft-<modpack-name>
```

권장 파일:

```text
D:\Servers\Control\minecraft-vanilla\start.ps1
D:\Servers\Control\minecraft-vanilla\stop.ps1
```

모드팩도 같은 방식:

```text
D:\Servers\Control\minecraft-<modpack-name>\start.ps1
D:\Servers\Control\minecraft-<modpack-name>\stop.ps1
```

## 왜 별도 Control 폴더를 두는가

- 서버 폴더와 운영 스크립트를 분리할 수 있음
- 모드팩 교체나 서버 업데이트 시 제어 스크립트 유지가 쉬움
- 백엔드 에이전트가 같은 규칙으로 호출 가능

## 현재 제공한 템플릿

- `deploy/backend/minecraft-vanilla/start.ps1.example`
- `deploy/backend/minecraft-vanilla/stop.ps1.example`
- `deploy/backend/minecraft-cobbleverse/start.ps1.example`
- `deploy/backend/minecraft-cobbleverse/run.ps1.example`
- `deploy/backend/minecraft-cobbleverse/stop.ps1.example`
- `deploy/backend/minecraft-modpack/start.ps1.example`
- `deploy/backend/minecraft-modpack/stop.ps1.example`

## 현재 필요한 실제 입력

현재 반영된 값:

1. Vanilla 서버 jar 파일명
   - `server.jar`
2. Vanilla 서버 메모리 할당량
   - `-Xms4G -Xmx4G`
3. Java 실행 경로
   - `C:\Program Files (x86)\Minecraft Launcher\runtime\java-runtime-epsilon\windows-x64\java-runtime-epsilon\bin\java.exe`
3. 종료 방식
   - 관리자 종료 요청
   - 정책 종료(새벽 1시, 장시간 활동 미감지 시)
    - 현재 스캐폴드는 wrapper가 `stop` 명령을 표준 입력으로 전달
    - `120초` 내 종료 실패 시에만 강제 종료

## 현재 추천

1. 시작은 `run.ps1` 에서 `java -Xms4G -Xmx4G -jar server.jar nogui`
2. 종료는 현재 wrapper 기반 graceful stop 을 우선 사용
3. `120초` 내 종료되지 않을 때만 강제 종료
4. 이후 필요하면 `RCON stop` 으로도 업그레이드 가능
4. 모드팩은 템플릿 복제 후 modpack별로 개별 제어

## Cobbleverse 시작점

저장소에 바로 쓸 수 있는 Cobbleverse 전용 스캐폴드도 추가한다.

기본 기준:

- 서비스 ID: `minecraft-cobbleverse`
- 서버 루트: `D:\Servers\Minecraft\Modpacks\cobbleverse_server_1.7.3`
- 제어 루트: `D:\Servers\Control\minecraft-cobbleverse`
- 기본 포트: `25566`
- 초기 메모리 예시: `-Xms6G -Xmx6G`
- 실행 jar: `fabric-server-launch.jar`

주의:

- `run.ps1.example` 의 `JavaExe`, `JarName`, 메모리 값은 실제 Cobbleverse 서버팩 기준으로 마지막 확인 후 적용해야 한다.
- 배포 전 `server.properties` 의 포트와 backend/orchestrator 예시 파일의 포트가 일치해야 한다.
