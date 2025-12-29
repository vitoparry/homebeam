# Changelog

## v1.0.0 — Initial Stable Release
**Release date:** 2025-12-30

### Features
- LAN-only video calling and screen sharing (WebRTC)
- HTTPS with locally generated self-signed certificates
- 4-digit room codes with copy/share support
- Invite link with join-code prefill
- Production server running on a single port (default: 3000)
- Raspberry Pi friendly (tested on Pi 4B, 8GB)

### UX
- Clean landing page layout
- “I Love You 3000” tagline
- Friendly connection status messages
- Copy room code button
- Lightweight toast notifications

### Dev & Ops
- Production build via `vite build`
- Single production server (`npm run start`)
- Cert generation via `npm run cert`
- Repo hygiene (no secrets or certs committed)
- MIT License

### Notes
- Designed for trusted local networks only.
- Not intended for direct public internet exposure without a reverse proxy and proper TLS.
