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

// Load the self-signed certificates
const httpsOptions = {
  key: readFileSync('./key.pem'),
  cert: readFileSync('./cert.pem')
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
    if (rooms[roomId]) {
      socket.emit('error', 'Room already exists');
      return;
    }
    rooms[roomId] = { host: socket.id, guest: null };
    socket.join(roomId);
    socket.emit('room-created', roomId);
    console.log(`Room ${roomId} created by ${socket.id}`);
  });

  socket.on('join-room', (roomId) => {
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
    socket.to(room.host).emit('user-joined', socket.id);
    socket.emit('room-joined', roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  socket.on('signal', (data) => {
    const { roomId, signalData } = data;
    socket.to(roomId).emit('signal', signalData);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Local Secure Server running on port ${PORT} (HTTPS)`);
});