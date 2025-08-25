class CapybaraGame {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.gameState = 'menu';
        this.players = new Map();
        this.playerId = Math.random().toString(36).substr(2, 9);
        this.currentPlayer = null;
        this.keys = {};
        this.mobileControls = {};
        this.lobby = null;
        this.gameStarted = false;
        this.currentLevel = 1;
        this.maxLevel = 5;
        this.cheeseProjectiles = [];
        this.walls = [];
        
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
        this.setupMobileControls();
        this.gameLoop();
    }

    setupEventListeners() {
        document.getElementById('play-btn').addEventListener('click', () => this.startGame());
        document.getElementById('play-again-btn').addEventListener('click', () => this.resetGame());
        document.getElementById('next-level-btn').addEventListener('click', () => this.nextLevel());

        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        window.addEventListener('resize', () => this.resizeCanvas());
        this.resizeCanvas();
    }

    setupMobileControls() {
        const controls = ['move-left', 'move-right', 'move-up', 'move-down', 'throw-btn'];
        
        controls.forEach(control => {
            const btn = document.getElementById(control);
            
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.mobileControls[control] = true;
            });
            
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.mobileControls[control] = false;
            });
            
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.mobileControls[control] = true;
            });
            
            btn.addEventListener('mouseup', (e) => {
                e.preventDefault();
                this.mobileControls[control] = false;
            });
        });
    }

    resizeCanvas() {
        const container = document.getElementById('game-container');
        const maxWidth = Math.min(800, window.innerWidth - 40);
        const maxHeight = Math.min(600, window.innerHeight - 200);
        
        this.canvas.style.width = maxWidth + 'px';
        this.canvas.style.height = maxHeight + 'px';
    }

    startGame() {
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('game-container').style.display = 'flex';
        this.gameState = 'waiting';
        this.currentLevel = 1;
        
        this.loadLevel();
        this.createPlayer();
        this.joinLobby();
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
            throwCooldown: 0
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

    joinLobby() {
        if (!this.lobby) {
            this.lobby = {
                players: new Map(),
                capacity: 2,
                gameStarted: false
            };
        }
        
        if (this.lobby.players.size >= this.lobby.capacity) {
            document.getElementById('lobby-full-message').style.display = 'block';
            document.getElementById('waiting-message').style.display = 'none';
            
            setTimeout(() => {
                this.checkLobbySpace();
            }, 1000);
            return;
        }
        
        this.lobby.players.set(this.playerId, this.currentPlayer);
        this.cheeseProjectiles = [];
        
        setTimeout(() => {
            if (this.lobby.players.size < 2) {
                this.createBotPlayer();
            }
            this.startGamePlay();
        }, 2000);
        
        document.getElementById('waiting-message').style.display = 'block';
        document.getElementById('lobby-full-message').style.display = 'none';
    }

    checkLobbySpace() {
        if (this.lobby && this.lobby.players.size < this.lobby.capacity) {
            this.joinLobby();
        } else {
            setTimeout(() => {
                this.checkLobbySpace();
            }, 1000);
        }
    }

    createBotPlayer() {
        const botId = 'bot_player';
        const spawnPoints = this.getSpawnPoints();
        
        const botPlayer = {
            id: botId,
            x: spawnPoints[1].x,
            y: spawnPoints[1].y,
            width: 50,
            height: 50,
            health: 10,
            maxHealth: 10,
            speed: 2,
            facing: 'left',
            throwCooldown: 0,
            isBot: true,
            botTimer: 0,
            botTargetX: spawnPoints[1].x,
            botTargetY: spawnPoints[1].y
        };
        
        this.lobby.players.set(botId, botPlayer);
        this.players.set(botId, botPlayer);
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
        this.updateBotPlayers();
        this.updateProjectiles();
        this.checkCollisions();
        this.checkGameEnd();
    }

    updateCurrentPlayer() {
        if (!this.currentPlayer) return;
        
        const player = this.currentPlayer;
        let newX = player.x;
        let newY = player.y;
        
        if (this.keys['KeyA'] || this.keys['ArrowLeft'] || this.mobileControls['move-left']) {
            newX = Math.max(0, player.x - player.speed);
            player.facing = 'left';
        }
        if (this.keys['KeyD'] || this.keys['ArrowRight'] || this.mobileControls['move-right']) {
            newX = Math.min(this.canvas.width - player.width, player.x + player.speed);
            player.facing = 'right';
        }
        if (this.keys['KeyW'] || this.keys['ArrowUp'] || this.mobileControls['move-up']) {
            newY = Math.max(0, player.y - player.speed);
        }
        if (this.keys['KeyS'] || this.keys['ArrowDown'] || this.mobileControls['move-down']) {
            newY = Math.min(this.canvas.height - player.height, player.y + player.speed);
        }
        
        if (!this.isPointInWall(newX, player.y, player.width, player.height)) {
            player.x = newX;
        }
        if (!this.isPointInWall(player.x, newY, player.width, player.height)) {
            player.y = newY;
        }
        
        if ((this.keys['Space'] || this.mobileControls['throw-btn']) && player.throwCooldown <= 0) {
            this.throwCheese(player);
        }
    }

    updateBotPlayers() {
        this.players.forEach(player => {
            if (!player.isBot) return;
            
            player.botTimer++;
            
            const target = this.currentPlayer;
            if (!target) return;
            
            const dx = target.x - player.x;
            const dy = target.y - player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (player.botTimer % 60 === 0) {
                const hidingSpots = this.findHidingSpots();
                if (hidingSpots.length > 0 && Math.random() < 0.3) {
                    const spot = hidingSpots[Math.floor(Math.random() * hidingSpots.length)];
                    player.botTargetX = spot.x;
                    player.botTargetY = spot.y;
                } else {
                    player.botTargetX = target.x + (Math.random() - 0.5) * 200;
                    player.botTargetY = target.y + (Math.random() - 0.5) * 200;
                }
            }
            
            const targetDx = player.botTargetX - player.x;
            const targetDy = player.botTargetY - player.y;
            
            let newX = player.x;
            let newY = player.y;
            
            if (Math.abs(targetDx) > 5) {
                if (targetDx > 0) {
                    newX += player.speed;
                    player.facing = 'right';
                } else {
                    newX -= player.speed;
                    player.facing = 'left';
                }
            }
            
            if (Math.abs(targetDy) > 5) {
                if (targetDy > 0) {
                    newY += player.speed;
                } else {
                    newY -= player.speed;
                }
            }
            
            if (!this.isPointInWall(newX, player.y, player.width, player.height)) {
                player.x = Math.max(0, Math.min(this.canvas.width - player.width, newX));
            }
            if (!this.isPointInWall(player.x, newY, player.width, player.height)) {
                player.y = Math.max(0, Math.min(this.canvas.height - player.height, newY));
            }
            
            if (distance < 200 && player.throwCooldown <= 0 && Math.random() < 0.02) {
                this.throwCheese(player);
            }
        });
    }

    findHidingSpots() {
        const spots = [];
        this.walls.forEach(wall => {
            spots.push(
                { x: wall.x - 60, y: wall.y },
                { x: wall.x + wall.width + 10, y: wall.y },
                { x: wall.x, y: wall.y - 60 },
                { x: wall.x, y: wall.y + wall.height + 10 }
            );
        });
        
        return spots.filter(spot => 
            spot.x >= 0 && spot.x <= this.canvas.width - 50 &&
            spot.y >= 0 && spot.y <= this.canvas.height - 50 &&
            !this.isPointInWall(spot.x, spot.y, 50, 50)
        );
    }

    throwCheese(player) {
        player.throwCooldown = 45;
        
        const cheese = {
            x: player.x + player.width / 2,
            y: player.y + player.height / 2,
            width: 12,
            height: 12,
            speed: 6,
            dx: player.facing === 'right' ? 1 : -1,
            dy: 0,
            owner: player.id,
            life: 120
        };
        
        this.cheeseProjectiles.push(cheese);
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
        
        if (playersArray.length >= 1) {
            const p1 = playersArray[0];
            document.getElementById('p1-health').style.width = (p1.health / p1.maxHealth * 100) + '%';
            document.getElementById('p1-hp').textContent = `${p1.health}/${p1.maxHealth}`;
        }
        
        if (playersArray.length >= 2) {
            const p2 = playersArray[1];
            document.getElementById('p2-health').style.width = (p2.health / p2.maxHealth * 100) + '%';
            document.getElementById('p2-hp').textContent = `${p2.health}/${p2.maxHealth}`;
        }
    }

    checkGameEnd() {
        const alivePlayers = Array.from(this.players.values()).filter(p => p.health > 0);
        
        if (alivePlayers.length <= 1 && this.gameStarted) {
            this.endRound(alivePlayers.length > 0 ? null : alivePlayers[0]);
        }
    }

    endRound(loser) {
        this.gameState = 'roundOver';
        this.gameStarted = false;
        
        const winner = Array.from(this.players.values()).find(p => p.health > 0);
        
        if (winner && !winner.isBot) {
            if (this.currentLevel < this.maxLevel) {
                document.getElementById('level-complete-text').textContent = 
                    `Level ${this.currentLevel} Complete!`;
                document.getElementById('level-complete').style.display = 'block';
            } else {
                document.getElementById('winner-text').textContent = "You won all levels! fantso!";
                document.getElementById('game-over').style.display = 'block';
            }
        } else {
            document.getElementById('winner-text').textContent = "fantso won!";
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
        this.lobby = null;
        this.cheeseProjectiles = [];
        
        this.loadLevel();
        this.createPlayer();
        this.joinLobby();
    }

    resetGame() {
        this.gameState = 'menu';
        this.players.clear();
        this.currentPlayer = null;
        this.lobby = null;
        this.gameStarted = false;
        this.currentLevel = 1;
        this.cheeseProjectiles = [];
        
        document.getElementById('game-over').style.display = 'none';
        document.getElementById('level-complete').style.display = 'none';
        document.getElementById('game-container').style.display = 'none';
        document.getElementById('main-menu').style.display = 'block';
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
        
        this.ctx.fillStyle = '#D2691E';
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