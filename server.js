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
  }
});

app.use(express.static(path.join(__dirname)));

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
      player: playerData
    });

    socket.emit('joined_room', {
      roomId,
      players: Array.from(room.players.values())
    });

    if (room.players.size === 2 && !room.gameStarted) {
      room.gameStarted = true;
      io.to(roomId).emit('game_start');
    }
  });

  socket.on('player_update', (data) => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit('player_update', data);
    }
  });

  socket.on('cheese_throw', (data) => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit('cheese_throw', data);
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