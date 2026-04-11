# Phase 2 Preflight Report

작성일: 2026-04-11
범위: `Nginx LXC gateway` 와 `Windows backend desktop` 간 Tailscale 기반 망분리 및 AI 프록시 준비

## 1. 목적

Phase 2의 목표는 `Docker VM` 이 아니라 `Nginx LXC 게이트웨이` 와 `백엔드 데스크톱` 을 Tailscale 오버레이 네트워크로 직접 연결해, 향후 `Ollama`, `ComfyUI`, 게임 서버 같은 백엔드 서비스를 `Nginx` 가 `100.x.x.x` 주소로 직접 프록시하도록 만드는 것이다.

이 설계의 의도는 다음과 같다.

- 외부 공개 지점은 계속 `Nginx LXC` 로 단일화
- 내부 AI/게임 트래픽은 Tailscale 사설망으로 직접 전달
- hairpinning 감소
- 프론트엔드와 백엔드 역할 분리 유지
- 향후 Windows 백엔드를 절전 대기 후 필요시 깨우는 구조와도 양립 가능

## 2. 현재 확인된 환경

### Proxmox Host

- Hostname: `ds-node1`
- OS: `Debian GNU/Linux 13 (trixie)`
- Kernel: `6.17.2-1-pve`
- Proxmox VE: `9.1.1`

핵심 버전:

- `proxmox-ve: 9.1.0`
- `pve-manager: 9.1.1`
- `lxc-pve: 6.0.5-3`
- `pve-container: 6.0.18`

판단:

- Proxmox 9 계열이므로 LXC 장치 허용 설정은 `cgroup2` 기준으로 작성한다.

### Gateway LXC

- CTID: `200`
- Hostname: `gateway-lxc`
- OS: `Rocky Linux 9.4 (Blue Onyx)`
- Kernel view in CT: `6.17.2-1-pve`
- Nginx: `1.20.1`
- Nginx 상태: `active`

네트워크:

- `net0`: `vmbr0`, `ip=dhcp`
- `net1`: `vmbr1`, `ip=10.0.0.1/24`

중요 판정:

- 현재 `pct config 200` 에 `unprivileged: 1` 이 없다.
- 따라서 현행 `CT 200` 은 `Privileged LXC` 로 간주한다.

### Windows Backend

- OS: `Windows 11 Home 25H2`
- OS Build: `26200.8037`
- Tailscale version: `1.96.3`
- 현재 상태: 설치됨, 현재 연결은 꺼져 있음

## 3. 현재 아키텍처 해석

### Frontend

- `Nginx LXC`: 외부 도메인 진입점, 리버스 프록시, SSL 통제의 중심
- `Docker VM`: Nextcloud, Paperless-ngx, ArchiveBox 등 데이터 서비스

### Backend

- 고성능 Windows 데스크톱
- 평상시 절전 대기
- 필요시 AI 및 게임 서버 기동

### Phase 2 연결 모델

권장 연결은 아래와 같다.

`Internet -> Cloudflare -> Nginx LXC -> Tailscale 100.x -> Windows Desktop Service`

즉, `Docker VM` 은 데이터 서비스용으로 유지하고, AI/게임 트래픽은 `gateway-lxc` 가 Windows 백엔드로 직접 넘긴다.

## 4. Privileged vs Unprivileged 조사 결과

### 현재 상태

현재 게이트웨이 컨테이너는 `Privileged LXC` 이다.

### Privileged LXC 특성

- 컨테이너 내부 `root` 가 호스트 권한과 더 가깝다
- 장치 접근과 네트워크 기능 구성이 더 쉽다
- `Tailscale`, `tun`, NAT, 포워딩 같은 작업이 상대적으로 단순하다
- 대신 탈출 취약점이나 권한상승 사고 시 피해 반경이 더 크다

### Unprivileged LXC 특성

- 컨테이너 내부 `root` 가 호스트의 비특권 UID/GID 범위로 매핑된다
- 침해 시 호스트 직접 장악 위험을 줄여 준다
- 인터넷 진입점, 프록시, 터널 에이전트가 올라가는 게이트웨이에는 보안상 더 적합하다
- 대신 `/dev/net/tun`, UID/GID 매핑, 일부 네트워크 기능, NAT/포워딩 검증이 더 번거롭다

### 보안 관점 결론

`gateway-lxc` 는 외부 트래픽의 첫 진입점이므로 장기적으로는 `Unprivileged LXC` 가 더 적절하다.

### 운영 관점 결론

현 시점 목표는 `Phase 2 개통` 이다. 망분리 검증과 컨테이너 권한 재구축을 동시에 진행하면 변수 두 개를 한 번에 건드리게 된다.

따라서 현재 권고는 다음과 같다.

1. 먼저 현행 `Privileged CT 200` 으로 Tailscale 연결과 `Nginx -> Ollama` 프록시 구조를 검증한다.
2. 구조가 안정화되면 별도 `Unprivileged gateway-lxc-v2` 를 새로 만들고 이관한다.

이 방식이 가장 안전하고, 장애 분석도 명확하다.

## 5. Unprivileged LXC 에서 추가로 생기는 번거로움

난이도 평가는 아래와 같다.

- `nginx + cloudflared + 정적 페이지`: 낮음
- `tailscale + tun 장치`: 낮음~중간
- `게이트웨이 NAT / 포워딩 / 방화벽 역할`: 중간~높음

실제 번거로운 지점:

1. `tun` 장치 매핑이 필요하다.
2. 일부 파일 권한과 서비스 권한 점검이 추가된다.
3. 라우터/NAT 역할까지 동시에 수행하면 검증 포인트가 늘어난다.

즉, 단순 웹 게이트웨이라면 `Unprivileged` 전환은 충분히 할 만하지만, 내부망 게이트웨이 역할까지 동시에 유지하면 운영 난이도가 올라간다.

## 6. Tailscale 관련 사전 조사 핵심

### 목표 노드

- `gateway-lxc`
- `backend-desktop`

### 의도된 운용 원칙

- Windows 데스크톱은 `exit node` 를 사용하지 않는다
- Windows 데스크톱은 `accept-routes=false` 로 유지한다
- 필요 시 DNS 간섭을 최소화하려면 `accept-dns=false` 로 시작한다
- 목적은 인터넷 우회가 아니라 노드 간 사설 오버레이 연결이다

### 예상 데이터 경로

- 외부 사용자 -> Cloudflare -> Nginx LXC
- Nginx LXC -> Tailscale `100.x.x.x` -> Windows Desktop `11434`

### 향후 대표 프록시 대상

- `Ollama:11434`
- 이후 필요 시 `ComfyUI`, `Open WebUI`, 게임 서버 포트 확장 가능

## 7. Unprivileged LXC 에서 Tailscale tun 오류 대응 메모

비특권 LXC 에서는 아래와 같은 설정이 필요할 수 있다.

Proxmox host 기준:

```bash
pct stop 200

echo 'lxc.cgroup2.devices.allow: c 10:200 rwm' >> /etc/pve/lxc/200.conf
echo 'lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file' >> /etc/pve/lxc/200.conf

modprobe tun
pct start 200
```

구형/엄격한 환경에서는 소유권 보정이 추가로 필요할 수 있다.

```bash
chown 100000:100000 /dev/net/tun
```

주의:

- 위 조치는 `Unprivileged LXC` 일 때의 대응책이다.
- 현행 `CT 200` 은 `Privileged` 이므로 현재 바로 동일 증상이 난다고 가정하면 안 된다.

## 8. 권장 실행 전략

### 전략 A: 현재 Privileged 유지 후 Phase 2 선개통

장점:

- 가장 빠르다
- Tailscale 검증이 쉽다
- 문제 발생 시 원인 범위가 좁다

단점:

- 게이트웨이 보안 수준이 최적은 아니다

추천도:

- 단기적으로 가장 현실적

### 전략 B: Unprivileged 재구축 후 Phase 2 진행

장점:

- 보안 구조가 더 좋다
- 장기 운영에 적합하다

단점:

- 이관 및 검증 시간이 더 든다
- NAT, 포워딩, 터널링을 같이 건드리면 장애 분석이 복잡해진다

추천도:

- 중기 개선 과제로 적합

## 9. 다음 작업의 기본 권고안

다음 턴에서는 아래 순서로 진행하는 것이 적절하다.

1. 현행 `CT 200` 에 Tailscale 설치
2. Windows 데스크톱 Tailscale 연결
3. `tailscale ping` 및 일반 `ping` 검증
4. LXC 에서 Windows 의 `Ollama:11434` 도달성 확인
5. `Nginx` 에 `ollama.edelweiss0297.cloud` 프록시 뼈대 적용
6. 구조가 안정화되면 `Unprivileged LXC` 이관 계획 수립

## 10. 다음 턴용 재사용 프롬프트

아래 블록은 다음 작업에서 그대로 붙여 넣어도 되도록 작성했다.

```text
현재 프로젝트는 Proxmox 기반 홈 클라우드/AI 포털입니다.

확정된 현재 상태:
- Proxmox Host: Debian 13, Proxmox VE 9.1.1
- Gateway LXC: CTID 200, Rocky Linux 9.4, nginx 1.20.1, 현재는 Privileged LXC
- Gateway LXC 네트워크: net0=vmbr0 DHCP, net1=vmbr1 10.0.0.1/24
- Windows Backend: Windows 11 Home 25H2, Tailscale 1.96.3 설치됨
- 목표: Nginx LXC 와 Windows Desktop 을 Tailscale 100.x 대역으로 직접 연결하고, 향후 Ollama(11434)를 Nginx 가 reverse proxy 하도록 구성

설계 원칙:
- 외부 공개는 계속 Nginx LXC 단일 진입점으로 유지
- Docker VM 은 데이터 서비스 전용
- AI/게임 트래픽은 Nginx LXC -> Tailscale -> Windows Desktop 으로 전달
- Windows 는 exit node 를 쓰지 않음
- Windows 는 accept-routes=false 유지
- 필요 시 accept-dns=false 로 시작

판단 메모:
- 장기적으로 gateway-lxc 는 Unprivileged LXC 가 보안상 더 적절
- 하지만 현재 작업은 Phase 2 개통이 우선이므로, 먼저 현행 Privileged CT 200 으로 Tailscale 개통 및 Ollama 프록시를 검증
- 이후 별도 Unprivileged gateway-lxc-v2 재구축을 검토

이번 턴에서 할 일:
1. Gateway LXC 에서 Tailscale 설치 명령 작성
2. Windows 데스크톱 Tailscale 연결 절차 작성
3. 터널 검증 절차 작성
4. Nginx -> Tailscale IP -> Ollama:11434 프록시 기본 설정 작성

참고 문서:
- docs/setup-log.md
- docs/phase2-tailscale-preflight.md
```

## 11. 참고 자료

- Local setup log: `docs/setup-log.md`
- Tailscale Linux install docs
- Tailscale Windows install docs
- Tailscale CLI docs
- Tailscale ping docs
- Tailscale DNS docs
- Tailscale exit node docs
- Proxmox LXC tun device guidance

