# HomeBeam

A LAN-only, self-hosted video call + screen sharing tool.  
Runs entirely on your local network (no external servers required).

> Tagline: **I Love You 3000**

## Features
- HTTPS (self-signed) for camera/mic permissions
- Room code (4 digits) + invite link
- Video call + screen share
- Works great on Raspberry Pi as a “Home Server”

---

## Requirements
- Node.js 22+ recommended
- npm
- OpenSSL installed (for local certificate generation)
  - Linux/Raspberry Pi: usually already installed
  - macOS: available by default
  - Windows: easiest via WSL, Git Bash with OpenSSL, or install OpenSSL separately

---

## Quick start (Production)
```bash
git clone https://github.com/vitoparry/homebeam.git
cd homebeam
npm ci
npm run cert
npm run build

# set ADMIN_TOKEN + optional PORT
ADMIN_TOKEN="change-me" PORT=3000 npm run start

Open:

https://<your-host-ip>:3000

First time: trust the certificate

Because HomeBeam uses a self-signed certificate, your browser will warn once.
Proceed to the site and accept/trust the cert so camera/mic works.

Dev mode (optional)
npm ci
npm run cert
npm run dev -- --host 0.0.0.0 --port 5173

Environment variables

Create a .env file (not committed) based on .env.example:

PORT (default 3000)

ADMIN_TOKEN (required for any future admin-only endpoints)

HOMEBEAM_IP (optional; used by cert generator SAN IP)

HOMEBEAM_NAME (optional; used by cert generator SAN DNS)

Run on Raspberry Pi (recommended)

On the Pi:

git clone https://github.com/vitoparry/homebeam.git
cd homebeam
npm ci
npm run cert
npm run build
ADMIN_TOKEN="change-me" PORT=3000 npm run start


Tip: Use Ethernet for best screenshare quality.

Security notes

Never commit private keys or .env.

Certificates are generated locally into certs/ and are gitignored.


---

## 5) Your workflow reminder (PC → GitHub → Pi)
Every time you change code on PC:

### PC
```bash
git add .
git commit -m "Your message"
git push

Pi
cd ~/homebeam
git pull
npm ci
npm run build
pkill -f "node server.js" || true
ADMIN_TOKEN='your-long-secret' PORT=3000 nohup node server.js > .logs/prod.log 2>&1 &

Environment Variables

HomeBeam reads environment variables from your shell or .env:

PORT
Default: 3000
Example: PORT=3000

ADMIN_TOKEN
Required for any admin-only endpoints (current/future).
Set a long random token and keep it private.

HOMEBEAM_IP (optional)
Used by the certificate generator to include the IP in the certificate SAN.
Example: HOMEBEAM_IP=192.168.68.50

HOMEBEAM_NAME (optional)
Used by the certificate generator to include a DNS name in the SAN.
Example: HOMEBEAM_NAME=homebeam

## License
MIT License. See the `LICENSE` file for details.
