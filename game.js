    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreEl = document.getElementById('score');

    let score = 0;
    let gameState = 'START'; // START, PLAYING, GAME_OVER, LEVEL_CLEAR, BOSS_FIGHT, GAME_WON

    const images = {};
    const imageSources = {
        player: 'assets/vitinho.png',
        enemy: 'assets/pdiddy.png',
        powerUp: 'assets/estrela.png', // Fallback
        health: 'assets/gin.webp',
        spear: 'assets/lanca.webp',
        ice: 'assets/ice.png',
        invincibility: 'assets/novinha.webp'
    };

    function loadImages(sources, callback) {
        let loadedCount = 0;
        let numImages = Object.keys(sources).length;
        if (numImages === 0) {
            callback();
            return;
        }
        const onAssetLoad = () => {
            if (++loadedCount >= numImages) {
                callback();
            }
        };
        for (let src in sources) {
            images[src] = new Image();
            images[src].onload = onAssetLoad;
            images[src].onerror = (err) => {
                console.error(`Failed to load image '${src}' at path: ${sources[src]}`);
                console.error(err); // Log the actual error event
                images[src].loadFailed = true; // Mark this image as failed
                onAssetLoad(); // Still count it as 'loaded' to not hang the game
            };
            images[src].src = sources[src];
        }
    }

    const player = {
        x: canvas.width / 2 - 25,
        y: canvas.height - 60,
        width: 50,
        height: 50,
        speed: 5,
        baseSpeed: 5,
        health: 100,
        maxHealth: 100,
        image: null,
        color: '#7df9ff',
        isAttacking: false,
        attackCooldown: false,
        attackBox: { width: 60, height: 60 },
        lastDirection: 'up',
        isInvincible: false,
        hasSpear: false
    };

    let enemies = [];
    let powerUps = [];
    let currentLevelIndex = 0;

    const boss = {
        x: canvas.width / 2 - 50,
        y: 50,
        width: 100,
        height: 100,
        speed: 2,
        health: 500,
        maxHealth: 500,
        image: null,
        color: '#c300ff',
        direction: 1
    };

    const keys = { right: false, left: false, up: false, down: false };

    document.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (['arrowright', 'd'].includes(key)) { keys.right = true; player.lastDirection = 'right'; }
        if (['arrowleft', 'a'].includes(key)) { keys.left = true; player.lastDirection = 'left'; }
        if (['arrowup', 'w'].includes(key)) { keys.up = true; player.lastDirection = 'up'; }
        if (['arrowdown', 's'].includes(key)) { keys.down = true; player.lastDirection = 'down'; }
        if (key === ' ' && (gameState === 'PLAYING' || gameState === 'BOSS_FIGHT')) attack();
        if (key === 'enter') {
            if (gameState === 'START' || gameState === 'GAME_OVER' || gameState === 'GAME_WON') restartGame();
            else if (gameState === 'LEVEL_CLEAR') startBossFight();
        }
    });

    document.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        if (['arrowright', 'd'].includes(key)) keys.right = false;
        if (['arrowleft', 'a'].includes(key)) keys.left = false;
        if (['arrowup', 'w'].includes(key)) keys.up = false;
        if (['arrowdown', 's'].includes(key)) keys.down = false;
    });

    function createEnemy(x, y) {
        return { 
            x, y, 
            width: 50, height: 50, 
            image: images.enemy, color: 'red', 
            health: 80, maxHealth: 80, speed: 1.5, 
            isFrozen: false
        };
    }

    function createPowerUp(x, y, type = 'score') { // type: 'score', 'health', 'spear', 'invincibility', 'ice'
        return { x, y, width: 30, height: 30, image: images[type] || images.powerUp, color: 'gold', type };
    }

    const levels = [
        { // Level 1
            enemies: [
                createEnemy(100, 100), createEnemy(canvas.width - 150, 100),
                createEnemy(100, 250), createEnemy(canvas.width - 150, 250)
            ],
            powerUps: [
                createPowerUp(canvas.width / 2 - 15, 300, 'health'), // Gin!
                createPowerUp(100, 400, 'spear')
            ]
        },
        { // Level 2
            enemies: [
                createEnemy(100, 100), createEnemy(canvas.width - 150, 100),
                createEnemy(100, 250), createEnemy(canvas.width - 150, 250),
                createEnemy(50, 400), createEnemy(canvas.width - 100, 400),
                createEnemy(canvas.width / 2 - 25, 150)
            ],
            powerUps: [
                createPowerUp(canvas.width / 2 - 15, 500, 'health'),
                createPowerUp(canvas.width - 100, 200, 'invincibility'),
                createPowerUp(100, 500, 'ice')
            ]
        }
    ];

    function loadLevel(levelIndex) {
        if (levelIndex >= levels.length) {
            gameState = 'LEVEL_CLEAR'; // All levels cleared, proceed to boss
            return;
        }
        const level = levels[levelIndex];
        enemies = [...level.enemies.map(e => ({...e}))]; // Deep copy to reset state
        powerUps = [...level.powerUps.map(p => ({...p}))];
    }

    function updatePlayerPosition() {
        if (keys.right && player.x < canvas.width - player.width) player.x += player.speed;
        if (keys.left && player.x > 0) player.x -= player.speed;
        if (keys.up && player.y > 0) player.y -= player.speed;
        if (keys.down && player.y < canvas.height - player.height) player.y += player.speed;
    }

    function updateEnemies() {
        enemies.forEach(enemy => {
            if (enemy.isFrozen) return; // Skip movement if frozen

            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance > 1) { // Avoid division by zero and jittering
                const moveX = (dx / distance) * enemy.speed;
                const moveY = (dy / distance) * enemy.speed;
                enemy.x += moveX;
                enemy.y += moveY;
            }
        });
    }

    function updateBoss() {
        if (gameState !== 'BOSS_FIGHT') return;
        boss.x += boss.speed * boss.direction;
        if (boss.x <= 0 || boss.x + boss.width >= canvas.width) boss.direction *= -1;
    }

    function attack() {
        if (player.attackCooldown) return;
        player.isAttacking = true;
        player.attackCooldown = true;
        setTimeout(() => { player.isAttacking = false; }, 200);
        setTimeout(() => { player.attackCooldown = false; }, 500);
    }

    function checkCollisions() {
        if (player.isAttacking) {
            const hitbox = getAttackHitbox();
            enemies.forEach((enemy, index) => {
                if (hitbox.x < enemy.x + enemy.width && hitbox.x + hitbox.width > enemy.x && hitbox.y < enemy.y + enemy.height && hitbox.y + hitbox.height > enemy.y) {
                    enemy.health -= 50; // Player attack damage
                    if (enemy.health <= 0) {
                        enemies.splice(index, 1);
                        score += 10;
                        scoreEl.innerText = score;
                    }
                }
            });
            if (gameState === 'BOSS_FIGHT' && hitbox.x < boss.x + boss.width && hitbox.x + hitbox.width > boss.x && hitbox.y < boss.y + boss.height && hitbox.y + hitbox.height > boss.y) {
                boss.health -= 20;
                if (boss.health <= 0) gameState = 'GAME_WON';
            }
        }
        // Player collision with enemies
        // Player collision with enemies
        enemies.forEach(enemy => {
            if (!player.isInvincible && player.x < enemy.x + enemy.width && player.x + player.width > enemy.x && player.y < enemy.y + enemy.height && player.y + player.height > enemy.y) {
                player.health -= 20;
                if (player.health <= 0) gameState = 'GAME_OVER';
            }
        });

        // Player collision with power-ups
        powerUps.forEach((powerUp, index) => {
            if (player.x < powerUp.x + powerUp.width && player.x + player.width > powerUp.x && player.y < powerUp.y + powerUp.height && player.y + player.height > powerUp.y) {
                switch (powerUp.type) {
                    case 'health':
                        player.health = Math.min(player.maxHealth, player.health + 50);
                        break;
                    case 'spear':
                        player.hasSpear = true;
                        setTimeout(() => { player.hasSpear = false; }, 10000); // 10 seconds
                        break;
                    case 'invincibility':
                        player.isInvincible = true;
                        setTimeout(() => { player.isInvincible = false; }, 10000); // 10 seconds
                        break;
                    case 'ice':
                        enemies.forEach(enemy => {
                            enemy.isFrozen = true;
                            setTimeout(() => { enemy.isFrozen = false; }, 5000); // 5 seconds
                        });
                        break;
                    default:
                        score += 20;
                        scoreEl.innerText = score;
                        break;
                }
                powerUps.splice(index, 1); // Remove power-up after collection
            }
        });
        if (gameState === 'BOSS_FIGHT' && player.x < boss.x + boss.width && player.x + player.width > boss.x && player.y < boss.y + boss.height && player.y + player.height > boss.y) {
            player.health -= 40;
            if (player.health <= 0) gameState = 'GAME_OVER';
        }
    }

    function checkWinCondition() {
        if (gameState === 'PLAYING' && enemies.length === 0) {
            currentLevelIndex++;
            if (currentLevelIndex >= levels.length) {
                gameState = 'LEVEL_CLEAR'; // All levels done, time for boss
            } else {
                loadLevel(currentLevelIndex);
            }
        }
    }

    function drawPlayer() {
        if (player.isInvincible && Math.floor(Date.now() / 200) % 2) {
            // Don't draw to create a blinking effect
        } else {
            ctx.drawImage(images.player, player.x, player.y, player.width, player.height);
        }

        if (player.isAttacking) {
            const hitbox = getAttackHitbox();
            ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
            ctx.fillRect(hitbox.x, hitbox.y, hitbox.width, hitbox.height);
        }
    }

    function drawEntities(entities, drawHealthBarFunc) {
        entities.forEach(e => {
            if (e.isFrozen) {
                ctx.filter = 'saturate(0%) brightness(1.5) contrast(200%)'; // Blue-ish tint
            }

            if (e.image && e.image.complete && e.image.naturalHeight !== 0 && !e.image.loadFailed) {
                ctx.drawImage(e.image, e.x, e.y, e.width, e.height);
            } else {
                // Fallback drawing for failed or missing images
                ctx.fillStyle = 'red';
                ctx.fillRect(e.x, e.y, e.width, e.height);
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(e.x, e.y);
                ctx.lineTo(e.x + e.width, e.y + e.height);
                ctx.moveTo(e.x + e.width, e.y);
                ctx.lineTo(e.x, e.y + e.height);
                ctx.stroke();
            }

            ctx.filter = 'none'; // Reset filter
            if (drawHealthBarFunc) {
                drawHealthBarFunc(e);
            }
        });
    }

    function drawScreen(title, subtitle) {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.font = "40px 'Press Start 2P'";
        ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 40);
        ctx.font = "20px 'Press Start 2P'";
        ctx.fillText(subtitle, canvas.width / 2, canvas.height / 2 + 20);
    }

    function drawHealthBar(x, y, width, height, current, max, color) {
        ctx.fillStyle = '#4d0f0f';
        ctx.fillRect(x, y, width, height);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, width * (current / max), height);
        ctx.strokeStyle = '#e0e0e0';
        ctx.strokeRect(x, y, width, height);
    }

    function getAttackHitbox() {
        const { x, y, width, height, attackBox, lastDirection, hasSpear } = player;
        const spearBonus = hasSpear ? 60 : 0; // 60 extra pixels of range

        switch (lastDirection) {
            case 'up': 
                return { x: x + width / 2 - attackBox.width / 2, y: y - attackBox.height - spearBonus, width: attackBox.width, height: attackBox.height + spearBonus };
            case 'down': 
                return { x: x + width / 2 - attackBox.width / 2, y: y + height, width: attackBox.width, height: attackBox.height + spearBonus };
            case 'left': 
                return { x: x - attackBox.width - spearBonus, y: y + height / 2 - attackBox.height / 2, width: attackBox.width + spearBonus, height: attackBox.height };
            case 'right': 
                return { x: x + width, y: y + height / 2 - attackBox.height / 2, width: attackBox.width + spearBonus, height: attackBox.height };
        }
    }

    function restartGame() {
        const music = document.getElementById('bg-music');
        if (music) {
            music.play().catch(e => console.error("Music autoplay failed. User interaction needed."));
        }
        gameState = 'PLAYING';
        score = 0;
        scoreEl.innerText = score;
        player.x = canvas.width / 2 - 25;
        player.y = canvas.height - 60;
        player.health = player.maxHealth;
        currentLevelIndex = 0;
        loadLevel(currentLevelIndex);
    }

    function startBossFight() {
        gameState = 'BOSS_FIGHT';
        boss.health = boss.maxHealth;
        boss.x = canvas.width / 2 - boss.width / 2;
    }

    function gameLoop() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        switch (gameState) {
            case 'START':
                drawScreen('VITINHO\'S SOULS', 'Pressione Enter para Começar');
                break;
            case 'GAME_OVER':
                drawScreen('GAME OVER', 'Pressione Enter para reiniciar');
                break;
            case 'LEVEL_CLEAR':
                drawScreen('FASE CONCLUÍDA', 'Pressione Enter para o chefe');
                break;
            case 'GAME_WON':
                drawScreen('VOCÊ VENCEU!', 'Pressione Enter para reiniciar');
                break;
            case 'PLAYING':
            case 'BOSS_FIGHT':
                updatePlayerPosition();
                if (gameState === 'PLAYING') updateEnemies();
                updateBoss();
                checkCollisions();
                checkWinCondition();
                drawEntities(enemies, (enemy) => {
                    drawHealthBar(enemy.x, enemy.y - 10, enemy.width, 5, enemy.health, enemy.maxHealth, '#90ee90');
                });
                drawEntities(powerUps); // Draw power-ups
                if (gameState === 'BOSS_FIGHT') drawEntities([boss]);
                drawPlayer();
                drawHealthBar(10, 10, 200, 20, player.health, player.maxHealth, '#ff0000');
                if (gameState === 'BOSS_FIGHT') drawHealthBar(canvas.width / 2 - 150, 15, 300, 25, boss.health, boss.maxHealth, '#c300ff');
                break;
        }
        requestAnimationFrame(gameLoop);
    }

    loadImages(imageSources, () => {
        player.image = images.player;
        boss.image = images.enemy;
        gameLoop();
    });
