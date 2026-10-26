#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "  Instalator Metin2 Web & Mobile Client (Singleplayer)    "
echo "=========================================================="

if [ "$EUID" -ne 0 ]; then
  echo "[!] Uruchom skrypt jako root: sudo bash install.sh"
  exit 1
fi

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="/opt/metin2-web"

# 1. Automatyczne wykrywanie danych bazy z Metin2 Singleplayer
DB_PASS=""
for ENV_FILE in "/opt/metin2/linux-port/docker/.env" "/opt/metin2/.env" "$SRC_DIR/.env"; do
  if [ -f "$ENV_FILE" ]; then
    FOUND_PASS=$(grep -E '^(M2_DB_ROOT_PASSWORD|DB_PASSWORD)=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r')
    if [ -n "$FOUND_PASS" ] && [ "$FOUND_PASS" != "YOUR_DB_PASSWORD" ]; then
      DB_PASS="$FOUND_PASS"
      echo "[+] Wykryto haslo bazy MariaDB z: $ENV_FILE"
      break
    fi
  fi
done

if [ -z "$DB_PASS" ]; then
  read -rsp "[?] Nie znaleziono automatycznie hasla MariaDB. Podaj haslo root do bazy: " DB_PASS
  echo ""
fi

# Wykrywanie publicznego IP VPS
PUBLIC_IP=$(curl -4 -s --max-time 5 https://ifconfig.me || hostname -I | awk '{print $1}')
echo "[+] Wykryty adres IP serwera: ${PUBLIC_IP:-127.0.0.1}"

# 2. Instalacja wymaganych pakietow systemowych
echo "[*] Sprawdzanie i instalacja zaleznosci (nginx, nodejs, npm, python3-pymysql, python3-markupsafe)..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx nodejs npm python3 python3-pip python3-pymysql python3-markupsafe curl >/dev/null

# 3. Kopiowanie plikow do /opt/metin2-web
echo "[*] Kopiowanie plikow klienta do $TARGET_DIR..."
mkdir -p "$TARGET_DIR"
if [ "$SRC_DIR" != "$TARGET_DIR" ]; then
  cp -r "$SRC_DIR/bridge" "$SRC_DIR/reg" "$SRC_DIR/site" "$SRC_DIR/systemd" "$TARGET_DIR/"
fi
mkdir -p "$TARGET_DIR/reg/replays"
chown -R root:www-data "$TARGET_DIR/bridge"

# 4. Generowanie pliku .env
cat > "$TARGET_DIR/.env" <<EOF
PUBLIC_IP=${PUBLIC_IP:-127.0.0.1}
WEB_HTTP_PORT=80
WEB_ALT_PORT=8080
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=${DB_PASS}
BRIDGE_PORT=11496
REG_API_PORT=11497
EOF
chmod 600 "$TARGET_DIR/.env"

# 5. Konfiguracja origins w bridge-site.json pod IP serwera
python3 - <<PYEOF
import json
p = "$TARGET_DIR/bridge/bridge-site.json"
ip = "${PUBLIC_IP:-127.0.0.1}"
with open(p, "r", encoding="utf-8") as f:
    cfg = json.load(f)
cfg["allowedOrigins"] = [
    f"http://{ip}",
    f"http://{ip}:8080",
    f"https://{ip}",
    f"https://{ip.replace('.', '-')}.sslip.io",
    f"http://{ip.replace('.', '-')}.sslip.io",
    "http://127.0.0.1",
    "http://localhost"
]
with open(p, "w", encoding="utf-8") as f:
    json.dump(cfg, f, indent=2)
PYEOF

# 6. Instalacja paczek Node.js dla mostka WebSocket -> TCP
echo "[*] Instalacja zaleznosci Node.js w $TARGET_DIR/bridge..."
cd "$TARGET_DIR/bridge"
npm install --omit=dev --silent

# 7. Konfiguracja uslug systemd oraz Nginx
echo "[*] Konfiguracja uslug systemd (metin2-bridge, metin2-reg) oraz serwera Nginx..."
cp "$TARGET_DIR/systemd/metin2-bridge.service" /etc/systemd/system/
cp "$TARGET_DIR/systemd/metin2-reg.service" /etc/systemd/system/

cp "$TARGET_DIR/systemd/nginx_metin2_web.conf" /etc/nginx/sites-available/metin2-web
ln -sf /etc/nginx/sites-available/metin2-web /etc/nginx/sites-enabled/metin2-web
rm -f /etc/nginx/sites-enabled/default

systemctl daemon-reload
systemctl enable --now metin2-bridge.service
systemctl enable --now metin2-reg.service
systemctl restart metin2-bridge.service metin2-reg.service
nginx -t && systemctl enable --now nginx && systemctl reload nginx

echo ""
echo "=========================================================="
echo "  [OK] Instalacja zakonczona pomyslnie!                   "
echo "=========================================================="
echo "  Gra w przegladarce / na telefonie:"
echo "    -> http://${PUBLIC_IP}/client.html?deflang=pl"
echo "    -> http://${PUBLIC_IP}:8080/client.html?deflang=pl"
echo ""
echo "  Rejestracja konta:"
echo "    -> http://${PUBLIC_IP}/rejestracja.html"
echo ""
echo "  Wojny Gildii Live i Powtorki 2D/3D:"
echo "    -> http://${PUBLIC_IP}/wojny.html"
echo "=========================================================="
