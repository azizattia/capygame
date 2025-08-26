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
        this.playerWins = 0;
        this.opponentWins = 0;
        this.maxWins = 3; // Best of 5 (first to 3 wins)
        this.cheeseProjectiles = [];
        this.walls = [];
        this.currentRoomId = null;
        
        // Socket.IO connection
        this.socket = null;
        this.isConnected = false;
        
        // Simplified joystick control
        this.moveJoystick = { x: 0, y: 0, active: false };
        this.movementVector = { x: 0, y: 0 };
        this.facingVector = { x: 1, y: 0 }; // Direction player is facing for shooting
        
        // Auto shooting
        this.lastShotTime = 0;
        this.shootInterval = 1500; // 1.5 seconds - faster shooting
        
        // Powerups
        this.powerups = [];
        this.lastPowerupSpawn = 0;
        this.powerupSpawnInterval = 8000; // 8 seconds between spawns
        
        // Multi-touch support
        this.activeTouches = new Map();
        this.movementTouchId = null;
        this.throwTouchId = null;
        
        // Drag movement variables
        this.isDragging = false;
        this.isThrowing = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragCurrentX = 0;
        this.dragCurrentY = 0;
        this.throwStartX = 0;
        this.throwStartY = 0;
        this.throwCurrentX = 0;
        this.throwCurrentY = 0;
        this.throwVector = { x: 0, y: 0 };
        
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
    
    spawnPowerups() {
        const currentTime = Date.now();
        if (currentTime - this.lastPowerupSpawn < this.powerupSpawnInterval) return;
        if (this.powerups.length >= 4) return; // Max 4 powerups at once
        
        // Random chance to spawn powerup (30%)
        if (Math.random() > 0.3) return;
        
        const powerupTypes = ['medkit', 'shield', 'speed', 'rapidfire'];
        const existingTypes = this.powerups.map(p => p.type);
        
        // Limit each type to max 2
        const availableTypes = powerupTypes.filter(type => {
            return existingTypes.filter(t => t === type).length < 2;
        });
        
        if (availableTypes.length === 0) return;
        
        const randomType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
        const spawnPoint = this.getRandomSpawnPoint();
        
        this.powerups.push({
            type: randomType,
            x: spawnPoint.x,
            y: spawnPoint.y,
            width: 25,
            height: 25,
            life: 20000, // 20 seconds before disappearing
            spawnTime: currentTime
        });
        
        this.lastPowerupSpawn = currentTime;
    }
    
    getRandomSpawnPoint() {
        let attempts = 0;
        while (attempts < 10) {
            const x = Math.random() * (this.canvas.width - 50) + 25;
            const y = Math.random() * (this.canvas.height - 50) + 25;
            
            // Make sure it's not in a wall or too close to players
            if (!this.isPointInWall(x, y, 25, 25) && !this.isNearPlayers(x, y, 80)) {
                return { x, y };
            }
            attempts++;
        }
        // Fallback to center if no good spot found
        return { x: this.canvas.width / 2, y: this.canvas.height / 2 };
    }
    
    isNearPlayers(x, y, distance) {
        for (let player of this.players.values()) {
            const dx = player.x - x;
            const dy = player.y - y;
            if (Math.sqrt(dx * dx + dy * dy) < distance) {
                return true;
            }
        }
        return false;
    }
    
    updatePowerups() {
        const currentTime = Date.now();
        this.powerups = this.powerups.filter(powerup => {
            powerup.life -= 16; // Roughly 60fps
            return powerup.life > 0;
        });
    }
    
    checkPowerupCollisions() {
        if (!this.currentPlayer) return;
        
        this.powerups = this.powerups.filter(powerup => {
            // Check collision with current player
            if (powerup.x < this.currentPlayer.x + this.currentPlayer.width &&
                powerup.x + powerup.width > this.currentPlayer.x &&
                powerup.y < this.currentPlayer.y + this.currentPlayer.height &&
                powerup.y + powerup.height > this.currentPlayer.y) {
                
                this.applyPowerup(this.currentPlayer, powerup);
                return false; // Remove powerup
            }
            return true;
        });
    }
    
    applyPowerup(player, powerup) {
        switch (powerup.type) {
            case 'medkit':
                player.health = Math.min(player.health + 1, player.maxHealth);
                break;
            case 'shield':
                player.shieldTime = 5000; // 5 seconds
                player.hasShield = true;
                break;
            case 'speed':
                player.speedBoostTime = 8000; // 8 seconds
                player.originalSpeed = player.speed;
                player.speed = player.speed * 1.5;
                break;
            case 'rapidfire':
                player.rapidFireTime = 8000; // 8 seconds
                player.originalShootInterval = this.shootInterval;
                this.shootInterval = 500; // Much faster
                break;
        }
        this.updateHealthUI();
    }

    connectSocket() {
        // Detect environment and use appropriate server
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        
        let serverUrl;
        if (isLocal) {
            serverUrl = 'http://localhost:3000';
        } else if (window.location.hostname.includes('onrender.com')) {
            // Running on Render.com - use current domain
            serverUrl = window.location.origin;
        } else if (window.location.hostname.includes('railway.app')) {
            serverUrl = 'https://capygame-production.up.railway.app';
        } else {
            // Fallback to current domain for other hosts
            serverUrl = window.location.origin;
        }
        
        const socketPath = '/socket.io/';
        
        console.log('Connecting to:', serverUrl, 'with path:', socketPath);
        
        this.socket = io(serverUrl, {
            path: socketPath,
            transports: ['polling', 'websocket'],
            timeout: 30000,
            forceNew: true,
            upgrade: true,
            rememberUpgrade: false
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
            console.log('Joined room:', data.roomId, 'with players:', data.players);
            this.currentRoomId = data.roomId;
            document.getElementById('current-room-code').textContent = data.roomId;
            document.getElementById('room-info').style.display = 'block';
            
            // Add existing players in the room (except ourselves)
            if (data.players && data.players.length > 0) {
                console.log('Adding existing players:', data.players);
                data.players.forEach(playerData => {
                    console.log('Checking player:', playerData.id, 'vs my ID:', this.playerId);
                    if (playerData.id !== this.playerId) {
                        console.log('Adding remote player:', playerData.id);
                        this.addRemotePlayer(playerData);
                    }
                });
            }
            
            this.showGame();
            this.updateHealthUI();
        });

        this.socket.on('game_start', (data) => {
            console.log('Game starting with players:', data.players);
            
            // Initialize all players from server data
            if (data.players) {
                data.players.forEach(playerData => {
                    if (playerData.id !== this.playerId && !this.players.has(playerData.id)) {
                        this.addRemotePlayer(playerData);
                    }
                });
            }
            
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
        // Add both click and touchstart events for better mobile support
        this.addMobileButton('play-btn', () => this.showRoomSetup());
        this.addMobileButton('create-room-btn', () => this.createRoom());
        this.addMobileButton('create-custom-room-btn', () => this.createCustomRoom());
        this.addMobileButton('join-room-btn', () => this.joinRoom());
        this.addMobileButton('back-to-menu-btn', () => this.backToMenu());
        this.addMobileButton('play-again-btn', () => this.resetGame());
        this.addMobileButton('next-level-btn', () => this.nextLevel());
        
        // Fix mobile input fields
        this.setupMobileInputs();

        // Setup joystick controls
        this.setupJoystickControls();
        
        // Setup canvas mouse/touch events for drag controls
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));

        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    addMobileButton(buttonId, callback) {
        const button = document.getElementById(buttonId);
        if (!button) return;
        
        // Only apply touch handling to buttons, not inputs
        if (button.tagName === 'INPUT') return;
        
        // Prevent default touch behaviors
        button.style.touchAction = 'manipulation';
        
        // Add click event
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            callback();
        });
        
        // Add touch events for better mobile responsiveness
        button.addEventListener('touchstart', (e) => {
            e.preventDefault();
            button.style.transform = 'translateY(0px)';
            button.style.boxShadow = '0 3px 10px rgba(0, 0, 0, 0.2)';
        });
        
        button.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Reset button style
            button.style.transform = 'translateY(-2px)';
            button.style.boxShadow = '0 7px 20px rgba(0, 0, 0, 0.3)';
            
            // Execute callback after a small delay
            setTimeout(() => {
                callback();
            }, 100);
        });
        
        button.addEventListener('touchcancel', (e) => {
            button.style.transform = 'translateY(-2px)';
            button.style.boxShadow = '0 7px 20px rgba(0, 0, 0, 0.3)';
        });
    }
    
    setupMobileInputs() {
        const inputs = ['room-code-input', 'custom-room-input'];
        
        inputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (!input) return;
            
            // Enable text selection and input for these fields
            input.style.webkitUserSelect = 'text';
            input.style.userSelect = 'text';
            input.style.touchAction = 'manipulation';
            input.style.pointerEvents = 'auto';
            
            // Remove any blocking event handlers
            input.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                console.log('Input touched:', inputId);
            }, { passive: false });
            
            input.addEventListener('touchend', (e) => {
                e.stopPropagation();
                e.preventDefault();
                
                // Force focus and keyboard
                console.log('Forcing focus on:', inputId);
                input.focus();
                input.click();
                
                // Additional iOS fix
                setTimeout(() => {
                    input.focus();
                }, 100);
            }, { passive: false });
            
            input.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('Input clicked:', inputId);
                input.focus();
            });
            
            input.addEventListener('focus', (e) => {
                console.log('Input focused:', inputId);
                e.target.style.transform = 'scale(1.05)';
                e.target.style.borderColor = '#FF69B4';
            });
            
            input.addEventListener('blur', (e) => {
                e.target.style.transform = 'scale(1)';
                e.target.style.borderColor = '#FFB6C1';
            });
        });
    }

    setupJoystickControls() {
        const moveJoystick = document.getElementById('move-joystick');
        
        // Single move joystick - also sets facing direction
        this.setupJoystick(moveJoystick, (x, y) => {
            this.moveJoystick.x = x;
            this.moveJoystick.y = y;
            
            // Smoother movement with better responsiveness
            const sensitivity = 2.5;
            this.movementVector.x = x * sensitivity;
            this.movementVector.y = y * sensitivity;
            
            // Set facing direction for shooting (lower threshold)
            if (Math.abs(x) > 0.05 || Math.abs(y) > 0.05) {
                // Normalize for consistent facing direction
                const magnitude = Math.sqrt(x * x + y * y);
                if (magnitude > 0) {
                    this.facingVector.x = x / magnitude;
                    this.facingVector.y = y / magnitude;
                }
            }
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
            let normalizedX, normalizedY;
            
            if (distance <= maxDistance) {
                knob.style.left = `${centerX + x}px`;
                knob.style.top = `${centerY + y}px`;
                normalizedX = x / maxDistance;
                normalizedY = y / maxDistance;
            } else {
                const angle = Math.atan2(y, x);
                const limitedX = Math.cos(angle) * maxDistance;
                const limitedY = Math.sin(angle) * maxDistance;
                knob.style.left = `${centerX + limitedX}px`;
                knob.style.top = `${centerY + limitedY}px`;
                normalizedX = limitedX / maxDistance;
                normalizedY = limitedY / maxDistance;
            }
            
            // Apply deadzone for more precise control
            const deadzone = 0.1;
            const magnitude = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
            
            if (magnitude < deadzone) {
                onMove(0, 0);
            } else {
                // Scale to remove deadzone effect
                const scale = (magnitude - deadzone) / (1 - deadzone);
                onMove(
                    (normalizedX / magnitude) * scale,
                    (normalizedY / magnitude) * scale
                );
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
    
    createCustomRoom() {
        const roomId = document.getElementById('custom-room-input').value.trim().toUpperCase();
        if (roomId.length === 6) {
            this.joinRoomById(roomId);
        } else {
            alert('Please enter exactly 6 characters for the room code');
        }
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
        this.currentRoomId = null;
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
            speed: 2,
            facing: 'right',
            throwCooldown: 0,
            isLocal: true,
            // Powerup effects
            shieldTime: 0,
            hasShield: false,
            speedBoostTime: 0,
            rapidFireTime: 0,
            originalSpeed: 2
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
            speed: 2,
            facing: playerData.facing,
            throwCooldown: 0,
            isLocal: false,
            // Powerup effects
            shieldTime: 0,
            hasShield: false,
            speedBoostTime: 0,
            rapidFireTime: 0,
            originalSpeed: 2
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
            
            // Update powerup timers
            if (player.shieldTime > 0) {
                player.shieldTime -= 16;
                if (player.shieldTime <= 0) {
                    player.hasShield = false;
                }
            }
            
            if (player.speedBoostTime > 0) {
                player.speedBoostTime -= 16;
                if (player.speedBoostTime <= 0) {
                    player.speed = player.originalSpeed;
                }
            }
            
            if (player.rapidFireTime > 0) {
                player.rapidFireTime -= 16;
                if (player.rapidFireTime <= 0) {
                    this.shootInterval = player.originalShootInterval || 1500;
                }
            }
        });
        
        this.updateCurrentPlayer();
        this.handleAutoShooting();
        this.updateProjectiles();
        this.updatePowerups();
        this.spawnPowerups();
        this.checkCollisions();
        this.checkPowerupCollisions();
        this.checkGameEnd();
    }
    
    handleAutoShooting() {
        if (!this.currentPlayer || this.gameState !== 'playing') return;
        
        const currentTime = Date.now();
        if (currentTime - this.lastShotTime >= this.shootInterval) {
            // Auto shoot if player is moving or has a facing direction
            if (Math.abs(this.movementVector.x) > 0.1 || Math.abs(this.movementVector.y) > 0.1 ||
                Math.abs(this.facingVector.x) > 0.1 || Math.abs(this.facingVector.y) > 0.1) {
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
            dx: this.facingVector.x,
            dy: this.facingVector.y,
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
        // Check if player has shield
        if (player.hasShield && player.shieldTime > 0) {
            return; // Shield blocks damage
        }
        
        player.health--;
        this.updateHealthUI();
        
        if (player.health <= 0) {
            this.endRound(player);
        }
    }

    updateHealthUI() {
        const playersArray = Array.from(this.players.values());
        
        // Current player health - BROWN (matches brown capybara)
        if (this.currentPlayer) {
            const p1Health = document.getElementById('p1-health');
            p1Health.style.width = (this.currentPlayer.health / this.currentPlayer.maxHealth * 100) + '%';
            p1Health.style.background = 'linear-gradient(90deg, #8B4513, #D2691E)'; // Brown gradient
            document.getElementById('p1-hp').textContent = `YOU: ${this.currentPlayer.health}/${this.currentPlayer.maxHealth}`;
        }
        
        // Other player health - YELLOW (matches yellow capybara)
        const otherPlayer = playersArray.find(p => p.id !== this.playerId);
        if (otherPlayer) {
            const p2Health = document.getElementById('p2-health');
            p2Health.style.width = (otherPlayer.health / otherPlayer.maxHealth * 100) + '%';
            p2Health.style.background = 'linear-gradient(90deg, #FFD700, #FFFF99)'; // Yellow gradient
            document.getElementById('p2-hp').textContent = `THEM: ${otherPlayer.health}/${otherPlayer.maxHealth}`;
        } else {
            document.getElementById('p2-health').style.width = '0%';
            document.getElementById('p2-hp').textContent = 'THEM: 0/10';
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
        if (this.currentRoomId) {
            this.socket.emit('join_room', {
                roomId: this.currentRoomId,
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
        
        this.powerups.forEach(powerup => {
            this.drawPowerup(powerup);
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
        
        // Different colored capybaras - complete body color change
        let bodyColor, bellyColor;
        if (player.id === this.playerId) {
            // You are BROWN capybara
            bodyColor = '#8B4513';  // Saddle brown
            bellyColor = '#D2691E'; // Chocolate brown - lighter
        } else {
            // Opponent is YELLOW capybara  
            bodyColor = '#FFD700';  // Gold
            bellyColor = '#FFFF99'; // Light yellow
        }
        
        // Draw main body
        this.ctx.fillStyle = bodyColor;
        
        this.ctx.fillRect(player.x, player.y, player.width, player.height);
        
        // Draw belly with lighter color
        this.ctx.fillStyle = bellyColor;
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
        
        // Shield effect
        if (player.hasShield && player.shieldTime > 0) {
            this.ctx.strokeStyle = 'rgba(0, 128, 255, 0.8)';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.arc(player.x + player.width/2, player.y + player.height/2, player.width/2 + 10, 0, Math.PI * 2);
            this.ctx.stroke();
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
    
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }
    
    drawPowerup(powerup) {
        this.ctx.save();
        
        // Pulsing effect
        const pulse = Math.sin(Date.now() * 0.01) * 0.1 + 0.9;
        this.ctx.globalAlpha = pulse;
        
        // Draw based on type
        switch (powerup.type) {
            case 'medkit':
                // Red cross
                this.ctx.fillStyle = '#FF0000';
                this.ctx.fillRect(powerup.x, powerup.y, powerup.width, powerup.height);
                this.ctx.fillStyle = '#FFFFFF';
                this.ctx.fillRect(powerup.x + 8, powerup.y + 5, 9, 15);
                this.ctx.fillRect(powerup.x + 5, powerup.y + 8, 15, 9);
                break;
            case 'shield':
                // Blue shield
                this.ctx.fillStyle = '#0080FF';
                this.ctx.beginPath();
                this.ctx.moveTo(powerup.x + 12, powerup.y);
                this.ctx.lineTo(powerup.x + 25, powerup.y + 8);
                this.ctx.lineTo(powerup.x + 20, powerup.y + 25);
                this.ctx.lineTo(powerup.x + 5, powerup.y + 25);
                this.ctx.lineTo(powerup.x, powerup.y + 8);
                this.ctx.closePath();
                this.ctx.fill();
                break;
            case 'speed':
                // Green lightning bolt
                this.ctx.fillStyle = '#00FF00';
                this.ctx.beginPath();
                this.ctx.moveTo(powerup.x + 12, powerup.y);
                this.ctx.lineTo(powerup.x + 18, powerup.y + 10);
                this.ctx.lineTo(powerup.x + 15, powerup.y + 12);
                this.ctx.lineTo(powerup.x + 20, powerup.y + 25);
                this.ctx.lineTo(powerup.x + 10, powerup.y + 15);
                this.ctx.lineTo(powerup.x + 13, powerup.y + 13);
                this.ctx.lineTo(powerup.x + 8, powerup.y);
                this.ctx.closePath();
                this.ctx.fill();
                break;
            case 'rapidfire':
                // Orange/yellow bullets
                this.ctx.fillStyle = '#FF8000';
                this.ctx.fillRect(powerup.x, powerup.y, powerup.width, powerup.height);
                this.ctx.fillStyle = '#FFD700';
                for (let i = 0; i < 3; i++) {
                    this.ctx.beginPath();
                    this.ctx.arc(powerup.x + 6 + i * 6, powerup.y + 12, 3, 0, Math.PI * 2);
                    this.ctx.fill();
                }
                break;
        }
        
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