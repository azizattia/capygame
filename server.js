const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  path: "/socket.io/",
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.static(path.join(__dirname)));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    uptime: process.uptime(), 
    rooms: gameRooms.size,
    timestamp: new Date().toISOString(),
    socketio: 'running'
  });
});

// Test Socket.IO endpoint
app.get('/test-socket', (req, res) => {
  res.send(`
    <h1>Socket.IO Test</h1>
    <p>Server is running at: ${req.get('host')}</p>
    <p>Socket.IO should be available at: /socket.io/</p>
    <script src="/socket.io/socket.io.js"></script>
    <script>const socket = io(); console.log('Socket.IO loaded:', !!socket);</script>
  `);
});

// Root endpoint
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const gameRooms = new Map();

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('join_room', (data) => {
    const { roomId, playerData } = data;
    
    socket.join(roomId);
    socket.roomId = roomId;
    socket.playerId = playerData.id;

    if (!gameRooms.has(roomId)) {
      gameRooms.set(roomId, {
        players: new Map(),
        gameStarted: false
      });
    }

    const room = gameRooms.get(roomId);
    
    if (room.players.size >= 2) {
      socket.emit('room_full');
      return;
    }

    room.players.set(socket.id, {
      ...playerData,
      socketId: socket.id
    });

    socket.to(roomId).emit('player_joined', {
      playerId: playerData.id,
      player: {
        ...playerData,
        // Force bottom-right spawn for second player
        x: 750, // Bottom-right x
        y: 550  // Bottom-right y
      }
    });

    socket.emit('room_joined', {
      roomId,
      players: Array.from(room.players.values())
    });

    if (room.players.size === 2 && !room.gameStarted) {
      room.gameStarted = true;
      io.to(roomId).emit('game_start', {
        players: Array.from(room.players.values())
      });
    }
  });

  socket.on('player_update', (data) => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit('player_update', data);
    }
  });

  socket.on('player_throw', (data) => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit('player_threw', data);
    }
  });

  socket.on('powerup_applied', (data) => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit('powerup_applied', data);
      console.log(`Syncing powerup ${data.powerupType} for player ${data.playerId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    if (socket.roomId && gameRooms.has(socket.roomId)) {
      const room = gameRooms.get(socket.roomId);
      room.players.delete(socket.id);
      
      socket.to(socket.roomId).emit('player_left', {
        playerId: socket.playerId
      });

      if (room.players.size === 0) {
        gameRooms.delete(socket.roomId);
      } else {
        room.gameStarted = false;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});