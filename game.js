class CapybaraGame {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.gameState = 'menu';
        this.players = new Map();
        this.playerId = Math.random().toString(36).substr(2, 9);
        this.currentPlayer = null;
        this.gameStarted = false;
        this.currentLevel = 1;
        this.maxLevel = 5;
        this.cheeseProjectiles = [];
        this.walls = [];
        this.currentRoomId = null;
        
        // Socket.IO connection
        this.socket = null;
        this.isConnected = false;
        
        // Joystick control variables
        this.moveJoystick = { x: 0, y: 0, active: false };
        this.aimJoystick = { x: 0, y: 0, active: false };
        this.movementVector = { x: 0, y: 0 };
        this.aimVector = { x: 0, y: 0 };
        
        // Auto shooting
        this.lastShotTime = 0;
        this.shootInterval = 3000; // 3 seconds
        
        // Multi-touch support
        this.activeTouches = new Map();
        this.movementTouchId = null;
        this.throwTouchId = null;
        
        this.levels = {
            1: { name: "Open Field", walls: [] },
            2: { name: "Center Block", walls: [{ x: 350, y: 250, width: 100, height: 100 }] },
            3: { name: "Corner Hideouts", walls: [
                { x: 50, y: 50, width: 100, height: 100 },
                { x: 650, y: 450, width: 100, height: 100 }
            ]},
            4: { name: "Maze", walls: [
                { x: 200, y: 100, width: 20, height: 200 },
                { x: 400, y: 200, width: 20, height: 200 },
                { x: 600, y: 100, width: 20, height: 200 }
            ]},
            5: { name: "Final Arena", walls: [
                { x: 150, y: 150, width: 80, height: 80 },
                { x: 570, y: 150, width: 80, height: 80 },
                { x: 150, y: 370, width: 80, height: 80 },
                { x: 570, y: 370, width: 80, height: 80 },
                { x: 360, y: 260, width: 80, height: 80 }
            ]}
        };
        
        this.init();
    }

    init() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.setupEventListeners();
        this.resizeCanvas();
        this.connectSocket();
        this.gameLoop();
    }

    connectSocket() {
        // Use different socket path for production (Vercel) vs local development
        const socketPath = window.location.hostname === 'localhost' ? '/socket.io/' : '/api/socket';
        const isProduction = window.location.hostname !== 'localhost';
        this.socket = io({
            path: socketPath,
            transports: isProduction ? ['polling'] : ['websocket', 'polling']
        });
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.isConnected = true;
        });


        this.socket.on('player_joined', (data) => {
            this.addRemotePlayer(data.player);
        });

        this.socket.on('player_update', (data) => {
            this.updateRemotePlayer(data.player);
        });

        this.socket.on('player_left', (data) => {
            this.removeRemotePlayer(data.playerId);
        });

        this.socket.on('player_threw', (data) => {
            this.addRemoteCheese(data.cheese);
        });

        this.socket.on('room_joined', (data) => {
            console.log('Joined room:', data.roomId);
            this.currentRoomId = data.roomId;
            document.getElementById('current-room-code').textContent = data.roomId;
            document.getElementById('room-info').style.display = 'block';
            this.showGame();
        });

        this.socket.on('game_start', (data) => {
            console.log('Game starting with players:', data.players);
            this.startGamePlay();
        });

        this.socket.on('room_full', () => {
            document.getElementById('room-full-message').style.display = 'block';
            setTimeout(() => {
                document.getElementById('room-full-message').style.display = 'none';
            }, 3000);
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.isConnected = false;
        });
    }

    setupEventListeners() {
        document.getElementById('play-btn').addEventListener('click', () => this.showRoomSetup());
        document.getElementById('create-room-btn').addEventListener('click', () => this.createRoom());
        document.getElementById('join-room-btn').addEventListener('click', () => this.joinRoom());
        document.getElementById('back-to-menu-btn').addEventListener('click', () => this.backToMenu());
        document.getElementById('play-again-btn').addEventListener('click', () => this.resetGame());
        document.getElementById('next-level-btn').addEventListener('click', () => this.nextLevel());

        // Setup joystick controls
        this.setupJoystickControls();

        window.addEventListener('resize', () => this.resizeCanvas());
    }

    setupJoystickControls() {
        const moveJoystick = document.getElementById('move-joystick');
        const aimJoystick = document.getElementById('aim-joystick');
        
        // Move joystick
        this.setupJoystick(moveJoystick, (x, y) => {
            this.moveJoystick.x = x;
            this.moveJoystick.y = y;
            this.movementVector.x = x * 3;
            this.movementVector.y = y * 3;
        });
        
        // Aim joystick  
        this.setupJoystick(aimJoystick, (x, y) => {
            this.aimJoystick.x = x;
            this.aimJoystick.y = y;
            this.aimVector.x = x;
            this.aimVector.y = y;
        });
    }
    
    setupJoystick(joystickElement, onMove) {
        const knob = joystickElement.querySelector('.joystick-knob');
        const rect = joystickElement.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const maxDistance = centerX - 20;
        
        let isActive = false;
        
        const handleStart = (clientX, clientY) => {
            isActive = true;
            joystickElement.style.opacity = '1';
        };
        
        const handleMove = (clientX, clientY) => {
            if (!isActive) return;
            
            const rect = joystickElement.getBoundingClientRect();
            const x = clientX - rect.left - centerX;
            const y = clientY - rect.top - centerY;
            
            const distance = Math.sqrt(x * x + y * y);
            
            if (distance <= maxDistance) {
                knob.style.left = `${centerX + x}px`;
                knob.style.top = `${centerY + y}px`;
                onMove(x / maxDistance, y / maxDistance);
            } else {
                const angle = Math.atan2(y, x);
                const limitedX = Math.cos(angle) * maxDistance;
                const limitedY = Math.sin(angle) * maxDistance;
                knob.style.left = `${centerX + limitedX}px`;
                knob.style.top = `${centerY + limitedY}px`;
                onMove(limitedX / maxDistance, limitedY / maxDistance);
            }
        };
        
        const handleEnd = () => {
            isActive = false;
            joystickElement.style.opacity = '0.7';
            knob.style.left = '50%';
            knob.style.top = '50%';
            onMove(0, 0);
        };
        
        // Mouse events
        joystickElement.addEventListener('mousedown', (e) => {
            handleStart(e.clientX, e.clientY);
        });
        
        document.addEventListener('mousemove', (e) => {
            handleMove(e.clientX, e.clientY);
        });
        
        document.addEventListener('mouseup', handleEnd);
        
        // Touch events
        joystickElement.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            handleStart(touch.clientX, touch.clientY);
        });
        
        document.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (e.touches.length > 0) {
                const touch = e.touches[0];
                handleMove(touch.clientX, touch.clientY);
            }
        });
        
        document.addEventListener('touchend', (e) => {
            e.preventDefault();
            handleEnd();
        });
    }

    showRoomSetup() {
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('room-setup').style.display = 'block';
    }

    createRoom() {
        const roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
        this.joinRoomById(roomId);
    }

    joinRoom() {
        const roomId = document.getElementById('room-code-input').value.trim().toUpperCase();
        if (roomId.length === 6) {
            this.joinRoomById(roomId);
        } else {
            alert('Please enter a valid 6-character room code');
        }
    }

    joinRoomById(roomId) {
        if (!this.socket || !this.isConnected) {
            alert('Connecting to server... Please try again in a moment.');
            return;
        }
        
        this.createPlayer();
        this.socket.emit('join_room', {
            roomId: roomId,
            playerData: {
                id: this.playerId,
                x: this.currentPlayer.x,
                y: this.currentPlayer.y,
                health: this.currentPlayer.health,
                maxHealth: this.currentPlayer.maxHealth,
                facing: this.currentPlayer.facing
            }
        });
    }

    showGame() {
        document.getElementById('room-setup').style.display = 'none';
        document.getElementById('game-container').style.display = 'flex';
        this.gameState = 'waiting';
        this.currentLevel = 1;
        this.loadLevel();
        
        document.getElementById('waiting-message').style.display = 'block';
    }

    backToMenu() {
        if (this.socket && this.isConnected) {
            this.socket.disconnect();
            this.socket.connect();
        }
        
        this.gameState = 'menu';
        this.players.clear();
        this.currentPlayer = null;
        this.gameStarted = false;
        this.roomId = null;
        this.cheeseProjectiles = [];
        
        document.getElementById('game-container').style.display = 'none';
        document.getElementById('room-setup').style.display = 'none';
        document.getElementById('game-over').style.display = 'none';
        document.getElementById('level-complete').style.display = 'none';
        document.getElementById('main-menu').style.display = 'block';
        document.getElementById('room-info').style.display = 'none';
        document.getElementById('room-code-input').value = '';
    }

    handleMouseDown(e) {
        if (this.gameState !== 'playing') return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Check if click is in left half (movement area)
        if (x < this.canvas.width / 2) {
            this.startMovementDrag(x, y);
        } else {
            // Right half is for cheese throwing
            this.startThrowDrag(x, y);
        }
    }

    handleMouseMove(e) {
        if (this.gameState !== 'playing') return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (this.isDragging) {
            this.updateMovementDrag(x, y);
        }
        
        if (this.isThrowing) {
            this.updateThrowDrag(x, y);
        }
    }

    handleMouseUp(e) {
        if (this.gameState !== 'playing') return;
        
        if (this.isDragging) {
            this.endMovementDrag();
        }
        
        if (this.isThrowing) {
            this.endThrowDrag();
        }
    }

    handleTouchStart(e) {
        e.preventDefault();
        if (this.gameState !== 'playing') return;
        
        const rect = this.canvas.getBoundingClientRect();
        
        // Handle all new touches
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            
            // Store touch info
            this.activeTouches.set(touch.identifier, { x, y, startX: x, startY: y });
            
            // Determine if it's movement (left half) or throwing (right half)
            if (x < this.canvas.width / 2 && this.movementTouchId === null) {
                this.movementTouchId = touch.identifier;
                this.startMovementDrag(x, y);
            } else if (x >= this.canvas.width / 2 && this.throwTouchId === null) {
                this.throwTouchId = touch.identifier;
                this.startThrowDrag(x, y);
            }
        }
    }

    handleTouchMove(e) {
        e.preventDefault();
        if (this.gameState !== 'playing') return;
        
        const rect = this.canvas.getBoundingClientRect();
        
        // Handle all moving touches
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            
            // Update stored touch info
            if (this.activeTouches.has(touch.identifier)) {
                const touchInfo = this.activeTouches.get(touch.identifier);
                touchInfo.x = x;
                touchInfo.y = y;
                
                // Handle movement touch
                if (touch.identifier === this.movementTouchId && this.isDragging) {
                    this.updateMovementDrag(x, y);
                }
                
                // Handle throw touch
                if (touch.identifier === this.throwTouchId && this.isThrowing) {
                    this.updateThrowDrag(x, y);
                }
            }
        }
    }

    handleTouchEnd(e) {
        e.preventDefault();
        if (this.gameState !== 'playing') return;
        
        // Handle all ended touches
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            
            // Remove from active touches
            this.activeTouches.delete(touch.identifier);
            
            // End movement if this was the movement touch
            if (touch.identifier === this.movementTouchId) {
                this.movementTouchId = null;
                if (this.isDragging) {
                    this.endMovementDrag();
                }
            }
            
            // End throwing if this was the throw touch
            if (touch.identifier === this.throwTouchId) {
                this.throwTouchId = null;
                if (this.isThrowing) {
                    this.endThrowDrag();
                }
            }
        }
    }

    startMovementDrag(x, y) {
        this.isDragging = true;
        this.dragStartX = x;
        this.dragStartY = y;
        this.dragCurrentX = x;
        this.dragCurrentY = y;
    }

    updateMovementDrag(x, y) {
        this.dragCurrentX = x;
        this.dragCurrentY = y;
        
        const dx = this.dragCurrentX - this.dragStartX;
        const dy = this.dragCurrentY - this.dragStartY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 10) {
            this.movementVector.x = dx / distance;
            this.movementVector.y = dy / distance;
        } else {
            this.movementVector.x = 0;
            this.movementVector.y = 0;
        }
    }

    endMovementDrag() {
        this.isDragging = false;
        this.movementVector.x = 0;
        this.movementVector.y = 0;
    }

    startThrowDrag(x, y) {
        this.isThrowing = true;
        this.throwStartX = x;
        this.throwStartY = y;
        this.throwCurrentX = x;
        this.throwCurrentY = y;
    }

    updateThrowDrag(x, y) {
        this.throwCurrentX = x;
        this.throwCurrentY = y;
        
        const dx = this.throwCurrentX - this.throwStartX;
        const dy = this.throwCurrentY - this.throwStartY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 5) {
            this.throwVector.x = dx / distance;
            this.throwVector.y = dy / distance;
        } else {
            this.throwVector.x = 0;
            this.throwVector.y = 0;
        }
    }

    endThrowDrag() {
        if (this.currentPlayer && this.currentPlayer.throwCooldown <= 0 && 
            (this.throwVector.x !== 0 || this.throwVector.y !== 0)) {
            this.throwCheese(this.currentPlayer);
        }
        
        this.isThrowing = false;
        this.throwVector.x = 0;
        this.throwVector.y = 0;
    }

    resizeCanvas() {
        const container = document.getElementById('game-container');
        const maxWidth = Math.min(800, window.innerWidth - 40);
        const maxHeight = Math.min(600, window.innerHeight - 200);
        
        this.canvas.style.width = maxWidth + 'px';
        this.canvas.style.height = maxHeight + 'px';
    }

    loadLevel() {
        this.walls = [...this.levels[this.currentLevel].walls];
        document.getElementById('current-level').textContent = `Level ${this.currentLevel}`;
    }

    createPlayer() {
        const spawnPoints = this.getSpawnPoints();
        
        this.currentPlayer = {
            id: this.playerId,
            x: spawnPoints[0].x,
            y: spawnPoints[0].y,
            width: 50,
            height: 50,
            health: 10,
            maxHealth: 10,
            speed: 3,
            facing: 'right',
            throwCooldown: 0,
            isLocal: true
        };
        
        this.players.set(this.playerId, this.currentPlayer);
    }

    getSpawnPoints() {
        const points = [
            { x: 50, y: 50 },
            { x: this.canvas.width - 100, y: this.canvas.height - 100 }
        ];
        
        return points.filter(point => !this.isPointInWall(point.x, point.y, 50, 50));
    }

    isPointInWall(x, y, width, height) {
        return this.walls.some(wall => 
            x < wall.x + wall.width &&
            x + width > wall.x &&
            y < wall.y + wall.height &&
            y + height > wall.y
        );
    }

    addRemotePlayer(playerData) {
        const spawnPoints = this.getSpawnPoints();
        
        const remotePlayer = {
            id: playerData.id,
            x: spawnPoints[1] ? spawnPoints[1].x : playerData.x,
            y: spawnPoints[1] ? spawnPoints[1].y : playerData.y,
            width: 50,
            height: 50,
            health: playerData.health,
            maxHealth: playerData.maxHealth,
            speed: 3,
            facing: playerData.facing,
            throwCooldown: 0,
            isLocal: false
        };
        
        this.players.set(playerData.id, remotePlayer);
        this.updateHealthUI();
    }
    
    updateRemotePlayer(playerData) {
        const player = this.players.get(playerData.id);
        if (player && !player.isLocal) {
            player.x = playerData.x;
            player.y = playerData.y;
            player.health = playerData.health;
            player.facing = playerData.facing;
            this.updateHealthUI();
        }
    }
    
    removeRemotePlayer(playerId) {
        this.players.delete(playerId);
        this.updateHealthUI();
        
        // Return to waiting state if opponent leaves
        if (this.players.size < 2 && this.gameStarted) {
            this.gameState = 'waiting';
            this.gameStarted = false;
            document.getElementById('waiting-message').style.display = 'block';
        }
    }
    
    addRemoteCheese(cheeseData) {
        this.cheeseProjectiles.push(cheeseData);
    }

    startGamePlay() {
        this.gameState = 'playing';
        this.gameStarted = true;
        document.getElementById('waiting-message').style.display = 'none';
        this.updateHealthUI();
    }

    update() {
        if (this.gameState !== 'playing') return;
        
        this.players.forEach(player => {
            if (player.throwCooldown > 0) {
                player.throwCooldown--;
            }
        });
        
        this.updateCurrentPlayer();
        this.handleAutoShooting();
        this.updateProjectiles();
        this.checkCollisions();
        this.checkGameEnd();
    }
    
    handleAutoShooting() {
        if (!this.currentPlayer || this.gameState !== 'playing') return;
        
        const currentTime = Date.now();
        if (currentTime - this.lastShotTime >= this.shootInterval) {
            // Only shoot if aiming or if there's any aim input
            if (Math.abs(this.aimVector.x) > 0.1 || Math.abs(this.aimVector.y) > 0.1) {
                this.throwCheese();
                this.lastShotTime = currentTime;
            }
        }
    }

    updateCurrentPlayer() {
        if (!this.currentPlayer) return;
        
        const player = this.currentPlayer;
        let newX = player.x;
        let newY = player.y;
        let moved = false;
        
        // Apply drag movement
        if (this.movementVector.x !== 0 || this.movementVector.y !== 0) {
            newX += this.movementVector.x * player.speed;
            newY += this.movementVector.y * player.speed;
            moved = true;
            
            // Update facing direction
            if (this.movementVector.x > 0) {
                player.facing = 'right';
            } else if (this.movementVector.x < 0) {
                player.facing = 'left';
            }
        }
        
        // Boundary and wall collision checks
        newX = Math.max(0, Math.min(this.canvas.width - player.width, newX));
        newY = Math.max(0, Math.min(this.canvas.height - player.height, newY));
        
        if (!this.isPointInWall(newX, player.y, player.width, player.height)) {
            player.x = newX;
        }
        if (!this.isPointInWall(player.x, newY, player.width, player.height)) {
            player.y = newY;
        }
        
        // Send player update to other players if moved
        if (moved && this.isConnected && this.socket) {
            this.socket.emit('player_update', {
                playerId: this.playerId,
                player: {
                    id: player.id,
                    x: player.x,
                    y: player.y,
                    health: player.health,
                    facing: player.facing
                }
            });
        }
    }

    throwCheese() {
        if (!this.currentPlayer || this.currentPlayer.throwCooldown > 0) return;
        
        this.currentPlayer.throwCooldown = 45;
        
        const cheese = {
            x: this.currentPlayer.x + this.currentPlayer.width / 2,
            y: this.currentPlayer.y + this.currentPlayer.height / 2,
            width: 12,
            height: 12,
            speed: 6,
            dx: this.aimVector.x,
            dy: this.aimVector.y,
            owner: this.currentPlayer.id,
            life: 120,
            id: Math.random().toString(36).substr(2, 9)
        };
        
        this.cheeseProjectiles.push(cheese);
        
        // Send cheese throw to other players
        if (this.isConnected && this.socket) {
            this.socket.emit('player_throw', {
                playerId: this.playerId,
                cheese: cheese
            });
        }
    }

    updateProjectiles() {
        this.cheeseProjectiles = this.cheeseProjectiles.filter(cheese => {
            cheese.x += cheese.dx * cheese.speed;
            cheese.y += cheese.dy * cheese.speed;
            cheese.life--;
            
            if (cheese.life <= 0 ||
                cheese.x < 0 || cheese.x > this.canvas.width ||
                cheese.y < 0 || cheese.y > this.canvas.height) {
                return false;
            }
            
            if (this.isPointInWall(cheese.x, cheese.y, cheese.width, cheese.height)) {
                return false;
            }
            
            return true;
        });
    }

    checkCollisions() {
        this.cheeseProjectiles = this.cheeseProjectiles.filter(cheese => {
            let hit = false;
            
            this.players.forEach(player => {
                if (player.id === cheese.owner) return;
                
                if (cheese.x < player.x + player.width &&
                    cheese.x + cheese.width > player.x &&
                    cheese.y < player.y + player.height &&
                    cheese.y + cheese.height > player.y) {
                    
                    this.damagePlayer(player);
                    hit = true;
                }
            });
            
            return !hit;
        });
    }

    damagePlayer(player) {
        player.health--;
        this.updateHealthUI();
        
        if (player.health <= 0) {
            this.endRound(player);
        }
    }

    updateHealthUI() {
        const playersArray = Array.from(this.players.values());
        
        // Current player health (always show as Player 1)
        if (this.currentPlayer) {
            document.getElementById('p1-health').style.width = (this.currentPlayer.health / this.currentPlayer.maxHealth * 100) + '%';
            document.getElementById('p1-hp').textContent = `${this.currentPlayer.health}/${this.currentPlayer.maxHealth}`;
        }
        
        // Other player health (show as Player 2)
        const otherPlayer = playersArray.find(p => p.id !== this.playerId);
        if (otherPlayer) {
            document.getElementById('p2-health').style.width = (otherPlayer.health / otherPlayer.maxHealth * 100) + '%';
            document.getElementById('p2-hp').textContent = `${otherPlayer.health}/${otherPlayer.maxHealth}`;
        } else {
            document.getElementById('p2-health').style.width = '0%';
            document.getElementById('p2-hp').textContent = '0/10';
        }
    }

    checkGameEnd() {
        const alivePlayers = Array.from(this.players.values()).filter(p => p.health > 0);
        
        if (alivePlayers.length <= 1 && this.gameStarted) {
            this.endRound(alivePlayers.length > 0 ? alivePlayers[0] : null);
        }
    }

    endRound(winner) {
        this.gameState = 'roundOver';
        this.gameStarted = false;
        
        if (winner && winner.id === this.playerId) {
            if (this.currentLevel < this.maxLevel) {
                document.getElementById('level-complete-text').textContent = 
                    `Level ${this.currentLevel} Complete!`;
                document.getElementById('level-complete').style.display = 'block';
            } else {
                document.getElementById('winner-text').textContent = "You won all levels! fantso!";
                document.getElementById('game-over').style.display = 'block';
            }
        } else {
            document.getElementById('winner-text').textContent = "You lost! fantso won!";
            document.getElementById('game-over').style.display = 'block';
        }
    }

    nextLevel() {
        document.getElementById('level-complete').style.display = 'none';
        this.currentLevel++;
        this.resetRound();
    }

    resetRound() {
        this.gameState = 'waiting';
        this.players.clear();
        this.currentPlayer = null;
        this.cheeseProjectiles = [];
        
        this.loadLevel();
        this.createPlayer();
        
        // Rejoin the same room
        if (this.roomId) {
            this.socket.emit('join_room', {
                roomId: this.roomId,
                playerData: {
                    id: this.playerId,
                    x: this.currentPlayer.x,
                    y: this.currentPlayer.y,
                    health: this.currentPlayer.health,
                    maxHealth: this.currentPlayer.maxHealth,
                    facing: this.currentPlayer.facing
                }
            });
        }
    }

    resetGame() {
        this.backToMenu();
    }

    render() {
        this.ctx.fillStyle = '#F0F8FF';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.fillStyle = '#98FB98';
        for (let i = 0; i < this.canvas.width; i += 60) {
            for (let j = 0; j < this.canvas.height; j += 60) {
                if ((i + j) % 120 === 0) {
                    this.ctx.fillRect(i, j, 30, 30);
                }
            }
        }
        
        this.drawWalls();
        
        this.players.forEach(player => {
            this.drawCapybara(player);
        });
        
        this.cheeseProjectiles.forEach(cheese => {
            this.drawCheese(cheese);
        });
        
        // Draw drag indicators
        this.drawDragIndicators();
    }

    drawDragIndicators() {
        if (this.gameState !== 'playing') return;
        
        // Draw mobile control indicators like mobile RPG games
        this.drawMobileControlAreas();
        
        // Draw movement drag indicator
        if (this.isDragging) {
            this.drawMovementJoystick();
        }
        
        // Draw throw drag indicator
        if (this.isThrowing) {
            this.drawThrowIndicator();
        }
    }
    
    drawMobileControlAreas() {
        // Only show on touch devices or small screens
        if (window.innerWidth > 768 && !('ontouchstart' in window)) return;
        
        // Draw movement control area (left side)
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(0, 150, 255, 0.1)';
        this.ctx.fillRect(20, this.canvas.height - 120, 100, 100);
        
        this.ctx.strokeStyle = 'rgba(0, 150, 255, 0.4)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(70, this.canvas.height - 70, 50, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // Draw inner circle
        this.ctx.beginPath();
        this.ctx.arc(70, this.canvas.height - 70, 15, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(0, 150, 255, 0.3)';
        this.ctx.fill();
        
        // Movement label
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('MOVE', 70, this.canvas.height - 130);
        
        // Draw throw control area (right side)
        this.ctx.fillStyle = 'rgba(255, 100, 0, 0.1)';
        this.ctx.fillRect(this.canvas.width - 120, this.canvas.height - 120, 100, 100);
        
        this.ctx.strokeStyle = 'rgba(255, 100, 0, 0.4)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(this.canvas.width - 70, this.canvas.height - 70, 50, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // Draw inner circle
        this.ctx.beginPath();
        this.ctx.arc(this.canvas.width - 70, this.canvas.height - 70, 15, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(255, 100, 0, 0.3)';
        this.ctx.fill();
        
        // Throw label
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.fillText('AIM', this.canvas.width - 70, this.canvas.height - 130);
        
        this.ctx.restore();
    }
    
    drawMovementJoystick() {
        // Calculate joystick position
        const dx = this.dragCurrentX - this.dragStartX;
        const dy = this.dragCurrentY - this.dragStartY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDistance = 50;
        
        let knobX = this.dragStartX;
        let knobY = this.dragStartY;
        
        if (distance > 0) {
            const limitedDistance = Math.min(distance, maxDistance);
            knobX = this.dragStartX + (dx / distance) * limitedDistance;
            knobY = this.dragStartY + (dy / distance) * limitedDistance;
        }
        
        this.ctx.save();
        
        // Draw outer circle (background)
        this.ctx.beginPath();
        this.ctx.arc(this.dragStartX, this.dragStartY, maxDistance, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(0, 150, 255, 0.2)';
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(0, 150, 255, 0.6)';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
        
        // Draw knob (moving part)
        this.ctx.beginPath();
        this.ctx.arc(knobX, knobY, 20, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(0, 150, 255, 0.8)';
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        this.ctx.restore();
    }
    
    drawThrowIndicator() {
        const dx = this.throwCurrentX - this.throwStartX;
        const dy = this.throwCurrentY - this.throwStartY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        this.ctx.save();
        
        // Draw aim circle at touch point
        this.ctx.beginPath();
        this.ctx.arc(this.throwStartX, this.throwStartY, 30, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(255, 100, 0, 0.2)';
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(255, 100, 0, 0.6)';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
        
        // Draw trajectory line
        if (distance > 5) {
            this.ctx.strokeStyle = 'rgba(255, 200, 0, 0.8)';
            this.ctx.lineWidth = 4;
            this.ctx.beginPath();
            this.ctx.moveTo(this.throwStartX, this.throwStartY);
            
            // Extend line to show trajectory
            const maxLength = 150;
            const actualLength = Math.min(distance * 2, maxLength);
            const endX = this.throwStartX + (dx / distance) * actualLength;
            const endY = this.throwStartY + (dy / distance) * actualLength;
            
            this.ctx.lineTo(endX, endY);
            this.ctx.stroke();
            
            // Draw arrow head
            const angle = Math.atan2(dy, dx);
            this.ctx.beginPath();
            this.ctx.moveTo(endX, endY);
            this.ctx.lineTo(endX - 15 * Math.cos(angle - Math.PI / 6), endY - 15 * Math.sin(angle - Math.PI / 6));
            this.ctx.moveTo(endX, endY);
            this.ctx.lineTo(endX - 15 * Math.cos(angle + Math.PI / 6), endY - 15 * Math.sin(angle + Math.PI / 6));
            this.ctx.stroke();
            
            // Draw power indicator
            const power = Math.min(distance / 100, 1);
            this.ctx.fillStyle = `rgba(255, ${255 - power * 155}, 0, 0.8)`;
            this.ctx.fillRect(this.throwStartX - 30, this.throwStartY - 45, 60 * power, 6);
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(this.throwStartX - 30, this.throwStartY - 45, 60, 6);
        }
        
        this.ctx.restore();
    }

    drawWalls() {
        this.ctx.fillStyle = '#8B4513';
        this.walls.forEach(wall => {
            this.ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
            
            this.ctx.fillStyle = '#A0522D';
            this.ctx.fillRect(wall.x + 2, wall.y + 2, wall.width - 4, wall.height - 4);
            this.ctx.fillStyle = '#8B4513';
        });
    }

    drawCapybara(player) {
        this.ctx.save();
        
        // Different colors for different players
        if (player.id === this.playerId) {
            this.ctx.fillStyle = '#D2691E'; // Brown for current player
        } else {
            this.ctx.fillStyle = '#4169E1'; // Blue for other players
        }
        
        this.ctx.fillRect(player.x, player.y, player.width, player.height);
        
        this.ctx.fillStyle = '#CD853F';
        this.ctx.fillRect(player.x + 3, player.y + 3, player.width - 6, player.height - 6);
        
        this.ctx.fillStyle = '#000';
        if (player.facing === 'right') {
            this.ctx.fillRect(player.x + player.width - 12, player.y + 8, 6, 6);
            this.ctx.fillRect(player.x + player.width - 8, player.y + 12, 3, 3);
        } else {
            this.ctx.fillRect(player.x + 6, player.y + 8, 6, 6);
            this.ctx.fillRect(player.x + 5, player.y + 12, 3, 3);
        }
        
        this.ctx.fillStyle = '#8B4513';
        this.ctx.fillRect(player.x + 8, player.y - 3, 12, 6);
        this.ctx.fillRect(player.x + 30, player.y - 3, 12, 6);
        
        if (player.health <= 3) {
            this.ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
            this.ctx.fillRect(player.x, player.y, player.width, player.height);
        }
        
        if (player.throwCooldown > 0) {
            this.ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
            this.ctx.fillRect(player.x - 2, player.y - 2, player.width + 4, player.height + 4);
        }
        
        this.ctx.restore();
    }

    drawCheese(cheese) {
        this.ctx.save();
        
        this.ctx.fillStyle = '#FFD700';
        this.ctx.fillRect(cheese.x, cheese.y, cheese.width, cheese.height);
        
        this.ctx.fillStyle = '#FFA500';
        this.ctx.fillRect(cheese.x + 2, cheese.y + 2, cheese.width - 4, cheese.height - 4);
        
        this.ctx.fillStyle = '#FF8C00';
        this.ctx.fillRect(cheese.x + 3, cheese.y + 3, 2, 2);
        this.ctx.fillRect(cheese.x + 7, cheese.y + 5, 2, 2);
        this.ctx.fillRect(cheese.x + 5, cheese.y + 7, 2, 2);
        
        this.ctx.restore();
    }

    gameLoop() {
        this.update();
        this.render();
        requestAnimationFrame(() => this.gameLoop());
    }
}

window.addEventListener('load', () => {
    new CapybaraGame();
});