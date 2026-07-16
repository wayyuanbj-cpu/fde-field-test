#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/wayyuanbj-cpu/fde-field-test.git"
SOURCE_DIR="/opt/fde-field-test"
WEB_ROOT="/var/www/fde.onex.plus"
NGINX_SITE="/etc/nginx/sites-available/fde.onex.plus"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run this script as root." >&2
  exit 1
fi

missing_packages=()
command -v git >/dev/null 2>&1 || missing_packages+=(git)
command -v rsync >/dev/null 2>&1 || missing_packages+=(rsync)
command -v nginx >/dev/null 2>&1 || missing_packages+=(nginx)
command -v certbot >/dev/null 2>&1 || missing_packages+=(certbot python3-certbot-nginx)

if ((${#missing_packages[@]})); then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y "${missing_packages[@]}"
fi

if [[ -d "$SOURCE_DIR/.git" ]]; then
  git -C "$SOURCE_DIR" pull --ff-only origin main
else
  rm -rf "$SOURCE_DIR"
  git clone --depth 1 --branch main "$REPO_URL" "$SOURCE_DIR"
fi

install -d -m 0755 "$WEB_ROOT"
rsync -a --delete \
  --exclude='.git/' \
  --exclude='.github/' \
  --exclude='deploy/' \
  --exclude='README.md' \
  --exclude='LICENSE' \
  "$SOURCE_DIR/" "$WEB_ROOT/"
chown -R www-data:www-data "$WEB_ROOT"

install -m 0644 "$SOURCE_DIR/deploy/fde.onex.plus.nginx.conf" "$NGINX_SITE"
ln -sfn "$NGINX_SITE" /etc/nginx/sites-enabled/fde.onex.plus
nginx -t
systemctl reload nginx

certbot --nginx \
  --domain fde.onex.plus \
  --non-interactive \
  --agree-tos \
  --redirect \
  --keep-until-expiring \
  --register-unsafely-without-email

nginx -t
systemctl reload nginx

echo "FDE site deployed from $REPO_URL to https://fde.onex.plus/"
