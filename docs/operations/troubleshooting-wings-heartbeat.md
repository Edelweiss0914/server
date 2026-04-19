# 트러블슈팅: Pterodactyl Wings Heartbeat가 초록색으로 변하지 않음

> 상태: 완료
> 작성일: 2026-04-19
> 대상: homepc Windows 11 + WSL2 Ubuntu + Gateway nginx reverse proxy

## 증상

- Pterodactyl Panel의 Nodes 화면에서 `homepc-wsl2` heartbeat가 빨간색으로 유지된다.
- Wings 서비스 자체는 기동되어 있는 것처럼 보인다.
- `config.yml`을 다시 받아도 포트와 SSL 구성이 반복해서 헷갈린다.

## 현재 정상 구성

| 항목 | 값 |
|------|-----|
| Panel Node FQDN | `wings.edelweiss0297.cloud` |
| Panel Node Daemon Port | `443` |
| Panel Node SSL | `Use SSL Connection` |
| Panel Node Behind Proxy | 체크 |
| Wings 내부 API 포트 | `8080` |
| Wings 내부 SSL | `false` |
| Wings 내부 SFTP 포트 | `2022` |
| Gateway nginx upstream | `http://100.86.252.21:8080` |

핵심은 다음 한 줄이다.

`Panel이 보는 외부 포트는 443이고, Wings 자체가 실제로 떠 있는 내부 포트는 8080이다.`

두 값을 동일하게 맞추려 하면 현재 프록시 구조와 충돌할 수 있다.

## 빠른 확인 명령

### Windows

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8080
Invoke-WebRequest -UseBasicParsing http://100.86.252.21:8080
Invoke-WebRequest -UseBasicParsing https://wings.edelweiss0297.cloud
```

### WSL2 Ubuntu

```bash
grep -A5 '^api:' /etc/pterodactyl/config.yml
ss -tlnp | grep -E ':8080|:443|:2022'
sudo systemctl status wings --no-pager
sudo journalctl -u wings -n 50 --no-pager | grep 'configuring internal webserver'
```

## 정상 판정 기준

- 위 HTTP 요청 중 최소 하나가 연결 오류가 아닌 HTTP 응답을 반환해야 한다.
- `401` 또는 `"The required authorization heads were not present in the request."` 는 연결 성공으로 본다.
- `journalctl -u wings` 에서 `host_port=8080 use_ssl=false` 가 보여야 한다.
- `ss -tlnp` 에서 `*:8080`, `*:2022` 리슨이 보여야 한다.
- 최종적으로 Panel Nodes 화면에서 heartbeat가 초록색으로 바뀌어야 한다.

## 원인별 분류

### 1. Panel 노드가 직접 연결 모드로 저장됨

**징후**

- `FQDN=100.86.252.21`
- `Daemon Port=8080`
- `Behind Proxy` 미체크

**조치**

- Panel Node 설정을 다음으로 수정한다.
  - `wings.edelweiss0297.cloud`
  - `443`
  - `Use SSL Connection`
  - `Behind Proxy` 체크

### 2. Wings가 잘못된 포트로 실행 중

**징후**

- `config.yml` 은 `8080`인데 실제 리슨은 `443`
- `journalctl -u wings` 에 `host_port=443`

**조치**

```bash
sudo systemctl restart wings
ss -tlnp | grep -E ':8080|:443|:2022'
sudo journalctl -u wings -n 50 --no-pager | grep 'configuring internal webserver'
```

필요하면 Panel에서 `Configuration` 탭의 최신 `config.yml` 을 다시 다운로드해 `/etc/pterodactyl/config.yml` 에 덮어쓴 뒤 재시작한다.

### 3. Wings는 정상이나 외부 경로만 실패

**징후**

- `http://127.0.0.1:8080` 는 응답
- `https://wings.edelweiss0297.cloud` 는 실패

**조치**

- Gateway nginx의 `wings.edelweiss0297.cloud` upstream이 `http://100.86.252.21:8080` 인지 확인
- Cloudflare Tunnel ingress가 `wings.edelweiss0297.cloud` 를 Gateway nginx로 전달하는지 확인

### 4. WSL2 내부 서비스 미기동

**징후**

- `ss -tlnp` 에 `8080` 이 없음
- `wings.service` 가 inactive / failed

**조치**

```bash
sudo systemctl restart wings
sudo systemctl status wings --no-pager
sudo journalctl -u wings -n 100 --no-pager
```

Docker Engine 상태도 같이 확인한다.

## 이번 장애의 실제 원인

이번 사례에서는 다음이 섞여 있었다.

1. 문서에는 direct Tailscale IP 기준(`100.86.252.21:8080`, SSL No, Behind Proxy No)이 남아 있었다.
2. 실제 운영은 reverse proxy 도메인 기준(`wings.edelweiss0297.cloud:443`, SSL Yes, Behind Proxy Yes)이었다.
3. Wings 자체는 WSL2 내부에서 `8080` 으로 떠 있어야 했는데, 적용 중 잠시 `443` 리슨 상태가 관측되며 혼선을 만들었다.

최종적으로는 아래 조합에서 heartbeat가 정상화되었다.

- Panel: `wings.edelweiss0297.cloud`, `443`, `SSL`, `Behind Proxy`
- Wings: `8080`, `ssl.enabled: false`

## 관련 문서

- [pterodactyl-wings-heartbeat.md](./pterodactyl-wings-heartbeat.md)
- [wings-setup.md](./wings-setup.md)
