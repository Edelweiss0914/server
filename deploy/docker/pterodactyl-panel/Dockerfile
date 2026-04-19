FROM ghcr.io/pterodactyl/panel:latest

COPY patch-panel.sh /usr/local/bin/patch-panel.sh

RUN chmod +x /usr/local/bin/patch-panel.sh \
    && /usr/local/bin/patch-panel.sh \
    && rm /usr/local/bin/patch-panel.sh
