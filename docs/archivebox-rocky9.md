# ArchiveBox on Rocky Linux 9.7 (CloudVM)

This plan follows the same layout used for Nextcloud and Paperless and keeps ArchiveBox data under `/home/data`.

```text
/home/data/
  ncdata/
  nextcloud/
  paperless/
  archivebox/
```

## Target layout

```text
/home/data/archivebox/
```

ArchiveBox stores its database, snapshots, and config inside the mounted `/data` directory.

## 1. Prepare the ArchiveBox directories

```bash
sudo mkdir -p /home/data/archivebox
sudo mkdir -p /opt/archivebox
sudo chown -R $USER:$USER /home/data/archivebox /opt/archivebox
chmod 700 /home/data/archivebox
```

## 2. Copy the stack files

Copy these repository files to the VM:

```text
deploy/archivebox/compose.yaml
deploy/archivebox/.env.example
```

Then on the VM:

```bash
cd /opt/archivebox
cp /path/to/compose.yaml .
cp /path/to/.env.example .env
vi .env
```

Set at least:

- `ADMIN_PASSWORD`

Recommended `.env` values:

```bash
ADMIN_USERNAME=archivebox
ADMIN_PASSWORD=CHANGE_THIS_PASSWORD
ALLOWED_HOSTS=archive.edelweiss0297.cloud,127.0.0.1,localhost,10.0.0.10
CSRF_TRUSTED_ORIGINS=https://archive.edelweiss0297.cloud
PUBLIC_INDEX=False
PUBLIC_SNAPSHOTS=False
PUBLIC_ADD_VIEW=False
```

The defaults in this repo assume:

- URL: `https://archive.edelweiss0297.cloud`
- Published port: `8020`
- Private archive listing and snapshots

## 3. Initialize ArchiveBox

ArchiveBox needs a one-time init step before the service is started.

```bash
cd /opt/archivebox
docker compose pull
docker compose run --rm archivebox init --setup
```

This creates the initial `/data` structure and uses the admin credentials from `.env`.

## 4. Start the service

```bash
cd /opt/archivebox
docker compose up -d
docker compose ps
```

Initial local access:

```text
http://10.0.0.10:8020
```

## 5. Add the Gateway LXC nginx proxy

Create `/etc/nginx/conf.d/archivebox.conf` on the gateway LXC:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name archive.edelweiss0297.cloud;

    client_max_body_size 128M;
    proxy_read_timeout 3600;
    proxy_send_timeout 3600;

    location / {
        proxy_pass http://10.0.0.10:8020;
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

## 6. Add Cloudflare Tunnel ingress

Append this host to `/etc/cloudflared/config.yml` on the gateway LXC:

```yaml
  - hostname: archive.edelweiss0297.cloud
    service: http://localhost:80
```

Then restart Cloudflared:

```bash
sudo systemctl restart cloudflared
sudo systemctl status cloudflared --no-pager
```

If external access returns `DNS_PROBE_FINISHED_NXDOMAIN`, add a `CNAME (Tunnel)` for `archive.edelweiss0297.cloud` in Cloudflare just like the Paperless host.

## 7. Verify

From the CloudVM:

```bash
curl -I http://127.0.0.1:8020
docker compose ps
docker compose logs --tail=50 archivebox
```

From outside:

```text
https://archive.edelweiss0297.cloud
```

## 8. Common operations

Add a URL from the CLI:

```bash
cd /opt/archivebox
docker compose run --rm archivebox add https://example.com
```

Update indexes:

```bash
cd /opt/archivebox
docker compose run --rm archivebox update
```

## References

- ArchiveBox homepage and quickstart: https://archivebox.io/
- ArchiveBox Docker Compose file: https://docker-compose.archivebox.io
- ArchiveBox Docker documentation: https://docs.archivebox.io/dev/Docker.html
