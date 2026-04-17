# Proxmox VE 호스트

## 개요

홈 서버의 하이퍼바이저 역할을 담당하는 Mini PC에 Proxmox VE를 설치하여 운영 중입니다.
모든 컨테이너 및 가상머신은 이 호스트 위에서 실행됩니다.

---

## 하드웨어

| 항목 | 내용 |
|------|------|
| 폼 팩터 | Mini PC |
| 역할 | Proxmox VE 하이퍼바이저 |

---

## Proxmox VE 설정

| 항목 | 내용 |
|------|------|
| OS | Proxmox VE |
| 관리 UI | `https://<호스트 IP>:8006` |

---

## 네트워크 브리지 구성

| 브리지 | 대역 | 역할 |
|--------|------|------|
| `vmbr0` | 192.168.50.x | 외부 LAN 연결. 컨테이너/VM이 홈 네트워크에 직접 노출됨 |
| `vmbr1` | 10.0.0.1/24 | 내부 NAT. Cloud VM 전용 사설 네트워크 |

- `vmbr0`은 물리 NIC에 브리지되어 있으며, Gateway LXC가 이 브리지를 통해 LAN IP를 받음
- `vmbr1`은 NAT 구성으로 Cloud VM (10.0.0.10)이 외부와 통신할 때 Proxmox 호스트가 NAT 역할 수행

---

## 컨테이너 / VM 목록

| ID | 유형 | 이름 | OS | IP (LAN) | 역할 |
|----|------|------|----|----------|------|
| CT200 | LXC (Privileged) | gateway-lxc | Rocky Linux 9.4 | 192.168.50.196 | 리버스 프록시, Cloudflare Tunnel, CHEEZE 서비스 |
| — | VM | cloud-vm | Rocky Linux | 10.0.0.10 (NAT) | Nextcloud, Paperless-ngx, ArchiveBox (Docker) |

### CT200 — Gateway LXC

- **유형**: Privileged LXC 컨테이너
- **이유**: `tailscale`, `cloudflared` 등 네트워크 수준 작업이 필요하여 Privileged 설정
- 상세 내용: [`gateway-lxc.md`](gateway-lxc.md) 참조

### Cloud VM

- **유형**: KVM 가상머신
- **네트워크**: vmbr1 NAT를 통해 외부 접근 불가, Gateway LXC의 Nginx가 리버스 프록시
- 상세 내용: [`cloud-vm.md`](cloud-vm.md) 참조

---

## 스토리지 구성

| 스토리지 | 유형 | 용도 |
|----------|------|------|
| local | dir | ISO 이미지, 컨테이너 템플릿, 백업 |
| local-lvm | LVM-Thin | VM 디스크, LXC 루트 볼륨 |

- Cloud VM의 데이터 볼륨은 별도 디스크로 마운트하거나 VM 내부 디렉토리(`/home/data/`) 사용
- 백업은 Proxmox 내장 백업 기능 또는 수동 스냅샷으로 관리

---

## 관리 접근 방법

### Proxmox 웹 UI

```
https://192.168.50.x:8006
```

- `192.168.50.x`: 하이퍼바이저 관리 IP — 실제 값은 Proxmox 웹 UI 확인
- LAN 내부에서만 접근 가능
- 기본 포트 8006 (HTTPS)
- 계정: Proxmox PAM 또는 PVE 전용 계정

### SSH 접근

```bash
ssh root@192.168.50.x  # 실제 IP는 Proxmox 웹 UI 확인
```

- LAN 또는 Tailscale을 통해 접근
- 컨테이너/VM 콘솔 접근: `pct enter 200` (CT200)

### Tailscale을 통한 원격 접근

- Gateway LXC(100.75.209.83)를 경유하여 관리
- Proxmox 호스트 자체에 Tailscale을 설치하지 않아도 LAN을 통해 Gateway에서 접근 가능

---

## 주요 운영 명령어

```bash
# 컨테이너 상태 확인
pct list

# VM 상태 확인
qm list

# CT200 콘솔 진입
pct enter 200

# CT200 시작/중지
pct start 200
pct stop 200

# Cloud VM 시작/중지
qm start <vmid>
qm stop <vmid>
```

---

## 관련 문서

- [Gateway LXC 상세](gateway-lxc.md)
- [Cloud VM 상세](cloud-vm.md)
- [Backend PC 상세](backend-pc.md)
- [Tailscale VPN 구성](tailscale-vpn.md)
