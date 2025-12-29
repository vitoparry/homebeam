import express from 'express';
import { createServer } from 'https';
import { readFileSync } from 'fs';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

// --- Friendly Message for the Root URL ---
app.get('/', (req, res) => {
  res.send(`
    <div style="font-family: sans-serif; text-align: center; padding: 40px;">
      <h1 style="color: #4f46e5;">HomeBeam Signal Server</h1>
      <p style="font-size: 1.2rem;">✅ Secure Connection Established.</p>
      <p>You have successfully trusted the certificate for the signaling server.</p>
      <hr style="margin: 20px auto; width: 50%; opacity: 0.2;">
      <p style="color: #666;">You can now close this tab and return to the App.</p>
    </div>
  `);
});

import fs from 'fs';

const keyPath = './certs/key.pem';
const certPath = './certs/cert.pem';

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  console.error('❌ Missing TLS certs in ./certs/');
  console.error('   Run: npm run cert');
  process.exit(1);
}
// Load the self-signed certificates
const httpsOptions = {
  key: readFileSync(keyPath),
  cert: readFileSync(certPath),
};

const server = createServer(httpsOptions, app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

const PORT = 3001;

const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create-room', (roomId) => {
    console.log(`[Server] Create Room request: ${roomId} from ${socket.id}`);
    if (rooms[roomId]) {
      socket.emit('error', 'Room already exists');
      return;
    }
    rooms[roomId] = { host: socket.id, guest: null };
    socket.join(roomId);
    socket.emit('room-created', roomId);
    console.log(`[Server] Room ${roomId} created. Host: ${socket.id}`);
  });

  socket.on('join-room', (roomId) => {
    console.log(`[Server] Join Room request: ${roomId} from ${socket.id}`);
    const room = rooms[roomId];
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }
    if (room.guest) {
      socket.emit('error', 'Room is full');
      return;
    }
    room.guest = socket.id;
    socket.join(roomId);
    
    // Explicitly emit to Host ID instead of broadcast to room, to be safer
    io.to(room.host).emit('user-joined', socket.id); 
    socket.emit('room-joined', roomId);
    console.log(`[Server] User ${socket.id} joined room ${roomId}`);
  });

  socket.on('signal', (data) => {
    const { roomId, signalData } = data;
    console.log(`[Server] Relay Signal (${signalData.type || 'candidate'}) from ${socket.id} to room ${roomId}`);
    
    // Safety check: ensure roomId exists
    if (!roomId) { 
        console.error("[Server] Missing roomId in signal");
        return; 
    }

    // Broadcast to others in the room
    socket.to(roomId).emit('signal', signalData);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Local Secure Server running on port ${PORT} (HTTPS)`);
});