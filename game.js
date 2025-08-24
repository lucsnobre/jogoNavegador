const canvas = document.getElementById('gameCanvas');
const startOverlay = document.getElementById('start-overlay');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');

let score = 0;
let gameState = 'BACKSTORY'; // BACKSTORY, START, PLAYING, GAME_OVER, LEVEL_CLEAR, BOSS_FIGHT, GAME_WON

const images = {};
const imageSources = {
    back1: 'assets/back1.png',
    back2: 'assets/back2.png',
    back3: 'assets/back3.png',
    player: 'assets/vitinho.png',
    enemy: 'assets/pdiddy.png',
    health: 'assets/gin.webp',
    spear: 'assets/lanca.webp',
    ice: 'assets/ice.png',
    invincibility: 'assets/novinha.webp'
};

const keys = {
    right: false,
    left: false,
    up: false,
    down: false
};

const player = {
    x: canvas.width / 2 - 25,
    y: canvas.height - 60,
    width: 50,
    height: 50,
    speed: 5,
    baseSpeed: 5,
    health: 150,
    maxHealth: 150,
    image: null,
    isAttacking: false,
    attackCooldown: false,
    attackBox: { width: 60, height: 60 },
    lastDirection: 'up',
    isInvincible: false,
    hasSpear: false
};

let enemies = [];
let powerUps = [];
let obstacles = [];
let bombs = [];
let currentLevelIndex = 0;
let lastBombTime = 0;
const BOMB_FUSE_MS = 1500;
const BOMB_EXPLOSION_MS = 400;
const BOMB_COOLDOWN_MS = 1500;
const BOMB_EXPLOSION_RADIUS = 80;

const boss = {
    x: canvas.width / 2 - 50,
    y: 50,
    width: 100,
    height: 100,
    speed: 2,
    health: 500,
    maxHealth: 500,
    image: null,
    direction: 1
};

// Backstory control variables
const backstorySlides = ['back1', 'back2', 'back3'];
let backstoryIndex = 0;
let lastSlideChange = Date.now();
const backstoryCaptions = [
    'Entre as cinzas da sua casa, nasceu a chama da vingança.',
    'Cada salto, cada queda, era um passo para se tornar a arma contra o impossível.',
    'Diante do gigante, Vitinho não era só um guerreiro... era a fúria de toda uma história.'
];

function createEnemy(x, y) {
    return { 
        x, y, 
        width: 50, height: 50, 
        image: images.enemy, 
        health: 80, maxHealth: 80, speed: 1.5, 
        isFrozen: false
    };
}

function createPowerUp(x, y, type = 'score') { // type: 'score', 'health', 'spear', 'invincibility', 'ice'
    return { x, y, width: 30, height: 30, image: images[type] || null, type };
}

const levels = [
    { // Level 1
        enemies: [
            createEnemy(100, 100), createEnemy(canvas.width - 150, 100),
            createEnemy(100, 250), createEnemy(canvas.width - 150, 250)
        ],
        powerUps: [
            createPowerUp(canvas.width / 2 - 15, 300, 'health'),
            createPowerUp(100, 400, 'spear')
        ],
        obstacles: [
            { x: 300, y: 180, width: 200, height: 20 },
            { x: 150, y: 350, width: 500, height: 20 }
        ]
    },
    { // Level 2
        enemies: [
            createEnemy(80, 80), createEnemy(canvas.width - 130, 80),
            createEnemy(80, 240), createEnemy(canvas.width - 130, 240),
            createEnemy(50, 400), createEnemy(canvas.width - 100, 400),
            createEnemy(canvas.width / 2 - 25, 150)
        ],
        powerUps: [
            createPowerUp(canvas.width / 2 - 15, 500, 'health'),
            createPowerUp(canvas.width - 100, 200, 'invincibility'),
            createPowerUp(100, 500, 'ice')
        ],
        obstacles: [
            { x: 0, y: 280, width: 250, height: 20 },
            { x: 550, y: 280, width: 250, height: 20 },
            { x: 380, y: 120, width: 40, height: 360 }
        ]
    },
    { // Level 3
        enemies: [
            createEnemy(150, 150), createEnemy(600, 120),
            createEnemy(150, 420), createEnemy(620, 420),
            createEnemy(380, 250)
        ],
        powerUps: [
            createPowerUp(50, 520, 'health'),
            createPowerUp(700, 80, 'ice')
        ],
        obstacles: [
            { x: 200, y: 100, width: 400, height: 20 },
            { x: 200, y: 480, width: 400, height: 20 },
            { x: 100, y: 220, width: 20, height: 200 },
            { x: 680, y: 220, width: 20, height: 200 }
        ]
    },
    { // Level 4
        enemies: [
            createEnemy(120, 120), createEnemy(680, 120),
            createEnemy(120, 460), createEnemy(680, 460),
            createEnemy(380, 300)
        ],
        powerUps: [
            createPowerUp(canvas.width / 2 - 15, 300, 'invincibility'),
            createPowerUp(60, 60, 'health')
        ],
        obstacles: [
            { x: 260, y: 220, width: 280, height: 20 },
            { x: 260, y: 360, width: 280, height: 20 },
            { x: 120, y: 160, width: 20, height: 320 },
            { x: 660, y: 160, width: 20, height: 320 }
        ]
    }
];

function loadLevel(levelIndex) {
    if (levelIndex >= levels.length) {
        gameState = 'LEVEL_CLEAR';
        return;
    }
    const level = levels[levelIndex];
    enemies = level.enemies.map(e => ({ ...e, image: images.enemy }));
    powerUps = level.powerUps.map(p => ({ ...p, image: images[p.type] }));
    obstacles = (level.obstacles || []).map(o => ({ ...o }));
    // Ensure player isn't stuck inside a new level's obstacle layout
    if (collidesWithObstacles(player.x, player.y, player.width, player.height)) {
        ensurePlayerSafeSpawn();
    }
}

document.addEventListener('keydown', (e) => {
    const key = e.key;
    if (key === ' ' || key === 'k') attack();
    if (key === 'ArrowRight' || key === 'd') { keys.right = true; player.lastDirection = 'right'; }
    if (key === 'ArrowLeft' || key === 'a') { keys.left = true; player.lastDirection = 'left'; }
    if (key === 'ArrowUp' || key === 'w') { keys.up = true; player.lastDirection = 'up'; }
    if (key === 'ArrowDown' || key === 's') { keys.down = true; player.lastDirection = 'down'; }

    if (e.key === 'Enter') {
        if (gameState === 'BACKSTORY' && backstoryIndex >= backstorySlides.length) {
            gameState = 'START';
        } else if (gameState === 'START' || gameState === 'GAME_OVER') {
            restartGame();
        } else if (gameState === 'LEVEL_CLEAR') {
            startBossFight();
        } else if (gameState === 'GAME_WON') {
            gameState = 'START';
        }
    }
});

document.addEventListener('keyup', (e) => {
    const key = e.key;
    if (key === 'ArrowRight' || key === 'd') keys.right = false;
    if (key === 'ArrowLeft' || key === 'a') keys.left = false;
    if (key === 'ArrowUp' || key === 'w') keys.up = false;
    if (key === 'ArrowDown' || key === 's') keys.down = false;
});

function collidesWithObstacles(x, y, w, h) {
    return obstacles.some(o => (
        x < o.x + o.width && x + w > o.x &&
        y < o.y + o.height && y + h > o.y
    ));
}

function findSafePosition(x, y, w, h) {
    // If current position is safe, return it
    if (!collidesWithObstacles(x, y, w, h)) return { x, y };

    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
    const step = 10;
    const maxRadius = 300;

    // Spiral-like search around desired position
    for (let r = step; r <= maxRadius; r += step) {
        const candidates = [
            { x: x + r, y },
            { x: x - r, y },
            { x, y: y + r },
            { x, y: y - r },
            { x: x + r, y: y + r },
            { x: x + r, y: y - r },
            { x: x - r, y: y + r },
            { x: x - r, y: y - r }
        ];
        for (const c of candidates) {
            const nx = clamp(c.x, 0, canvas.width - w);
            const ny = clamp(c.y, 0, canvas.height - h);
            if (!collidesWithObstacles(nx, ny, w, h)) return { x: nx, y: ny };
        }
    }

    // Fallback scan across the map
    for (let ny = 0; ny <= canvas.height - h; ny += step) {
        for (let nx = 0; nx <= canvas.width - w; nx += step) {
            if (!collidesWithObstacles(nx, ny, w, h)) return { x: nx, y: ny };
        }
    }
    // As a last resort, return original
    return { x, y };
}

function ensurePlayerSafeSpawn() {
    const desiredX = canvas.width / 2 - player.width / 2;
    const desiredY = canvas.height - 60; // Keep previous intended baseline
    const pos = findSafePosition(desiredX, desiredY, player.width, player.height);
    player.x = pos.x;
    player.y = pos.y;
}

function updatePlayerPosition() {
    // Horizontal move
    let newX = player.x;
    if (keys.right) newX = Math.min(canvas.width - player.width, newX + player.speed);
    if (keys.left) newX = Math.max(0, newX - player.speed);
    if (!collidesWithObstacles(newX, player.y, player.width, player.height)) player.x = newX;

    // Vertical move
    let newY = player.y;
    if (keys.up) newY = Math.max(0, newY - player.speed);
    if (keys.down) newY = Math.min(canvas.height - player.height, newY + player.speed);
    if (!collidesWithObstacles(player.x, newY, player.width, player.height)) player.y = newY;
}

function attack() {
    if (player.attackCooldown) return;
    player.isAttacking = true;
    player.attackCooldown = true;
    setTimeout(() => { player.isAttacking = false; }, 200);
    setTimeout(() => { player.attackCooldown = false; }, 500);
}

function updateEnemies() {
    enemies.forEach(enemy => {
        if (enemy.isFrozen) return;
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 1) {
            const moveX = (dx / distance) * enemy.speed;
            const moveY = (dy / distance) * enemy.speed;

            const targetX = enemy.x + moveX;
            const targetY = enemy.y + moveY;

            if (!collidesWithObstacles(targetX, enemy.y, enemy.width, enemy.height)) {
                enemy.x = targetX;
            }
            if (!collidesWithObstacles(enemy.x, targetY, enemy.width, enemy.height)) {
                enemy.y = targetY;
            }
        }
    });
}

function updateBoss() {
    if (gameState !== 'BOSS_FIGHT') return;
    // Chase player
    const bx = boss.x + boss.width / 2;
    const by = boss.y + boss.height / 2;
    const px = player.x + player.width / 2;
    const py = player.y + player.height / 2;
    const dx = px - bx;
    const dy = py - by;
    const dist = Math.hypot(dx, dy) || 1;
    boss.x += (dx / dist) * boss.speed;
    boss.y += (dy / dist) * boss.speed;
    boss.x = Math.max(0, Math.min(canvas.width - boss.width, boss.x));
    boss.y = Math.max(0, Math.min(canvas.height - boss.height, boss.y));

    // Drop bombs periodically
    const now = Date.now();
    if (now - lastBombTime >= BOMB_COOLDOWN_MS) {
        bombs.push({ x: boss.x + boss.width / 2, y: boss.y + boss.height, createdAt: now, exploding: false, explodedAt: 0, damageApplied: false });
        lastBombTime = now;
    }
}

function updateBombs() {
    const now = Date.now();
    bombs = bombs.filter(b => {
        if (!b.exploding && now - b.createdAt >= BOMB_FUSE_MS) {
            b.exploding = true;
            b.explodedAt = now;
        }
        if (b.exploding && now - b.explodedAt > BOMB_EXPLOSION_MS) {
            return false; // remove after explosion ends
        }
        return true;
    });
}

function drawObstacles() {
    ctx.fillStyle = '#444';
    obstacles.forEach(o => {
        ctx.fillRect(o.x, o.y, o.width, o.height);
    });
}

function drawBombs() {
    bombs.forEach(b => {
        if (!b.exploding) {
            // Bomb body
            ctx.fillStyle = '#222';
            ctx.beginPath();
            ctx.arc(b.x, b.y, 8, 0, Math.PI * 2);
            ctx.fill();
            // Fuse glow
            ctx.fillStyle = '#ffa500';
            ctx.beginPath();
            ctx.arc(b.x + 6, b.y - 6, 3, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Explosion circle
            ctx.strokeStyle = 'rgba(255, 80, 0, 0.9)';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(b.x, b.y, BOMB_EXPLOSION_RADIUS, 0, Math.PI * 2);
            ctx.stroke();
        }
    });
}

function checkCollisions() {
    if (player.isAttacking) {
        const hitbox = getAttackHitbox();
        enemies.forEach((enemy, index) => {
            if (hitbox.x < enemy.x + enemy.width && hitbox.x + hitbox.width > enemy.x && hitbox.y < enemy.y + enemy.height && hitbox.y + hitbox.height > enemy.y) {
                enemy.health -= 50;
                if (enemy.health <= 0) {
                    enemies.splice(index, 1);
                    score += 10;
                    scoreEl.innerText = score;
                }
            }
        });

        if (gameState === 'BOSS_FIGHT' && hitbox.x < boss.x + boss.width && hitbox.x + hitbox.width > boss.x && hitbox.y < boss.y + boss.height && hitbox.y + hitbox.height > boss.y) {
            boss.health -= 25;
            if (boss.health <= 0) gameState = 'GAME_WON';
        }
    }

    enemies.forEach(enemy => {
        if (player.x < enemy.x + enemy.width && player.x + player.width > enemy.x && player.y < enemy.y + enemy.height && player.y + player.height > enemy.y) {
            if (!player.isInvincible) {
                player.health -= 20;
                if (player.health <= 0) gameState = 'GAME_OVER';
            }
        }
    });

    powerUps.forEach((powerUp, index) => {
        if (player.x < powerUp.x + powerUp.width && player.x + player.width > powerUp.x && player.y < powerUp.y + powerUp.height && player.y + player.height > powerUp.y) {
            switch (powerUp.type) {
                case 'health':
                    player.health = Math.min(player.maxHealth, player.health + 30);
                    break;
                case 'spear':
                    player.hasSpear = true;
                    break;
                case 'invincibility':
                    player.isInvincible = true;
                    setTimeout(() => { player.isInvincible = false; }, 10000);
                    break;
                case 'ice':
                    enemies.forEach(e => {
                        e.isFrozen = true;
                        setTimeout(() => { e.isFrozen = false; }, 5000);
                    });
                    break;
                default:
                    score += 20;
                    scoreEl.innerText = score;
                    break;
            }
            powerUps.splice(index, 1);
        }
    });

    // Bomb explosion damage
    bombs.forEach(b => {
        if (b.exploding && !b.damageApplied) {
            const px = player.x + player.width / 2;
            const py = player.y + player.height / 2;
            const dist = Math.hypot(px - b.x, py - b.y);
            if (dist <= BOMB_EXPLOSION_RADIUS) {
                if (!player.isInvincible) {
                    player.health -= 30;
                    if (player.health <= 0) gameState = 'GAME_OVER';
                }
            }
            b.damageApplied = true;
        }
    });

    if (gameState === 'BOSS_FIGHT' && player.x < boss.x + boss.width && player.x + player.width > boss.x && player.y < boss.y + boss.height && player.y + player.height > boss.y) {
        if (!player.isInvincible) {
            player.health -= 40;
            if (player.health <= 0) gameState = 'GAME_OVER';
        }
    }
}

function checkWinCondition() {
    if (gameState === 'PLAYING' && enemies.length === 0) {
        currentLevelIndex++;
        if (currentLevelIndex >= levels.length) {
            gameState = 'LEVEL_CLEAR';
        } else {
            loadLevel(currentLevelIndex);
        }
    }
}

function drawPlayer() {
    if (player.isInvincible && Math.floor(Date.now() / 200) % 2) {
        // Blinking effect
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
            ctx.filter = 'saturate(0%) brightness(1.5) contrast(200%)';
        }

        if (e.image && e.image.complete && !e.image.loadFailed) {
            ctx.drawImage(e.image, e.x, e.y, e.width, e.height);
        } else {
            ctx.fillStyle = 'red';
            ctx.fillRect(e.x, e.y, e.width, e.height);
        }

        ctx.filter = 'none';
        if (drawHealthBarFunc) {
            drawHealthBarFunc(e);
        }
    });
}

function wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (let i = 0; i < words.length; i++) {
        const testLine = line ? line + ' ' + words[i] : words[i];
        const { width } = ctx.measureText(testLine);
        if (width > maxWidth && line) {
            lines.push(line);
            line = words[i];
        } else {
            line = testLine;
        }
    }
    if (line) lines.push(line);
    return lines;
}

function drawBackstory() {
    const slideKey = backstorySlides[backstoryIndex];
    const slideImg = images[slideKey];
    if (slideImg && slideImg.complete && !slideImg.loadFailed) {
        ctx.drawImage(slideImg, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    // Draw slide caption
    if (backstoryIndex >= 0 && backstoryIndex < backstoryCaptions.length) {
        const caption = backstoryCaptions[backstoryIndex];
        if (caption) {
            const margin = 40;
            const maxWidth = canvas.width - margin * 2;
            const lineHeight = 24;
            ctx.font = "18px 'Press Start 2P'";
            ctx.textAlign = 'center';
            const lines = wrapText(ctx, caption, maxWidth);
            const padding = 12;
            const boxHeight = lines.length * lineHeight + padding * 2;
            const boxY = canvas.height - boxHeight - 80;
            // background box
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(margin, boxY, canvas.width - margin * 2, boxHeight);
            // text lines
            ctx.fillStyle = 'white';
            lines.forEach((line, idx) => {
                ctx.fillText(line, canvas.width / 2, boxY + padding + (idx + 0.8) * lineHeight);
            });
        }
    }
    if (Date.now() - lastSlideChange > 7000) {
        if (backstoryIndex < backstorySlides.length) {
            backstoryIndex++;
            lastSlideChange = Date.now();
        }
    }
    if (backstoryIndex >= backstorySlides.length) {
        ctx.fillStyle = 'white';
        ctx.font = "20px 'Press Start 2P'";
        ctx.textAlign = 'center';
        ctx.fillText('Pressione Enter para começar', canvas.width / 2, canvas.height - 40);
    }
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
    const spearBonus = hasSpear ? 60 : 0;

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
    gameState = 'PLAYING';
    score = 0;
    scoreEl.innerText = score;
    // Set desired position, then ensure it's safe after level load
    player.x = canvas.width / 2 - 25;
    player.y = canvas.height - 60;
    player.health = player.maxHealth;
    player.hasSpear = false;
    player.isInvincible = false;
    currentLevelIndex = 0;
    loadLevel(currentLevelIndex);
    ensurePlayerSafeSpawn();
    bombs = [];
    lastBombTime = 0;
}

function startBossFight() {
    gameState = 'BOSS_FIGHT';
    boss.health = boss.maxHealth;
    boss.x = canvas.width / 2 - boss.width / 2;
    // Keep player safe relative to remaining obstacles
    if (collidesWithObstacles(player.x, player.y, player.width, player.height)) {
        ensurePlayerSafeSpawn();
    }
    bombs = [];
    lastBombTime = 0;
}

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    switch (gameState) {
                case 'BACKSTORY':
            drawBackstory();
            break;
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
            updateBombs();
            checkCollisions();
            checkWinCondition();
            drawObstacles();
            drawEntities(enemies, (enemy) => {
                drawHealthBar(enemy.x, enemy.y - 10, enemy.width, 5, enemy.health, enemy.maxHealth, '#90ee90');
            });
            drawEntities(powerUps);
            if (gameState === 'BOSS_FIGHT') drawEntities([boss]);
            drawBombs();
            drawPlayer();
            drawHealthBar(10, 10, 200, 20, player.health, player.maxHealth, '#ff0000');
            if (gameState === 'BOSS_FIGHT') drawHealthBar(canvas.width / 2 - 150, 15, 300, 25, boss.health, boss.maxHealth, '#c300ff');
            break;
    }
    requestAnimationFrame(gameLoop);
}

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
        images[src].onerror = () => {
            console.error(`Failed to load image '${src}' at path: ${sources[src]}`);
            images[src].loadFailed = true;
            onAssetLoad();
        };
        images[src].src = sources[src];
    }
}

loadImages(imageSources, () => {
    player.image = images.player;
    boss.image = images.enemy;
    // Don't start gameLoop here, wait for user interaction
});

startOverlay.addEventListener('click', () => {
    startOverlay.style.display = 'none';

    const music = document.getElementById('bg-music');
    if (music) {
        music.volume = 1.0;
        music.muted = false;
        music.play().catch(() => {});
    }

    lastSlideChange = Date.now();
    gameLoop();
}, { once: true });
