# Paperless-ngx on Rocky Linux 9.7 (CloudVM)

This plan assumes the current layout below and keeps Paperless data under the same `/home/data` root that already hosts Nextcloud.

```text
/home/data/
  ncdata/
  nextcloud/
  paperless/
```

## Target layout

```text
/home/data/paperless/
  consume/
  data/
  export/
  media/
  pgdata/
  redis/
```

## 1. Install Docker Engine on Rocky 9.7

```bash
sudo dnf -y install dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

Log out and back in once if you want to run Docker without `sudo`.

## 2. Prepare the Paperless stack directory

```bash
sudo mkdir -p /home/data/paperless/{consume,data,export,media,pgdata,redis}
sudo mkdir -p /opt/paperless
sudo chown -R $USER:$USER /home/data/paperless /opt/paperless
```

Copy these repository files to the VM:

```text
deploy/paperless/compose.yaml
deploy/paperless/.env.example
```

Then on the VM:

```bash
cd /opt/paperless
cp /path/to/compose.yaml .
cp /path/to/.env.example .env
vi .env
```

Set at least:

- `PAPERLESS_SECRET_KEY`
- `PAPERLESS_ADMIN_PASSWORD`
- `POSTGRES_PASSWORD`
- `PAPERLESS_OCR_LANGUAGES=kor`

The defaults in this repo assume:

- URL: `https://paperless.edelweiss0297.cloud`
- OCR language: `kor+eng`
- Published port: `8010`

## 3. Start Paperless

```bash
cd /opt/paperless
docker compose pull
docker compose up -d
docker compose ps
```

Initial access should come up on:

```text
http://10.0.0.10:8010
```

## 4. Add Gateway LXC nginx proxy

Create `/etc/nginx/conf.d/paperless.conf` on the gateway LXC:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name paperless.edelweiss0297.cloud;

    client_max_body_size 512M;
    proxy_read_timeout 3600;
    proxy_send_timeout 3600;

    location / {
        proxy_pass http://10.0.0.10:8010;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

Validate and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 5. Add Cloudflare Tunnel ingress

Append this host to `/etc/cloudflared/config.yml` on the gateway LXC:

```yaml
  - hostname: paperless.edelweiss0297.cloud
    service: http://localhost:80
```

Then reload Cloudflared:

```bash
sudo systemctl restart cloudflared
sudo systemctl status cloudflared --no-pager
```

## 6. Verify

From the CloudVM:

```bash
curl -I http://127.0.0.1:8010
docker compose logs --tail=50
```

From outside:

```text
https://paperless.edelweiss0297.cloud
```

## Notes

- `PAPERLESS_CONSUMER_POLLING=10` is set so the consume folder still works even if the underlying filesystem does not provide reliable `inotify` events.
- The stack includes PostgreSQL, Redis, Apache Tika, and Gotenberg so Office documents and OCR-heavy workflows are supported from the start.
- If you want stricter upgrades, replace `ghcr.io/paperless-ngx/paperless-ngx:latest` with a pinned release tag after first deployment.

## References

- Paperless-ngx setup: https://docs.paperless-ngx.com/setup/
- Paperless-ngx administration: https://docs.paperless-ngx.com/administration/
- Docker Compose CLI: https://docs.docker.com/reference/cli/docker/compose/
