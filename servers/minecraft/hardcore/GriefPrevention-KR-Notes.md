# GriefPrevention Korean Notes

작성일: 2026-04-15
서버 경로: `D:\Servers\Minecraft\Hardcore`
대상 플러그인: `GriefPrevention 16.18.7`

## 현재 상태

- 공식 `GriefPrevention 16.18.7`은 현재 하드코어 서버의 Paper 버전에서 정상 로드 확인됨
- 별도 소스 포크 없이 공식 JAR 그대로 사용 중
- 플레이어가 자주 보는 메시지는 `messages.yml` 기준으로 한국어 번역 적용
- `/help` 계열 명령 설명은 `help.yml` 오버라이드로 한국어 설명 추가

## 반영된 파일

- `D:\Servers\Minecraft\Hardcore\plugins\GriefPrevention.jar`
- `D:\Servers\Minecraft\Hardcore\plugins\GriefPreventionData\config.yml`
- `D:\Servers\Minecraft\Hardcore\plugins\GriefPreventionData\messages.yml`
- `D:\Servers\Minecraft\Hardcore\help.yml`

참고:
- PowerShell 콘솔에서는 한글이 깨져 보일 수 있음
- 실제 인게임 출력과 파일 저장 상태가 더 중요함

## 이미 조정한 설정

- `InitialBlocks: 400`
- `Claim Blocks Accrued Per Hour.Default: 200`
- `AutomaticNewPlayerClaimsRadius: 5`

의도:
- 초반에 바로 "클레임 블록 부족"이 뜨지 않도록 시작 자원을 늘림
- 장기 플레이로 점진적으로 보호 구역을 넓힐 수 있게 함

## 운영 중 다시 적용하는 방법

메시지/설정 재적용:

```text
/gpreload
```

권장 확인:

```text
/claimslist
/claimbook
/help claim
/help trust
/help adminclaims
```

## 한글화 범위

다음 항목은 한국어화 진행 완료:

- 클레임 생성, 포기, 삭제
- 권한 부여 및 회수
- 보호되지 않은 상자 안내
- 건축/상자/버튼 사용 권한 거부
- `/trapped` 안내
- 책 형태 가이드 문구
- 공성, PvP, 드롭 잠금, 펫 이전 등 주요 시스템 메시지
- 주요 GriefPrevention 명령의 `/help` 설명

## 아직 남을 수 있는 부분

- 드물게 쓰는 관리자 메시지 일부
- 플러그인 내부 정규식/노트 설명 같은 운영자용 문자열
- 콘솔 로그의 한글 깨짐 현상

중요:
- 콘솔 깨짐은 번역 실패가 아니라 Windows 콘솔 인코딩 문제일 가능성이 큼
- 인게임에서 실제로 한국어가 보이면 정상 반영으로 판단

## 다음 단계 권장

1. 하드코어 성향에 맞는 보호 밸런스 튜닝

- 초반: 작은 개인 보호는 가능
- 중후반: 플레이 시간으로 확장
- 권장 검토값:
  - `InitialBlocks`
  - `Claim Blocks Accrued Per Hour`
  - `Max Accrued Claim Blocks`
  - `AutomaticNewPlayerClaimsRadius`
  - `MinimumWidth`
  - `MinimumArea`

2. 차원별 정책 확정

- 현재 `world_nether`, `world_the_end`는 클레임 비활성화
- 의도 유지 여부를 확정할 것
- 하드코어 서버라면 네더/엔드는 무보호로 두는 방향도 일관성 있음

3. 플레이어 온보딩 정리

- 최초 접속 후 `/claimbook` 지급 문구 확인
- 스폰 지역에 짧은 안내 표지판 또는 안내문 추가 검토
- 핵심 명령:
  - `/claim`
  - `/trust`
  - `/untrust`
  - `/claimslist`
  - `/abandonclaim`

4. Deathban 플러그인 메시지 인코딩 정리

- `HardcoreDeathban` 쪽은 현재 로그/설정에서 한글이 깨질 수 있음
- 기능 자체는 동작하지만, 사용자 경험을 위해 다음 정리 대상임

5. `/help` 최종 검수

- 다음 서버 재시작 후 아래 항목 점검 권장:
  - `/help claim`
  - `/help claimslist`
  - `/help trust`
  - `/help trapped`
  - `/help adminclaims`

## 메모

- GriefPrevention 공식 릴리즈는 현재 서버 버전과 호환됨
- 지금 단계에서 포크/커스텀 빌드는 필요하지 않음
- 유지보수 리스크를 줄이기 위해 공식 JAR + 설정/메시지 오버라이드 전략을 사용함
