import { Server } from 'socket.io'

const gameRooms = new Map();

const SocketHandler = (req, res) => {
  if (res.socket.server.io) {
    console.log('Socket is already running')
  } else {
    console.log('Socket is initializing')
    const io = new Server(res.socket.server, {
      path: '/api/socket',
      addTrailingSlash: false,
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    })
    res.socket.server.io = io

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

        if (room.players.size === 2) {
          room.gameStarted = true;
          io.to(roomId).emit('game_start', {
            players: Array.from(room.players.values())
          });
        }

        socket.emit('room_joined', { 
          roomId,
          playerId: playerData.id,
          playerCount: room.players.size 
        });
      });

      socket.on('player_move', (data) => {
        if (socket.roomId) {
          socket.to(socket.roomId).emit('player_moved', {
            playerId: socket.playerId,
            ...data
          });
        }
      });

      socket.on('player_throw', (data) => {
        if (socket.roomId) {
          socket.to(socket.roomId).emit('player_threw', {
            playerId: socket.playerId,
            ...data
          });
        }
      });

      socket.on('player_hit', (data) => {
        if (socket.roomId) {
          socket.to(socket.roomId).emit('player_was_hit', {
            playerId: data.targetId,
            damage: data.damage,
            attackerId: socket.playerId
          });
        }
      });

      socket.on('game_over', (data) => {
        if (socket.roomId) {
          io.to(socket.roomId).emit('game_ended', data);
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
          }
        }
      });
    });
  }
  res.end()
}

export default SocketHandler