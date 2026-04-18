# Nginx + Cloudflared IPv6 라우팅 구성 참조

> 작성일: 2026-04-18
> 적용 범위: Gateway LXC — cloudflared(네이티브 systemd) + nginx(Docker, host network)

---

## 개요

CHEEZE Gateway는 다음 구조로 외부 트래픽을 처리한다.

```
[Cloudflare Edge]
       │ HTTPS
       ▼
cloudflared (네이티브 systemd, Gateway LXC)
       │ HTTP — http://localhost:80
       ▼
nginx (Docker, network_mode: host)
       │
       ├── / → Next.js (127.0.0.1:3000)
       ├── /api/control/ → Portal API (127.0.0.1:11437)
       ├── /ai/ → AI Queue (127.0.0.1:11435)
       ├── cloud.edelweiss0297.cloud → Cloud VM (10.0.0.10:80)
       ├── paperless.edelweiss0297.cloud → Cloud VM (10.0.0.10:8010)
       └── archive.edelweiss0297.cloud → Cloud VM (10.0.0.10:8020)
```

---

## cloudflared의 `localhost` 해석 동작

### 핵심 사실

cloudflared는 Linux에서 `localhost`를 **IPv6 주소 `::1`** (루프백)으로 해석한다.

`/etc/hosts` 일반 구성:
```
127.0.0.1   localhost
::1         localhost
```

Linux getaddrinfo는 IPv6를 우선 반환하므로, cloudflared가 `http://localhost:80`으로 요청을 보낼 때 실제 연결 대상은 `::1:80`(IPv6 루프백)이다.

### 확인 방법

nginx 액세스 로그에서 cloudflared 요청의 소스 IP를 확인한다:

```bash
docker logs cheeze-nginx | grep -E '::1|127\.0\.0\.1'
```

모든 cloudflared 요청이 `::1`에서 오는 것을 볼 수 있다:

```
::1 - - [18/Apr/2026:...] "GET / HTTP/1.1" 200 ...
::1 - - [18/Apr/2026:...] "GET / HTTP/1.1" 302 ...  ← 서브도메인 라우팅 실패 시
```

---

## nginx 리스너 요구사항

### `listen 80` vs `listen [::]:80`

| 지시어 | 바인딩 주소 | IPv4 요청 수신 | IPv6 요청 수신 |
|--------|------------|--------------|--------------|
| `listen 80` | 0.0.0.0:80 | ✓ | ✗ |
| `listen [::]:80` | [::]:80 | ✗ (기본값) | ✓ |
| 두 지시어 모두 | 0.0.0.0:80 + [::]:80 | ✓ | ✓ |

> **주의:** `listen [::]:80 ipv6only=off`를 사용하면 IPv4/IPv6를 하나의 소켓으로 처리할 수 있으나, 한 server 블록에서만 사용 가능하다. 여러 server 블록이 있는 경우 각 블록에 두 지시어를 모두 추가하는 방식이 더 명확하다.

### `default_server`의 fallback 동작

nginx는 요청이 들어온 소켓(`[::]:80` 또는 `0.0.0.0:80`)에서 `server_name`이 일치하는 블록을 찾는다. 일치하는 블록이 없으면 해당 소켓의 `default_server`로 폴백한다.

**문제 상황 (수정 전):**

```
cloudflared → ::1:80 (IPv6)
  → nginx [::]:80 소켓
  → server_name cloud.edelweiss0297.cloud 블록: listen [::]:80 없음 → 매칭 불가
  → default_server 폴백: Next.js (port 3000)
  → Cloud VM 대신 메인 페이지 반환
```

**정상 상황 (수정 후):**

```
cloudflared → ::1:80 (IPv6)
  → nginx [::]:80 소켓
  → server_name cloud.edelweiss0297.cloud 블록: listen [::]:80 있음 → 매칭
  → 10.0.0.10:80으로 프록시
```

---

## 적용된 수정사항

커밋 `914903b` — cloud VM 서비스 server 블록에 `listen [::]:80` 추가:

```nginx
# cloud.edelweiss0297.cloud
server {
    listen 80;
    listen [::]:80;           # ← 추가
    server_name cloud.edelweiss0297.cloud;
    ...
}

# paperless.edelweiss0297.cloud
server {
    listen 80;
    listen [::]:80;           # ← 추가
    server_name paperless.edelweiss0297.cloud;
    ...
}

# archive.edelweiss0297.cloud
server {
    listen 80;
    listen [::]:80;           # ← 추가
    server_name archive.edelweiss0297.cloud;
    ...
}
```

**default_server 블록(메인 사이트)은 이미 두 지시어를 모두 가지고 있었다:**

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    ...
}
```

---

## 새 서버 블록 추가 시 체크리스트

nginx에 새로운 서브도메인 server 블록을 추가할 때:

- [ ] `listen 80;` — IPv4 직접 접근 및 일반 트래픽
- [ ] `listen [::]:80;` — cloudflared를 통한 IPv6 트래픽
- [ ] `server_name` 정확히 지정
- [ ] cloudflared `/etc/cloudflared/config.yml`에 ingress 규칙 추가
- [ ] nginx 설정 검증: `docker compose exec nginx nginx -t`
- [ ] nginx 리로드: `docker compose exec nginx nginx -s reload`

**server 블록 최소 템플릿:**

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name <subdomain>.edelweiss0297.cloud;

    location / {
        proxy_pass http://<upstream>;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;

        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

---

## cloudflared 설정 확인

`/etc/cloudflared/config.yml` — 모든 서브도메인은 `http://localhost:80`을 가리킨다:

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /root/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: edelweiss0297.cloud
    service: http://localhost:80
  - hostname: "*.edelweiss0297.cloud"
    service: http://localhost:80
  - service: http_status:404
```

cloudflared가 `localhost:80`으로 보낸 요청은 nginx가 `Host` 헤더로 서브도메인을 판별해 올바른 server 블록으로 라우팅한다.

---

## 관련 문서

- [트러블슈팅: 클라우드 VM 서브도메인이 메인 페이지로 리다이렉션](troubleshooting.md#314-클라우드-vm-서브도메인이-메인-페이지로-리다이렉션)
- [트러블슈팅: LXC Docker 포트 바인딩 실패](troubleshooting.md#312-lxc-docker-포트-바인딩-실패)
- [트러블슈팅: cloudflared Docker 컨테이너 cert.pem 오류](troubleshooting.md#311-cloudflared-docker-컨테이너-certpem-오류)
