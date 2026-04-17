# Cloud VM

## 개요

Proxmox 호스트의 `vmbr1` NAT 네트워크 내에서 실행되는 KVM 가상머신입니다.
Nextcloud, Paperless-ngx, ArchiveBox를 Docker Compose로 운영하며, 외부 접근은 Gateway LXC의 Nginx 리버스 프록시를 통해서만 이루어집니다.

---

## VM 기본 설정

| 항목 | 값 |
|------|----|
| OS | Rocky Linux |
| IP | 10.0.0.10 (vmbr1 NAT) |
| 네트워크 | Proxmox 호스트가 NAT 수행 |
| 외부 접근 | Gateway LXC Nginx 경유 (직접 노출 없음) |
| 런타임 | Docker + Docker Compose |

---

## 데이터 경로

| 서비스 | 호스트 경로 |
|--------|-------------|
| Paperless-ngx | `/home/data/paperless/` |
| ArchiveBox | `/home/data/archivebox/` |
| Nextcloud | Docker 볼륨 또는 지정 경로 |

---

## Docker Compose 서비스 구성

### Nextcloud

| 항목 | 값 |
|------|----|
| 웹 포트 | `80` |
| 관리자 포트 | `5000` |
| 외부 도메인 | `cloud.edelweiss0297.cloud` |
| 관리자 경로 | `/a8x9k2-admin` (비공개 경로) |
| 관리자 접근 제한 | Tailscale CIDR (`100.64.0.0/10`) 만 허용 |

**Nginx 접근 제어 예시** (`/etc/nginx/conf.d/nextcloud.conf`):

```nginx
location /a8x9k2-admin {
    allow 100.64.0.0/10;   # Tailscale CGNAT 대역
    deny all;
    proxy_pass http://10.0.0.10:5000;
}
```

**Docker Compose 구성 요소**:

```yaml
services:
  nextcloud:
    image: nextcloud
    ports:
      - "80:80"
    volumes:
      - nextcloud_data:/var/www/html
    environment:
      - MYSQL_HOST=<설정 필요>
      - MYSQL_DATABASE=<설정 필요>
      - MYSQL_USER=<설정 필요>
      - MYSQL_PASSWORD=<설정 필요>
      - NEXTCLOUD_ADMIN_USER=<설정 필요>
      - NEXTCLOUD_ADMIN_PASSWORD=<설정 필요>
```

---

### Paperless-ngx

문서 관리 시스템으로, 스캔 문서의 OCR 처리 및 아카이빙을 담당합니다.

| 항목 | 값 |
|------|----|
| 웹 포트 | `8010` |
| 외부 도메인 | `paperless.edelweiss0297.cloud` |
| 데이터 경로 | `/home/data/paperless/` |

**스택 구성**:

| 컨테이너 | 내부 포트 | 역할 |
|----------|-----------|------|
| `paperless-ngx` | 8000 | 메인 웹 애플리케이션 |
| `redis` | 6379 | 태스크 큐 브로커 |
| `postgresql` | 5432 | 문서 메타데이터 데이터베이스 |
| `gotenberg` | 3000 | PDF 변환 서비스 |
| `tika` | 9998 | 문서 텍스트 추출 (Apache Tika) |

**Docker Compose 구성 요소**:

```yaml
services:
  broker:
    image: redis:7
    restart: unless-stopped

  db:
    image: postgres:16
    restart: unless-stopped
    volumes:
      - /home/data/paperless/pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=<설정 필요>
      - POSTGRES_USER=<설정 필요>
      - POSTGRES_PASSWORD=<설정 필요>

  gotenberg:
    image: gotenberg/gotenberg:8
    restart: unless-stopped

  tika:
    image: ghcr.io/paperless-ngx/tika:latest
    restart: unless-stopped

  webserver:
    image: ghcr.io/paperless-ngx/paperless-ngx:latest
    restart: unless-stopped
    ports:
      - "8010:8000"
    volumes:
      - /home/data/paperless/data:/usr/src/paperless/data
      - /home/data/paperless/media:/usr/src/paperless/media
      - /home/data/paperless/export:/usr/src/paperless/export
      - /home/data/paperless/consume:/usr/src/paperless/consume
    environment:
      - PAPERLESS_REDIS=redis://broker:6379
      - PAPERLESS_DBHOST=db
      - PAPERLESS_DBUSER=<설정 필요>
      - PAPERLESS_DBPASS=<설정 필요>
      - PAPERLESS_TIKA_ENABLED=1
      - PAPERLESS_TIKA_ENDPOINT=http://tika:9998
      - PAPERLESS_TIKA_GOTENBERG_ENDPOINT=http://gotenberg:3000
      - PAPERLESS_SECRET_KEY=<설정 필요>
      - PAPERLESS_ADMIN_USER=<설정 필요>
      - PAPERLESS_ADMIN_PASSWORD=<설정 필요>
```

---

### ArchiveBox

웹 페이지 아카이빙 시스템입니다.

| 항목 | 값 |
|------|----|
| 웹 포트 | `8020` |
| 외부 도메인 | `archive.edelweiss0297.cloud` |
| 데이터 경로 | `/home/data/archivebox/` |

**Docker Compose 구성 요소**:

```yaml
services:
  archivebox:
    image: archivebox/archivebox:latest
    ports:
      - "8020:8000"
    volumes:
      - /home/data/archivebox:/data
    environment:
      - ADMIN_USERNAME=<설정 필요>
      - ADMIN_PASSWORD=<설정 필요>
      - ALLOWED_HOSTS=archive.edelweiss0297.cloud
```

---

## 포트 요약

### 외부 노출 포트

| 서비스 | 외부 포트 | 외부 도메인 |
|--------|-----------|-------------|
| Nextcloud | 80 | `cloud.edelweiss0297.cloud` |
| Nextcloud Admin | 5000 | `cloud.edelweiss0297.cloud/a8x9k2-admin` (Tailscale 전용) |
| Paperless-ngx | 8010 | `paperless.edelweiss0297.cloud` |
| ArchiveBox | 8020 | `archive.edelweiss0297.cloud` |

### 내부 전용 포트 (컨테이너 간 통신)

| 서비스 | 내부 포트 | 비고 |
|--------|-----------|------|
| Redis | 6379 | Paperless-ngx 태스크 큐 |
| PostgreSQL | 5432 | Paperless-ngx DB |
| Gotenberg | 3000 | PDF 변환 (Paperless-ngx → Gotenberg) |
| Tika | 9998 | 텍스트 추출 (Paperless-ngx → Tika) |

---

## 데이터 백업

| 항목 | 방법 |
|------|------|
| Paperless 문서 | `/home/data/paperless/` 전체 백업 또는 `paperless_ng_exporter` 활용 |
| ArchiveBox 아카이브 | `/home/data/archivebox/` 전체 백업 |
| Nextcloud 데이터 | Docker 볼륨 또는 Nextcloud 내장 백업 기능 |
| DB 백업 | `pg_dump` 활용 또는 Docker 볼륨 스냅샷 |

```bash
# Paperless 수동 백업 예시
docker compose exec webserver document_exporter /usr/src/paperless/export

# PostgreSQL 덤프 예시
docker compose exec db pg_dump -U <user> paperless > paperless_backup.sql
```

---

## 주요 운영 명령어

```bash
# 전체 서비스 상태 확인
docker compose ps

# 서비스 재시작
docker compose restart webserver

# 로그 확인
docker compose logs -f webserver

# 전체 스택 재시작
docker compose down && docker compose up -d
```

---

## 관련 문서

- [Proxmox 호스트](proxmox-host.md)
- [Gateway LXC 상세](gateway-lxc.md)
- [Tailscale VPN 구성](tailscale-vpn.md)
