#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="/opt/fde-field-test"
XRAY_CONFIG="/usr/local/etc/xray/config.json"
NGINX_CONFIG="/etc/nginx/nginx.conf"
NGINX_SITE="/etc/nginx/sites-available/fde.onex.plus"
STREAM_ROOT="/etc/nginx/stream.conf"
STREAM_DIR="/etc/nginx/stream.d"
stamp="$(date +%Y%m%d%H%M%S)"
backup_dir="/root/fde-sni-backup-$stamp"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run this script as root." >&2
  exit 1
fi

[[ -f "$XRAY_CONFIG" ]] || { echo "Xray config not found: $XRAY_CONFIG" >&2; exit 1; }
[[ -f /etc/letsencrypt/live/fde.onex.plus/fullchain.pem ]] || { echo "FDE certificate is missing." >&2; exit 1; }

install -d -m 0700 "$backup_dir"
cp -a "$XRAY_CONFIG" "$backup_dir/xray-config.json"
cp -a "$NGINX_CONFIG" "$backup_dir/nginx.conf"
[[ -f "$NGINX_SITE" ]] && cp -a "$NGINX_SITE" "$backup_dir/fde.onex.plus"
[[ -f "$STREAM_ROOT" ]] && cp -a "$STREAM_ROOT" "$backup_dir/stream.conf"

rollback() {
  echo "SNI setup failed; restoring Xray and Nginx configuration." >&2
  cp -a "$backup_dir/xray-config.json" "$XRAY_CONFIG"
  cp -a "$backup_dir/nginx.conf" "$NGINX_CONFIG"
  install -m 0644 "$SOURCE_DIR/deploy/fde.onex.plus.acme.nginx.conf" "$NGINX_SITE"
  if [[ -f "$backup_dir/stream.conf" ]]; then cp -a "$backup_dir/stream.conf" "$STREAM_ROOT"; else rm -f "$STREAM_ROOT"; fi
  systemctl restart xray || true
  nginx -t && systemctl restart nginx || true
}
trap rollback ERR

if grep -Eq '"port"[[:space:]]*:[[:space:]]*443[[:space:]]*,' "$XRAY_CONFIG"; then
  perl -0pi -e 's/"port"\s*:\s*443\s*,/"listen": "127.0.0.1",\n      "port": 1443,/ or die "Xray port replacement failed\n"' "$XRAY_CONFIG"
elif ! grep -Eq '"port"[[:space:]]*:[[:space:]]*1443[[:space:]]*,' "$XRAY_CONFIG"; then
  echo "Xray is not configured on expected port 443 or 1443." >&2
  exit 1
fi

/usr/local/bin/xray run -test -config "$XRAY_CONFIG"

install -m 0644 "$SOURCE_DIR/deploy/fde.onex.plus.nginx.conf" "$NGINX_SITE"
ln -sfn "$NGINX_SITE" /etc/nginx/sites-enabled/fde.onex.plus
install -d -m 0755 "$STREAM_DIR"
install -m 0644 "$SOURCE_DIR/deploy/fde-sni.stream.conf" "$STREAM_DIR/fde-sni.conf"
printf 'stream {\n    include /etc/nginx/stream.d/*.conf;\n}\n' > "$STREAM_ROOT"
if ! grep -qxF 'include /etc/nginx/stream.conf;' "$NGINX_CONFIG"; then
  printf '\ninclude /etc/nginx/stream.conf;\n' >> "$NGINX_CONFIG"
fi

nginx -t
systemctl restart xray
systemctl restart nginx

ss -lntp | grep -q '127.0.0.1:1443.*xray'
ss -lntp | grep -q '127.0.0.1:8443.*nginx'
ss -lntp | grep -Eq '(:|\])443 .*nginx'

trap - ERR
echo "SNI routing enabled: fde.onex.plus -> Nginx; all other TLS -> Xray."
echo "Rollback backup: $backup_dir"
