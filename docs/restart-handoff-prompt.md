# Restart Handoff Prompt

아래 블록은 재부팅 또는 세션 종료 후 다음 에이전트가 현재 상황을 빠르게 이어받기 위한 재개 프롬프트다.

```text
현재 프로젝트는 Proxmox 기반 홈 포털 + Windows 백엔드 오케스트레이션 환경이다.

현재 실제 상태:
- gateway-lxc
  - AI queue gateway 배포 완료
  - generic control API 배포 완료
- homepc
  - backend agent 배포 완료
  - ollama 상태 조회 정상
  - minecraft-vanilla start/stop 정상
  - minecraft-cobbleverse 서비스 live 등록 완료
- tailscale
  - gateway-lxc = 100.75.209.83
  - homepc = 100.86.252.21
- homepc LAN = 192.168.50.85
- homepc MAC = 9C-6B-00-57-73-3A

Minecraft Vanilla 실제 값:
- server root = D:\Servers\Minecraft\Vanilla
- control root = D:\Servers\Control\minecraft-vanilla
- java = C:\Program Files (x86)\Minecraft Launcher\runtime\java-runtime-epsilon\windows-x64\java-runtime-epsilon\bin\java.exe
- jar = server.jar
- memory = -Xms4G -Xmx4G

Cobbleverse 실제 값:
- server root = D:\Servers\Minecraft\Modpacks\cobbleverse_server_1.7.3
- control root = D:\Servers\Control\minecraft-cobbleverse
- java = C:\Program Files (x86)\Minecraft Launcher\runtime\java-runtime-delta\windows-x64\java-runtime-delta\bin\java.exe
- launcher jar = fabric-server-launch.jar
- port = 25566
- live mods 는 CurseForge 클라이언트 인스턴스 기준으로 재동기화됨
- `COBBLEVERSE-DP-v19-CF` 와 `Z-A-Mega-DP` 는 서버용 폴더 데이터팩으로 패치됨
- 현재 시점에는 사용자가 종료 요청을 해서 서버를 내려 둔 상태

현재 구조:
- Browser -> /ai -> gateway queue -> Ollama
- Browser -> /api/control -> portal facade -> internal control API -> backend agent -> service scripts

검증 완료:
- AI API 외부 공개 완료
- homepage AI card/후속 질문 UX 완료
- minecraft-vanilla gateway start/stop 완료
- state 모델 starting/running/stopping/offline 동작 확인
- Cobbleverse 서버 실기동 성공 기록 있음
- latest.log 에서 `Done (...)!` 확인됨
- 실제 클라이언트 접속 로그도 남아 있음

현재 프런트 상태:
- 검색창 AI 카드 존재
- AI 응답 하단 후속 질문 존재
- 온디맨드 서비스 카드(Minecraft Vanilla) 코드 반영 완료
- 온디맨드 서비스 카드(Cobbleverse) 코드 반영 완료
- /api/control proxy 예시 파일 존재
- control card 상태 자동 갱신 반영
  - 평시 10초
  - starting/stopping/waking 중 2초
  - 탭/포커스 복귀 시 즉시 갱신
- backend sleep/hibernate 시 status 조회를 `offline` 으로 처리하는 코드 반영 완료
- start 요청 중 background polling 충돌 완화 코드 반영 완료
- gateway wake timeout 기본값 `150초` 로 상향
- `/control/` proxy timeout 예시 `210초` 로 상향

다음 작업:
1. gateway-lxc 에 수정된 homepage 정적 파일 실제 반영
   - 특히 `js/services.js`
2. gateway 홈페이지에서 Cobbleverse 카드 노출 확인
3. 홈페이지에서 Cobbleverse 상태/시작/종료 버튼 실제 동작 검증
4. homepc 를 sleep/hibernate 상태로 둔 뒤 Cobbleverse WOL-aware start 검증
5. 결과를 docs/cobbleverse-handoff-2026-04-12.md 와 작업 로그에 기록
6. 이후 idle 감지 + auto hibernate 구현

관련 문서:
- docs/orchestrator-current-status.md
- docs/WOL-plan.md
- docs/WOL-start-flow.md
- docs/on-demand-service-architecture.md
- docs/cobbleverse-handoff-2026-04-12.md
```
