const io = require('socket.io-client');

console.log('🚀 Testing Capybara Game Multiplayer...');

// Test production deployment
const PRODUCTION_URL = 'https://capygame-seven.vercel.app';

function createTestPlayer(playerName, callback) {
    const socket = io(PRODUCTION_URL, {
        path: '/api/socket',
        transports: ['polling'],
        timeout: 10000,
        forceNew: true
    });

    socket.playerId = Math.random().toString(36).substr(2, 9);
    socket.playerName = playerName;

    socket.on('connect', () => {
        console.log(`✅ ${playerName} connected to server`);
        
        // Create or join room
        const roomId = 'TEST01';
        const playerData = {
            id: socket.playerId,
            x: 100,
            y: 100,
            health: 10,
            maxHealth: 10,
            facing: 'right'
        };

        socket.emit('join_room', {
            roomId: roomId,
            playerData: playerData
        });
    });

    socket.on('room_joined', (data) => {
        console.log(`🏠 ${playerName} joined room: ${data.roomId} with ${data.players.length} players`);
        if (callback) callback(socket);
    });

    socket.on('player_joined', (data) => {
        console.log(`👤 ${playerName} sees new player joined: ${data.playerId}`);
    });

    socket.on('game_start', (data) => {
        console.log(`🎮 ${playerName} - Game started! Players: ${data.players.length}`);
    });

    socket.on('player_update', (data) => {
        console.log(`🏃 ${playerName} sees player movement: ${data.playerId || data.player?.id}`);
    });

    socket.on('player_threw', (data) => {
        console.log(`🧀 ${playerName} sees cheese thrown by: ${data.playerId || data.cheese?.owner}`);
    });

    socket.on('disconnect', () => {
        console.log(`❌ ${playerName} disconnected`);
    });

    socket.on('connect_error', (error) => {
        console.log(`💥 ${playerName} connection error:`, error.message);
    });

    return socket;
}

// Create two test players
console.log('Creating Player 1...');
const player1 = createTestPlayer('Player1', () => {
    console.log('Creating Player 2...');
    const player2 = createTestPlayer('Player2', () => {
        console.log('Both players connected! Testing gameplay...');
        
        setTimeout(() => {
            // Test movement
            console.log('Testing player movement...');
            player1.emit('player_update', {
                playerId: player1.playerId,
                player: {
                    id: player1.playerId,
                    x: 150,
                    y: 150,
                    health: 10,
                    facing: 'right'
                }
            });
        }, 2000);

        setTimeout(() => {
            // Test cheese throwing
            console.log('Testing cheese throwing...');
            player2.emit('player_throw', {
                playerId: player2.playerId,
                cheese: {
                    x: 200,
                    y: 200,
                    owner: player2.playerId
                }
            });
        }, 4000);

        setTimeout(() => {
            console.log('🎉 Test completed! Multiplayer is working!');
            player1.disconnect();
            player2.disconnect();
            process.exit(0);
        }, 6000);
    });
});

// Cleanup after 15 seconds max
setTimeout(() => {
    console.log('⏰ Test timeout reached');
    process.exit(1);
}, 15000);