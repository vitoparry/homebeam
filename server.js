import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "https";
import { Server as IOServer } from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Config ----
const PORT = Number(process.env.PORT || 3000); // ❤️ I Love You 3000
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ""; // set this on Pi in .env (not committed)

// TLS certs (local-only, gitignored)
const keyPath = path.join(__dirname, "certs", "key.pem");
const certPath = path.join(__dirname, "certs", "cert.pem");

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  console.error("❌ Missing TLS certs in ./certs/");
  console.error("   Run: npm run cert");
  process.exit(1);
}

const httpsOptions = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
};

// ---- App ----
const app = express();
app.use(cors());

// ---- Simple health check ----
app.get("/healthz", (req, res) => res.status(200).send("ok"));

// ---- Minimal usage stats (in-memory) ----
const stats = {
  startedAt: new Date().toISOString(),
  totalConnections: 0,
  currentConnections: 0,
  peakConcurrent: 0,
  roomsCreated: 0,
  joinEvents: 0,
  signalEvents: 0,
  disconnects: 0,
};

function authed(req) {
  if (!ADMIN_TOKEN) return false;
  const hdr = req.headers["x-admin-token"];
  const q = req.query.token;
  return hdr === ADMIN_TOKEN || q === ADMIN_TOKEN;
}

// Admin HTML page (B)
app.get("/admin", (req, res) => {
  if (!authed(req)) return res.status(401).send("Unauthorized");

  res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>HomeBeam Admin</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 24px; }
    .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; max-width: 720px; }
    h1 { margin: 0 0 8px; }
    .muted { color: #6b7280; }
    pre { background: #0b1020; color: #e5e7eb; padding: 12px; border-radius: 12px; overflow: auto; }
    button { padding: 10px 14px; border-radius: 10px; border: 1px solid #e5e7eb; background: white; cursor: pointer; }
    button:hover { background: #f9fafb; }
  </style>
</head>
<body>
  <div class="card">
    <h1>HomeBeam Admin</h1>
    <div class="muted">Live usage stats (LAN-only). Refreshes every 2 seconds.</div>
    <div style="margin: 12px 0;">
      <button id="refresh">Refresh now</button>
    </div>
    <pre id="out">Loading...</pre>
  </div>

  <script>
    async function load() {
      const res = await fetch('/admin/stats.json?token=${encodeURIComponent(
        String(req.query.token || "")
      )}');
      const txt = await res.text();
      document.getElementById('out').textContent = txt;
    }
    document.getElementById('refresh').addEventListener('click', load);
    load();
    setInterval(load, 2000);
  </script>
</body>
</html>`);
});

// Admin JSON stats
app.get("/admin/stats.json", (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: "Unauthorized" });
  res.json(stats);
});

// ---- Serve built UI (production) ----
const distDir = path.join(__dirname, "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (req, res) => {
    // for SPA routing
    res.sendFile(path.join(distDir, "index.html"));
  });
} else {
  // Helpful message if someone runs server without building
  app.get("/", (req, res) => {
    res.type("html").send(`
      <div style="font-family: sans-serif; padding: 40px;">
        <h1>HomeBeam server is running ✅</h1>
        <p>But <code>dist/</code> is missing.</p>
        <p>Run: <code>npm run build</code></p>
      </div>
    `);
  });
}

// ---- HTTPS + Socket.IO ----
const server = createServer(httpsOptions, app);
const io = new IOServer(server, {
  cors: { origin: "*" },
});

const rooms = {};

io.on("connection", (socket) => {
  stats.totalConnections += 1;
  stats.currentConnections += 1;
  stats.peakConcurrent = Math.max(stats.peakConcurrent, stats.currentConnections);

  socket.on("create-room", (roomId) => {
    stats.roomsCreated += 1;

    if (rooms[roomId]) {
      socket.emit("error", "Room already exists");
      return;
    }
    rooms[roomId] = { host: socket.id, users: [] };
    socket.join(roomId);
    socket.emit("room-created", roomId);
  });

  socket.on("join-room", (roomId) => {
    stats.joinEvents += 1;

    if (!rooms[roomId]) {
      socket.emit("error", "Room does not exist");
      return;
    }
    rooms[roomId].users.push(socket.id);
    socket.join(roomId);
    socket.to(roomId).emit("user-joined", socket.id);
    socket.emit("room-joined", roomId);
  });

  socket.on("signal", (data) => {
    stats.signalEvents += 1;

    const { roomId, signalData } = data || {};
    if (!roomId) return;
    socket.to(roomId).emit("signal", signalData);
  });

  socket.on("disconnect", () => {
    stats.disconnects += 1;
    stats.currentConnections = Math.max(0, stats.currentConnections - 1);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 HomeBeam production server listening on https://0.0.0.0:${PORT}`);
  if (!ADMIN_TOKEN) {
    console.log("⚠️  ADMIN_TOKEN not set. /admin will be locked out (recommended to set one).");
  }
});
