#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/wayyuanbj-cpu/fde-field-test.git"
ARCHIVE_URL="https://codeload.github.com/wayyuanbj-cpu/fde-field-test/tar.gz/refs/heads/main"
SOURCE_DIR="/opt/fde-field-test"
WEB_ROOT="/var/www/fde.onex.plus"
NGINX_SITE="/etc/nginx/sites-available/fde.onex.plus"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run this script as root." >&2
  exit 1
fi

missing_packages=()
command -v curl >/dev/null 2>&1 || missing_packages+=(curl)
command -v rsync >/dev/null 2>&1 || missing_packages+=(rsync)
command -v nginx >/dev/null 2>&1 || missing_packages+=(nginx)
command -v certbot >/dev/null 2>&1 || missing_packages+=(certbot python3-certbot-nginx)
dpkg-query -W -f='${Status}' libnginx-mod-stream 2>/dev/null | grep -q 'ok installed' || missing_packages+=(libnginx-mod-stream)

if ((${#missing_packages[@]})); then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y "${missing_packages[@]}"
fi

archive_dir="$(mktemp -d)"
trap 'rm -rf "$archive_dir"' EXIT
curl --fail --silent --show-error --location \
  --connect-timeout 20 --max-time 240 \
  --retry 5 --retry-delay 3 --retry-all-errors \
  "$ARCHIVE_URL" -o "$archive_dir/fde-field-test.tar.gz"
tar -xzf "$archive_dir/fde-field-test.tar.gz" -C "$archive_dir"
install -d -m 0755 "$SOURCE_DIR"
rsync -a --delete "$archive_dir/fde-field-test-main/" "$SOURCE_DIR/"

install -d -m 0755 "$WEB_ROOT"
rsync -a --delete \
  --exclude='.git/' \
  --exclude='.github/' \
  --exclude='deploy/' \
  --exclude='README.md' \
  --exclude='LICENSE' \
  "$SOURCE_DIR/" "$WEB_ROOT/"
chown -R www-data:www-data "$WEB_ROOT"

if [[ ! -f /etc/letsencrypt/live/fde.onex.plus/fullchain.pem ]]; then
  install -m 0644 "$SOURCE_DIR/deploy/fde.onex.plus.acme.nginx.conf" "$NGINX_SITE"
else
  install -m 0644 "$SOURCE_DIR/deploy/fde.onex.plus.nginx.conf" "$NGINX_SITE"
fi
ln -sfn "$NGINX_SITE" /etc/nginx/sites-enabled/fde.onex.plus
nginx -t
systemctl reload nginx

if [[ ! -f /etc/letsencrypt/live/fde.onex.plus/fullchain.pem ]]; then
certbot certonly --webroot \
  --webroot-path "$WEB_ROOT" \
  --domain fde.onex.plus \
  --non-interactive \
  --agree-tos \
  --keep-until-expiring \
  --register-unsafely-without-email
fi

bash "$SOURCE_DIR/deploy/configure-xray-sni.sh"

echo "FDE site deployed from $REPO_URL main branch to https://fde.onex.plus/"
