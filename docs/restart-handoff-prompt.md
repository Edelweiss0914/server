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

현재 구조:
- Browser -> /ai -> gateway queue -> Ollama
- Browser -> /control -> gateway control API -> backend agent -> service scripts

검증 완료:
- AI API 외부 공개 완료
- homepage AI card/후속 질문 UX 완료
- minecraft-vanilla gateway start/stop 완료
- state 모델 starting/running/stopping/offline 동작 확인

현재 프런트 상태:
- 검색창 AI 카드 존재
- AI 응답 하단 후속 질문 존재
- 온디맨드 서비스 카드(Minecraft Vanilla) 코드 반영 완료
- /control proxy 예시 파일 존재
- control card 상태 자동 갱신 반영
  - 평시 10초
  - starting/stopping/waking 중 2초
  - 탭/포커스 복귀 시 즉시 갱신
- backend sleep/hibernate 시 status 조회를 `offline` 으로 처리하는 코드 반영 완료
- start 요청 중 background polling 충돌 완화 코드 반영 완료
- gateway wake timeout 기본값 `150초` 로 상향
- `/control/` proxy timeout 예시 `210초` 로 상향

다음 작업:
1. gateway-lxc 에 수정된 `cheeze-control-api.py`, systemd env, `js/app.js` 실제 반영
2. gateway `home.conf` 에 `/control/` 프록시 및 timeout 반영
3. 홈페이지에서 Minecraft Vanilla 상태/시작/종료 버튼 실제 동작 검증
4. 필요 시 WOL-aware start를 homepc hibernate 상태에서 검증
5. 이후 idle 감지 + auto hibernate 구현

관련 문서:
- docs/orchestrator-current-status.md
- docs/WOL-plan.md
- docs/WOL-start-flow.md
- docs/on-demand-service-architecture.md
```
