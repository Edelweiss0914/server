# Edelweiss 홈서버 셋업 로그

> 작성일: 2026-04-10
> 도메인: edelweiss0297.cloud
> 인프라: Proxmox / Cloudflare Tunnel

---

## 초기 상태

- **GatewayVM** (192.168.50.196): nginx 리버스 프록시, 내부 NAT (10.0.0.1)
- **CloudVM** (10.0.0.10): Docker로 Nextcloud 실행 (포트 80)
- Cloudflare Tunnel (`nextcloud-tunnel`) 운영 중 — 포트포워딩 없이 외부 접속 가능
- `edelweiss0297.cloud` 접속 시 Nextcloud 로그인 화면으로 바로 이동
- 홈페이지(서비스 검색 UI) 없음

---

## 작업 목표

1. 개인 서버 홈페이지 제작 (Google 스타일 검색 UI)
2. `edelweiss0297.cloud` → 홈페이지
3. `cloud.edelweiss0297.cloud` → Nextcloud
4. GitHub 레포지토리(`Edelweiss0914/server`)로 push/pull 배포

---

## 제작한 파일

| 파일 | 설명 |
|------|------|
| `index.html` | 메인 홈페이지 (Edelweiss 브랜딩, 검색창, 빠른 접근) |
| `css/style.css` | 라이트/다크 모드, 서비스 카드, 반응형 디자인 |
| `js/services.js` | 서비스 목록 데이터 (Nextcloud 등) |
| `js/app.js` | 검색 로직, 키보드 단축키, 테마 관리 |

---

## 발생한 문제 및 해결

### 1. Cloudflare DNS CNAME 충돌
- **문제**: `@` A 레코드 추가 시 기존 CNAME과 충돌 오류
- **원인**: Cloudflare Tunnel의 CNAME 레코드가 `@`에 이미 존재
- **해결**: 기존 CNAME 삭제 후 Tunnel 레코드 재등록 (Tunnel 타입으로 자동 변환)

### 2. Error 522 (Connection Timeout)
- **문제**: `edelweiss0297.cloud` 접속 시 Cloudflare 522 오류
- **원인**: Tunnel CNAME 삭제로 인해 터널 연결 끊김
- **해결**: Cloudflare DNS에서 `edelweiss0297.cloud`, `cloud.edelweiss0297.cloud` 모두 Tunnel로 재등록

### 3. nginx HTTPS 리다이렉트 루프
- **문제**: Cloudflare Tunnel → nginx 포트 80 → 301 HTTPS 리다이렉트 → 루프
- **원인**: nginx가 SSL 처리를 시도했으나, Tunnel이 이미 TLS를 처리함
- **해결**: nginx 설정을 HTTP 전용(포트 80)으로 변경, SSL 블록 제거

### 4. nginx server_name 충돌
- **문제**: `nextcloud.conf`와 `home.conf` 모두 `edelweiss0297.cloud` 사용
- **원인**: 기존 `nextcloud.conf`가 `edelweiss0297.cloud`를 default_server로 점유
- **해결**: `nextcloud.conf`의 server_name을 `cloud.edelweiss0297.cloud`로 변경

### 5. SELinux 파일 접근 차단
- **문제**: nginx가 `/var/www/home/index.html`을 읽지 못하고 404 반환
- **원인**: SELinux Enforcing 모드에서 파일 컨텍스트가 `var_t` (nginx 접근 불가)
- **해결**:
  ```bash
  chcon -R -t httpd_sys_content_t /var/www/home/
  dnf install -y policycoreutils-python-utils
  semanage fcontext -a -t httpd_sys_content_t "/var/www/home(/.*)?"
  restorecon -Rv /var/www/home/
  ```

### 6. Nextcloud 도메인 설정 불일치
- **문제**: 클라우드 아이콘 클릭 시 `edelweiss0297.cloud/login`으로 리다이렉트 → 404
- **원인**: Nextcloud `config.php`의 `overwrite.cli.url`, `overwritehost`, `trusted_domains`가 구 도메인 참조
- **해결**:
  ```bash
  docker exec -u www-data nextcloud-app-1 php occ config:system:set \
    overwrite.cli.url --value=https://cloud.edelweiss0297.cloud
  docker exec -u www-data nextcloud-app-1 php occ config:system:set \
    overwritehost --value=cloud.edelweiss0297.cloud
  # trusted_domains[3] → cloud.edelweiss0297.cloud (sed로 직접 수정)
  ```

---

## 최종 nginx 설정

### `/etc/nginx/conf.d/home.conf` (GatewayVM)
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name edelweiss0297.cloud;
    root /var/www/home;
    index index.html;
    location / {
        try_files $uri $uri/ =404;
    }
}
```

### `/etc/nginx/conf.d/nextcloud.conf` (GatewayVM)
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name cloud.edelweiss0297.cloud;

    client_max_body_size 10G;
    proxy_read_timeout 3600;
    proxy_send_timeout 3600;

    location /admin { deny all; }

    location / {
        proxy_pass http://10.0.0.10:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

### `/etc/cloudflared/config.yml` (GatewayVM)
```yaml
tunnel: nextcloud-tunnel
credentials-file: /root/.cloudflared/136c8b02-a570-42af-8753-6738ba99718c.json
ingress:
  - hostname: edelweiss0297.cloud
    service: http://localhost:80
  - hostname: cloud.edelweiss0297.cloud
    service: http://localhost:80
  - service: http_status:404
```

---

## GatewayVM → LXC 마이그레이션 (2026-04-11)

### 목적
GatewayVM(Rocky Linux 9.7, VMID 100)의 역할을 LXC 컨테이너(CTID 200)로 이전하여 리소스 절약.

### 최종 구성

| 항목 | 값 |
|------|-----|
| LXC CTID | 200 |
| 호스트명 | gateway-lxc |
| OS 템플릿 | rockylinux-9-default_20240912_amd64.tar.xz |
| IP | 192.168.50.196/24 (static, NetworkManager) |
| MAC | BC:24:11:83:AB:07 |
| vmbr0 (외부) | eth0 → 192.168.50.196 |
| vmbr1 (내부) | eth1 → 10.0.0.1 |
| Privileged | Yes (NAT masquerade 필요) |

### 마이그레이션 작업 순서

1. Proxmox에서 LXC 생성 (storage: Main, privileged)
2. LXC 시작 후 nginx, firewalld, cloudflared 설치 및 설정
3. 공유기(TX-AX6000)에서 MAC → IP 예약 (Manual Assignment: Yes)
4. NetworkManager로 static IP 설정
5. cloudflared 바이너리 설치 및 서비스 등록

### 발생한 문제 및 해결

| 문제 | 원인 | 해결 |
|------|------|------|
| `storage 'local-lvm' does not exist` | PVE storage 이름 다름 | `Main:10`으로 변경 |
| 템플릿 와일드카드 미작동 | 정확한 파일명 필요 | `rockylinux-9-default_20240912_amd64.tar.xz` 직접 지정 |
| heredoc EOF 인식 실패 | 앞에 공백 | `printf` 또는 Python one-liner 사용 |
| `lxc.cap.keep` 충돌 | features와 충돌 | `sed -i '/lxc.cap.keep/d'`로 제거 |
| DHCP 리스 갱신 안 됨 | 공유기 Manual Assignment가 No | Yes로 변경 후 static IP로 전환 |
| cloudflared 설치 실패 | GitHub redirect 9바이트 반환 | 특정 버전 URL 직접 지정 |
| config.yml YAML 오류 | 멀티라인 입력 시 들여쓰기 깨짐 | LXC 내부 접속 후 vi로 직접 작성 |

### 최종 LXC 설정 파일

#### `/etc/cloudflared/config.yml`
```yaml
tunnel: nextcloud-tunnel
credentials-file: /root/.cloudflared/136c8b02-a570-42af-8753-6738ba99718c.json

ingress:
  - hostname: edelweiss0297.cloud
    service: http://localhost:80
  - hostname: cloud.edelweiss0297.cloud
    service: http://localhost:80
  - service: http_status:404
```

#### NetworkManager static IP (`nmcli`)
```bash
nmcli connection modify "System eth0" \
  ipv4.method manual \
  ipv4.addresses 192.168.50.196/24 \
  ipv4.gateway 192.168.50.1 \
  ipv4.dns "1.1.1.1 8.8.8.8"
```

---

## 현재 상태

| 항목 | 상태 |
|------|------|
| `https://edelweiss0297.cloud` | 홈페이지 정상 서비스 |
| `https://cloud.edelweiss0297.cloud` | Nextcloud 정상 접속 |
| 홈페이지 클라우드 아이콘 클릭 | Nextcloud로 정상 이동 |
| GitHub 레포지토리 | `Edelweiss0914/server` (main 브랜치) |
| 서버 배포 경로 | `/var/www/home` (LXC 내부) |
| GatewayVM (VMID 100) | stopped (삭제 가능) |
| gateway-lxc (CTID 200) | running |

---

## 배포 방법 (향후 업데이트)

```bash
# Windows (D:\Project)
git add .
git commit -m "변경 내용"
git push origin main

# gateway-lxc (CTID 200)
cd /var/www/home && git pull
```

> 새 서비스 추가: `js/services.js`의 `SERVICES` 배열에 항목 추가 후 push → pull
