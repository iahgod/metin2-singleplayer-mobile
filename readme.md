# Metin2 Web & Mobile Client (Community Edition for Metin2 Singleplayer)

A complete **Web & Mobile Client (WebAssembly / HTML5)** package that allows playing on a **Metin2 Singleplayer (Linux/VPS)** server directly through a PC or mobile browser (Android / iOS), without the need to download the traditional `.exe` client.

---

## What is Included in the Package?

### 1. Game Client for Browser and Mobile (`/client.html`, `/mobile.html`)

- Full Metin2 client compiled to WebAssembly (`client.wasm` + `client.data` + on-demand loaded assets under `/corpus/`).
- **Mobile Interface (`mobile_overlay.js`):** Virtual joystick, touch buttons for attacks, skills, and potions, camera rotation, and inventory access designed for touchscreens.
- Supports installation as a **PWA (Progressive Web App)** on your smartphone's home screen.

### 2. WebSocket → TCP Network Bridge (`bridge/`)

- Lightweight Node.js server connecting the browser to the game server's login and channel ports (`11000`, `13000+`).

### 3. Fast Account Registration (`/rejestracja.html` + `reg/server.py`)

- Direct player account creation in the MariaDB database via web browser.

### 4. Live Guild Wars Hub & 2D/3D Replays (`/wojny.html` + `replay3d.py`)

- Guild leaderboard display.
- Real-time monitoring of active wars between bots and players.
- Automatic battle recording.
- 2D and 3D replay player.
- Discord Webhook notification support.

---

## Requirements

- A VPS server running **Ubuntu / Debian** with **Metin2 Singleplayer** installed and running (by default at `/opt/metin2`).
- `root` account access or `sudo` privileges.

---

## Quick Installation

### 1. Upload and Extract the Package

Upload the `Metin2_Web_Mobile_Client_Public.zip` file to your VPS server and execute the commands below:

```bash
apt-get update && apt-get install -y unzip
unzip Metin2_Web_Mobile_Client_Public.zip -d /tmp/metin2_web_client
cd /tmp/metin2_web_client
```

### 2. Run the Automatic Installer

```bash
bash install.sh
```

### What does `install.sh` do?

- Automatically reads the MariaDB database password from the Metin2 Singleplayer installation:
  - `/opt/metin2/linux-port/docker/.env`
  - `/opt/metin2/.env`
- Detects the public IP address of the VPS server and configures the WebSocket bridge connection (`bridge-site.json`).
- Installs the required packages:
  - `nginx`
  - `nodejs`
  - `npm`
  - `python3-pymysql`
  - `python3-markupsafe`
- Configures and starts background services:
  - `metin2-bridge`
  - `metin2-reg`
  - `nginx`

---

## Firewall Port Configuration (UFW / iptables)

To access the game externally from a smartphone or another computer, open port **80** (or the alternative port **8080**).

If you are using UFW, run:

```bash
ufw allow 80/tcp
ufw allow 8080/tcp
ufw reload
```

**Important:** If you use a VPS provider management panel (such as OVH, Hetzner, or Oracle Cloud), ensure that TCP ports `80` and `8080` are also opened in the security rules or firewall section.

---

## Accessing the Game via Browser or Mobile

Once the installation is complete, open your browser (Chrome, Safari, Firefox, or Edge) on your PC or smartphone and access the URLs below.

### Playing on PC or Mobile

The client automatically detects touch input.

```text
http://YOUR_VPS_IP/client.html?deflang=pl
```

Or using the alternative port:

```text
http://YOUR_VPS_IP:8080/client.html?deflang=pl
```

### Creating a New Account

```text
http://YOUR_VPS_IP/rejestracja.html
```

### Live Guild Wars and 2D/3D Replays

```text
http://YOUR_VPS_IP/wojny.html
```

Replace `YOUR_VPS_IP` with your server's public IP address.

> **Mobile Tip:** In your mobile browser (Chrome or Safari), select **Add to Home Screen** from the menu. This allows the client to launch in full screen, behaving like a native application.

---

## Service Management and Diagnostics

All components are configured as `systemd` services and will start automatically upon VPS reboot.

### Check Service Status

```bash
systemctl status metin2-bridge metin2-reg nginx
```

### Monitor Live Logs

WebSocket bridge logs:

```bash
journalctl -u metin2-bridge -f
```

Registration API logs:

```bash
journalctl -u metin2-reg -f
```

---

## Important Notes

- Paths, ports, and service names described in this document are default values set by the package and may vary according to your installation.
- Before running the installer as `root`, inspect the contents of `install.sh` to review the changes that will be applied to the system.
- Do not expose the MariaDB database directly to the internet unless strictly necessary.
- Use HTTPS and protect the registration system against abusive account creation.
- The `deflang=pl` parameter keeps the default language as Polish. If the client supports other languages, adjust the parameter according to the required language code.