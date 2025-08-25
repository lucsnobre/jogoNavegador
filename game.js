const canvas = document.getElementById('gameCanvas');
const startOverlay = document.getElementById('start-overlay');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');

// Extend scoreboard to show Combo
const scoreBoardEl = document.getElementById('score-board');
if (scoreBoardEl && !document.getElementById('combo')) {
    scoreBoardEl.innerHTML = 'Score: <span id="score">0</span>  Combo: <span id="combo">x1.0</span>';
}
const comboEl = document.getElementById('combo');

function updateScoreUI() {
    const el = document.getElementById('score');
    if (el) el.innerText = score;
}

let score = 0;
let comboMultiplier = 1.0;
let comboExpireAt = 0; // timestamp in ms

function addScore(base) {
    const inc = Math.round(base * comboMultiplier);
    score += inc;
    updateScoreUI();
}

function refreshComboUI() {
    const el = document.getElementById('combo');
    if (el) el.innerText = 'x' + comboMultiplier.toFixed(1);
}

function onEnemyKilled() {
    const now = Date.now();
    comboMultiplier = Math.min(5.0, comboMultiplier + 0.5);
    comboExpireAt = now + 3000 + comboExtraMs; // extended by upgrades
    refreshComboUI();
}

function onPlayerDamaged() {
    comboMultiplier = 1.0;
    comboExpireAt = 0;
    refreshComboUI();
    pulseVignette(0.5);
}
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

// Projectile and VFX
let projectiles = [];
let enemyProjectiles = [];
let muzzleFlashes = [];
let PROJECTILE_SPEED = 12;
const PROJECTILE_LIFETIME = 700; // ms
const PROJECTILE_RADIUS = 4;
let PROJECTILE_DAMAGE = 40;
const BOSS_PROJECTILE_DAMAGE = 20;
const MUZZLE_FLASH_DURATION = 120; // ms
let ATTACK_COOLDOWN_MS = 500; // upgradable

// VFX core
let particles = [];
let floatingTexts = [];
let shakeTime = 0, shakeMag = 0;
let vignettePulse = 0; // 0..1
let timeScale = 1.0;
let timeScaleUntil = 0;

function triggerShake(magnitude = 6, durationMs = 200) {
    shakeMag = Math.max(shakeMag, magnitude);
    shakeTime = Math.max(shakeTime, durationMs);
}

function triggerHitstop(ms = 80, slowFactor = 0.25) {
    timeScale = slowFactor;
    timeScaleUntil = Date.now() + ms;
}

function pulseVignette(strength = 0.6) {
    vignettePulse = Math.min(1, vignettePulse + strength);
}

function spawnParticles(x, y, color = 'rgba(255,200,80,1)', count = 8, speed = 3, life = 400) {
    for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.5 + Math.random());
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, born: Date.now(), color });
    }
}

function updateParticles() {
    const now = Date.now();
    particles = particles.filter(p => {
        const t = now - p.born;
        if (t > p.life) return false;
        const k = 1 - t / p.life;
        p.x += p.vx * timeScale;
        p.y += p.vy * timeScale;
        p.vx *= 0.98; p.vy *= 0.98;
        p.alpha = Math.max(0, k);
        return true;
    });
}

function drawParticles() {
    particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 2, 2);
        ctx.restore();
    });
}

function pushFloatingText(x, y, text, color = '#fff') {
    floatingTexts.push({ x, y, text, color, born: Date.now(), life: 800 });
}

function updateFloatingTexts() {
    const now = Date.now();
    floatingTexts = floatingTexts.filter(ft => {
        const t = now - ft.born;
        if (t > ft.life) return false;
        ft.y -= 0.4 * timeScale;
        ft.alpha = Math.max(0, 1 - t / ft.life);
        return true;
    });
}

function drawFloatingTexts() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = "14px 'Press Start 2P'";
    floatingTexts.forEach(ft => {
        ctx.globalAlpha = ft.alpha;
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);
    });
    ctx.restore();
}

function drawVignette() {
    if (vignettePulse <= 0) return;
    const grd = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.4,
        canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.7
    );
    const a = 0.35 * Math.min(1, vignettePulse);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, `rgba(0,0,0,${a})`);
    ctx.save();
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    vignettePulse = Math.max(0, vignettePulse - 0.02);
}

// Parallax background (subtle drift)
let parallax = { t: 0, speed: 0.02 };
function updateParallax(dt) { parallax.t += dt * parallax.speed; }
function drawParallax() {
    const layers = [
        { img: images.back1, speed: 0.2, alpha: 0.35 },
        { img: images.back2, speed: 0.4, alpha: 0.5 },
        { img: images.back3, speed: 0.6, alpha: 0.7 }
    ];
    ctx.save();
    layers.forEach((l, i) => {
        if (!l.img || !l.img.complete || l.img.loadFailed) return;
        const ox = Math.sin(parallax.t * (0.4 + i * 0.2)) * 20 * l.speed;
        const oy = Math.cos(parallax.t * (0.5 + i * 0.15)) * 12 * l.speed;
        ctx.globalAlpha = l.alpha;
        ctx.drawImage(l.img, ox, oy, canvas.width, canvas.height);
    });
    ctx.restore();
}

// WebAudio SFX (oscillator-based, no asset required)
let audioCtx = null, masterGain = null;
function ensureAudio() {
    if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AC();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.08;
        masterGain.connect(audioCtx.destination);
    }
}
function playBeep(freq = 440, ms = 100, type = 'square', gain = 0.06) {
    if (!audioCtx || !masterGain) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    o.connect(g); g.connect(masterGain);
    const t0 = audioCtx.currentTime;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
    o.start(t0); o.stop(t0 + ms / 1000);
}
function playSFX(name) {
    ensureAudio();
    switch (name) {
        case 'shot': return playBeep(880, 60, 'square', 0.04);
        case 'hit': return playBeep(220, 80, 'sawtooth', 0.05);
        case 'kill': return playBeep(440, 120, 'triangle', 0.06);
        case 'pickup': return playBeep(1200, 100, 'sine', 0.04);
        case 'bomb': return playBeep(80, 200, 'sawtooth', 0.08);
        case 'playerhurt': return playBeep(140, 160, 'square', 0.07);
        case 'crit': return playBeep(1600, 120, 'triangle', 0.06);
        case 'dash': return playBeep(700, 70, 'sine', 0.05);
        case 'enemyShot': return playBeep(500, 60, 'square', 0.03);
    }
}

// Pause & timing
let isPaused = false;
let lastFrameTime = Date.now();

// Upgrades and combo extras
let hpOnKill = 0;
let comboExtraMs = 0;
let availableUpgrades = [];
let upgradeChosen = false;
const upgradeDefs = [
    { id: 'dmg+20', title: '+20 Dano', desc: 'Mais dano por tiro', apply: () => { PROJECTILE_DAMAGE += 20; } },
    { id: 'spd+25', title: '+25% Vel. do Tiro', desc: 'Balas mais rápidas', apply: () => { PROJECTILE_SPEED = Math.round(PROJECTILE_SPEED * 1.25); } },
    { id: 'rof+20', title: '-20% Recarga', desc: 'Atira mais rápido', apply: () => { ATTACK_COOLDOWN_MS = Math.max(120, Math.round(ATTACK_COOLDOWN_MS * 0.8)); } },
    { id: 'hp+50', title: '+50 Vida Máx.', desc: 'Mais resistência', apply: () => { player.maxHealth += 50; player.health = Math.min(player.maxHealth, player.health + 50); } },
    { id: 'movespd+20', title: '+20% Vel. Move', desc: 'Move mais rápido', apply: () => { player.baseSpeed = Math.round(player.baseSpeed * 1.2); player.speed = player.baseSpeed; } },
    { id: 'lifesteal5', title: '+5 Vida/Abate', desc: 'Recupera vida ao matar', apply: () => { hpOnKill += 5; } },
    { id: 'combo+1s', title: '+1s de Combo', desc: 'Combo dura mais', apply: () => { comboExtraMs += 1000; } }
];
function generateUpgrades(n = 3) {
    const opts = [];
    const used = new Set();
    while (opts.length < n && used.size < upgradeDefs.length) {
        const u = upgradeDefs[Math.floor(Math.random() * upgradeDefs.length)];
        if (!used.has(u.id)) { used.add(u.id); opts.push(u); }
    }
    return opts;
}
function drawLevelClear() {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.font = "28px 'Press Start 2P'";
    ctx.fillText('FASE CONCLUÍDA', canvas.width / 2, 120);
    ctx.font = "16px 'Press Start 2P'";
    ctx.fillText('Escolha um upgrade (1, 2 ou 3)', canvas.width / 2, 160);
    const cardW = 220, cardH = 140, gap = 30;
    const totalW = 3 * cardW + 2 * gap;
    const x0 = (canvas.width - totalW) / 2;
    const y0 = 220;
    for (let i = 0; i < availableUpgrades.length; i++) {
        const u = availableUpgrades[i];
        const x = x0 + i * (cardW + gap);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(x, y0, cardW, cardH);
        ctx.strokeStyle = upgradeChosen ? '#777' : '#fff';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y0, cardW, cardH);
        ctx.fillStyle = '#fff';
        ctx.font = "14px 'Press Start 2P'";
        ctx.fillText(u.title, x + cardW / 2, y0 + 40);
        ctx.font = "12px 'Press Start 2P'";
        const descLines = wrapText(ctx, u.desc, cardW - 20);
        let ly = y0 + 70;
        descLines.forEach(line => { ctx.fillText(line, x + cardW / 2, ly); ly += 18; });
        ctx.font = "12px 'Press Start 2P'";
        ctx.fillText(`[${i + 1}]`, x + cardW / 2, y0 + cardH - 12);
    }
    ctx.font = "14px 'Press Start 2P'";
    if (upgradeChosen) ctx.fillText('Pressione Enter para o chefe', canvas.width / 2, y0 + cardH + 80);
}

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
const BACKSTORY_SLIDE_MS = 9000;
const BACKSTORY_FADE_MS = 800;
const TYPEWRITER_SPEED = 30; // ms per character
const backstoryCaptions = [
    'Quando a sirene calou, só restou o crepitar das chamas. No coração da fumaça, Vitinho fez um juramento: nunca mais fugir — a não ser em direção ao perigo.',
    'No escuro, transformou tropeços em treino. Cada queda virou passo, cada passo virou golpe. E o medo, afinado à lâmina da vontade, deixou de mandar.',
    'Agora, diante do gigante, o mundo prende a respiração. Vitinho não luta só por si — luta por todos os que foram silenciados. É hora de fazer história.'
];

function createEnemy(x, y) {
    return {
        x, y,
        width: 50, height: 50,
        image: images.enemy,
        health: 80, maxHealth: 80, speed: 1.5,
        isFrozen: false,
        // New combat fields
        type: 'grunt',
        hitFlashUntil: 0,
        isStaggeredUntil: 0,
        nextShotAt: 0,
        dashing: false,
        dashUntil: 0,
        nextDashAt: 0
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
    // Load obstacles first so collision checks are accurate
    obstacles = (level.obstacles || []).map(o => ({ ...o }));
    enemies = level.enemies.map(e => ({ ...e, image: images.enemy }));
    // Ensure enemies don't start inside obstacles
    enemies.forEach(enemy => {
        if (collidesWithObstacles(enemy.x, enemy.y, enemy.width, enemy.height)) {
            const pos = findSafePosition(enemy.x, enemy.y, enemy.width, enemy.height);
            enemy.x = pos.x; enemy.y = pos.y;
        }
        // assign some enemy types for variety
        if (!enemy.type) {
            const r = Math.random();
            enemy.type = r < 0.34 ? 'dasher' : (r < 0.67 ? 'shooter' : 'grunt');
        }
        enemy.hitFlashUntil = 0;
        enemy.isStaggeredUntil = 0;
        enemy.nextShotAt = 0;
        enemy.dashing = false;
        enemy.dashUntil = 0;
        enemy.nextDashAt = 0;
    });
    powerUps = level.powerUps.map(p => ({ ...p, image: images[p.type] }));
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

    if (e.key === 'Escape') {
        isPaused = !isPaused;
    }

    if (e.key === 'Enter') {
        if (gameState === 'BACKSTORY') {
            if (backstoryIndex >= backstorySlides.length) {
                gameState = 'START';
            } else {
                // Skip to end of backstory
                backstoryIndex = backstorySlides.length;
                lastSlideChange = Date.now();
            }
        } else if (gameState === 'START' || gameState === 'GAME_OVER') {
            restartGame();
        } else if (gameState === 'LEVEL_CLEAR') {
            if (availableUpgrades.length === 0) availableUpgrades = generateUpgrades(3);
            if (upgradeChosen) startBossFight();
        } else if (gameState === 'GAME_WON') {
            gameState = 'START';
        }
    }

    if (gameState === 'LEVEL_CLEAR' && !upgradeChosen && ['1','2','3'].includes(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (availableUpgrades[idx]) {
            availableUpgrades[idx].apply();
            upgradeChosen = true;
            playSFX('pickup');
            pulseVignette(0.6);
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
    const step = player.speed * timeScale;
    let newX = player.x;
    if (keys.right) newX = Math.min(canvas.width - player.width, newX + step);
    if (keys.left) newX = Math.max(0, newX - step);
    if (!collidesWithObstacles(newX, player.y, player.width, player.height)) player.x = newX;

    // Vertical move
    let newY = player.y;
    if (keys.up) newY = Math.max(0, newY - step);
    if (keys.down) newY = Math.min(canvas.height - player.height, newY + step);
    if (!collidesWithObstacles(player.x, newY, player.width, player.height)) player.y = newY;
}

function attack() {
    if (player.attackCooldown) return;
    player.isAttacking = true;
    player.attackCooldown = true;
    // Spawn projectile and muzzle flash
    const dir = getMuzzleDirection();
    const muzzle = getMuzzlePosition();
    if (dir && muzzle) {
        projectiles.push({
            x: muzzle.x,
            y: muzzle.y,
            lastX: muzzle.x,
            lastY: muzzle.y,
            vx: dir.x * PROJECTILE_SPEED,
            vy: dir.y * PROJECTILE_SPEED,
            r: PROJECTILE_RADIUS,
            createdAt: Date.now(),
            life: 0
        });
        muzzleFlashes.push({ x: muzzle.x, y: muzzle.y, dir: player.lastDirection, createdAt: Date.now() });
        playSFX('shot');
        triggerShake(2, 120);
    }
    setTimeout(() => { player.isAttacking = false; }, 200);
    setTimeout(() => { player.attackCooldown = false; }, ATTACK_COOLDOWN_MS);
}

function updateEnemies() {
    const now = Date.now();
    enemies.forEach(enemy => {
        // Unstuck if inside obstacle
        if (collidesWithObstacles(enemy.x, enemy.y, enemy.width, enemy.height)) {
            const pos = findSafePosition(enemy.x, enemy.y, enemy.width, enemy.height);
            enemy.x = pos.x; enemy.y = pos.y;
        }
        if (enemy.isFrozen) return;
        if (enemy.isStaggeredUntil && now < enemy.isStaggeredUntil) return;

        const cx = enemy.x + enemy.width / 2;
        const cy = enemy.y + enemy.height / 2;
        const px = player.x + player.width / 2;
        const py = player.y + player.height / 2;
        const dx = px - cx;
        const dy = py - cy;
        const distance = Math.hypot(dx, dy) || 1;
        let speed = enemy.speed * timeScale;

        // Behavior by type
        if (enemy.type === 'shooter') {
            // Keep medium range
            if (distance > 200) {
                // move closer
                const mx = (dx / distance) * speed * 0.8;
                const my = (dy / distance) * speed * 0.8;
                const tx = enemy.x + mx;
                const ty = enemy.y + my;
                if (!collidesWithObstacles(tx, enemy.y, enemy.width, enemy.height)) enemy.x = tx;
                if (!collidesWithObstacles(enemy.x, ty, enemy.width, enemy.height)) enemy.y = ty;
            } else if (distance < 140) {
                // back off
                const mx = (-dx / distance) * speed * 0.8;
                const my = (-dy / distance) * speed * 0.8;
                const tx = enemy.x + mx;
                const ty = enemy.y + my;
                if (!collidesWithObstacles(tx, enemy.y, enemy.width, enemy.height)) enemy.x = tx;
                if (!collidesWithObstacles(enemy.x, ty, enemy.width, enemy.height)) enemy.y = ty;
            }
            if (!enemy.nextShotAt) enemy.nextShotAt = now + 500 + Math.random() * 800;
            if (now >= enemy.nextShotAt) {
                const sx = cx, sy = cy;
                const sdx = dx / distance, sdy = dy / distance;
                enemyProjectiles.push({ x: sx, y: sy, vx: sdx * 6, vy: sdy * 6, r: 3, createdAt: now });
                enemy.nextShotAt = now + 800 + Math.random() * 1000;
                playSFX('enemyShot');
            }
        } else if (enemy.type === 'dasher') {
            if (!enemy.dashing && now >= enemy.nextDashAt) {
                enemy.dashing = true;
                enemy.dashUntil = now + 220;
                enemy.nextDashAt = now + 1500 + Math.random() * 800;
                playSFX('dash');
            }
            const mult = enemy.dashing ? 4 : 1;
            const mx = (dx / distance) * speed * mult;
            const my = (dy / distance) * speed * mult;
            const tx = enemy.x + mx;
            const ty = enemy.y + my;
            if (!collidesWithObstacles(tx, enemy.y, enemy.width, enemy.height)) enemy.x = tx;
            if (!collidesWithObstacles(enemy.x, ty, enemy.width, enemy.height)) enemy.y = ty;
            if (enemy.dashing && now >= enemy.dashUntil) enemy.dashing = false;
        } else {
            // grunt default chase
            if (distance > 1) {
                const mx = (dx / distance) * speed;
                const my = (dy / distance) * speed;
                const tx = enemy.x + mx;
                const ty = enemy.y + my;
                if (!collidesWithObstacles(tx, enemy.y, enemy.width, enemy.height)) enemy.x = tx;
                if (!collidesWithObstacles(enemy.x, ty, enemy.width, enemy.height)) enemy.y = ty;
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
            if (!b.fxTriggered) {
                triggerShake(10, 200);
                triggerHitstop(90, 0.3);
                playSFX('bomb');
                // explosion particles
                spawnParticles(b.x, b.y, 'rgba(255,120,40,1)', 26, 4, 500);
                b.fxTriggered = true;
            }
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
    const now = Date.now();
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
            // Telegraph ring based on fuse progress
            const t = Math.min(1, (now - b.createdAt) / BOMB_FUSE_MS);
            ctx.strokeStyle = `rgba(255,120,40,${0.2 + 0.5 * Math.sin(t * Math.PI)})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(b.x, b.y, BOMB_EXPLOSION_RADIUS, 0, Math.PI * 2);
            ctx.stroke();
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

// Utility clamp for collisions
const clampVal = (val, min, max) => Math.max(min, Math.min(max, val));

function collidesCircleRect(cx, cy, r, rect) {
    const closestX = clampVal(cx, rect.x, rect.x + rect.width);
    const closestY = clampVal(cy, rect.y, rect.y + rect.height);
    const dx = cx - closestX;
    const dy = cy - closestY;
    return (dx * dx + dy * dy) <= r * r;
}

function getMuzzleDirection() {
    switch (player.lastDirection) {
        case 'up': return { x: 0, y: -1 };
        case 'down': return { x: 0, y: 1 };
        case 'left': return { x: -1, y: 0 };
        case 'right': return { x: 1, y: 0 };
        default: return { x: 0, y: -1 };
    }
}

function getMuzzlePosition() {
    const { x, y, width, height } = player;
    switch (player.lastDirection) {
        case 'up': return { x: x + width / 2, y: y };
        case 'down': return { x: x + width / 2, y: y + height };
        case 'left': return { x: x, y: y + height / 2 };
        case 'right': return { x: x + width, y: y + height / 2 };
        default: return { x: x + width / 2, y: y };
    }
}

function updateProjectiles() {
    const now = Date.now();
    // Move and handle collisions
    projectiles = projectiles.filter(p => {
        p.life = now - p.createdAt;
        if (p.life > PROJECTILE_LIFETIME) return false;

        p.lastX = p.x; p.lastY = p.y;
        p.x += p.vx * timeScale; p.y += p.vy * timeScale;

        // Out of bounds
        if (p.x < -10 || p.x > canvas.width + 10 || p.y < -10 || p.y > canvas.height + 10) return false;

        // Hit obstacle
        for (const o of obstacles) {
            if (collidesCircleRect(p.x, p.y, p.r, o)) {
                spawnParticles(p.x, p.y, 'rgba(255,220,120,1)', 10, 3, 300);
                return false;
            }
        }

        // Hit enemies
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            const withinX = p.x >= e.x - p.r && p.x <= e.x + e.width + p.r;
            const withinY = p.y >= e.y - p.r && p.y <= e.y + e.height + p.r;
            if (withinX && withinY) {
                e.health -= PROJECTILE_DAMAGE;
                e.hitFlashUntil = now + 120;
                pushFloatingText(p.x, p.y - 6, `-${PROJECTILE_DAMAGE}`, '#ffd070');
                spawnParticles(p.x, p.y, 'rgba(255,220,120,1)', 12, 3.2, 380);
                playSFX('hit');
                triggerHitstop(60, 0.4);
                triggerShake(3, 120);
                if (e.health <= 0) {
                    enemies.splice(i, 1);
                    addScore(10);
                    onEnemyKilled();
                    if (hpOnKill > 0) player.health = Math.min(player.maxHealth, player.health + hpOnKill);
                    playSFX('kill');
                    pushFloatingText(e.x + e.width / 2, e.y, '+10', '#90ee90');
                }
                return false;
            }
        }

        // Hit boss
        if (gameState === 'BOSS_FIGHT') {
            const withinX = p.x >= boss.x - p.r && p.x <= boss.x + boss.width + p.r;
            const withinY = p.y >= boss.y - p.r && p.y <= boss.y + boss.height + p.r;
            if (withinX && withinY) {
                boss.health -= BOSS_PROJECTILE_DAMAGE;
                pushFloatingText(p.x, p.y - 8, `-${BOSS_PROJECTILE_DAMAGE}`, '#ffb0ff');
                spawnParticles(p.x, p.y, 'rgba(255,180,255,1)', 14, 3.4, 420);
                playSFX('hit');
                triggerHitstop(60, 0.4);
                triggerShake(4, 140);
                if (boss.health <= 0) gameState = 'GAME_WON';
                return false;
            }
        }

        return true;
    });

    // Clear expired muzzle flashes
    muzzleFlashes = muzzleFlashes.filter(f => now - f.createdAt <= MUZZLE_FLASH_DURATION);
}

function updateEnemyProjectiles() {
    const now = Date.now();
    enemyProjectiles = enemyProjectiles.filter(ep => {
        ep.x += ep.vx * timeScale; ep.y += ep.vy * timeScale;
        if (ep.x < -10 || ep.x > canvas.width + 10 || ep.y < -10 || ep.y > canvas.height + 10) return false;
        for (const o of obstacles) {
            if (collidesCircleRect(ep.x, ep.y, ep.r, o)) return false;
        }
        // Player hit
        if (ep.x >= player.x && ep.x <= player.x + player.width && ep.y >= player.y && ep.y <= player.y + player.height) {
            if (!player.isInvincible) {
                player.health -= 10;
                onPlayerDamaged();
                pushFloatingText(player.x + player.width / 2, player.y - 8, '-10', '#ff7070');
                spawnParticles(player.x + player.width / 2, player.y, 'rgba(255,80,80,1)', 10, 3, 320);
                playSFX('playerhurt');
                triggerShake(4, 160);
            }
            return false;
        }
        return true;
    });
}

function drawEnemyProjectiles() {
    ctx.save();
    ctx.fillStyle = 'rgba(255,80,80,0.9)';
    enemyProjectiles.forEach(ep => {
        ctx.beginPath();
        ctx.arc(ep.x, ep.y, ep.r, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();
}

function drawProjectiles() {
    // Trails
    ctx.save();
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const p of projectiles) {
        const grad = ctx.createLinearGradient(p.lastX, p.lastY, p.x, p.y);
        grad.addColorStop(0, 'rgba(255,255,200,0.0)');
        grad.addColorStop(1, 'rgba(255,255,120,0.9)');
        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(p.lastX, p.lastY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();

        // Core bullet
        ctx.fillStyle = 'rgba(255,255,180,1)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawMuzzleFlashes() {
    const now = Date.now();
    muzzleFlashes.forEach(f => {
        const t = (now - f.createdAt) / MUZZLE_FLASH_DURATION;
        const alpha = Math.max(0, 1 - t);
        const len = 18; // flash length
        const wide = 10; // triangle width
        let dx = 0, dy = 0;
        switch (f.dir) {
            case 'up': dy = -1; break;
            case 'down': dy = 1; break;
            case 'left': dx = -1; break;
            case 'right': dx = 1; break;
        }
        const tipX = f.x + dx * len;
        const tipY = f.y + dy * len;
        const orthoX = -dy;
        const orthoY = dx;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(255,240,120,1)';
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(f.x + orthoX * wide, f.y + orthoY * wide);
        ctx.lineTo(f.x - orthoX * wide, f.y - orthoY * wide);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    });
}

function checkCollisions() {
    if (player.isAttacking) {
        const hitbox = getAttackHitbox();
        enemies.forEach((enemy, index) => {
            if (hitbox.x < enemy.x + enemy.width && hitbox.x + hitbox.width > enemy.x && hitbox.y < enemy.y + enemy.height && hitbox.y + hitbox.height > enemy.y) {
                const dmg = 50;
                enemy.health -= dmg;
                enemy.hitFlashUntil = Date.now() + 120;
                pushFloatingText(enemy.x + enemy.width / 2, enemy.y, `-${dmg}`, '#ffd070');
                spawnParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, 'rgba(255,220,120,1)', 10, 3, 320);
                playSFX('hit');
                triggerShake(2, 100);
                if (enemy.health <= 0) {
                    enemies.splice(index, 1);
                    addScore(10);
                    onEnemyKilled();
                    if (hpOnKill > 0) player.health = Math.min(player.maxHealth, player.health + hpOnKill);
                    playSFX('kill');
                    pushFloatingText(enemy.x + enemy.width / 2, enemy.y, '+10', '#90ee90');
                }
            }
        });

        if (gameState === 'BOSS_FIGHT' && hitbox.x < boss.x + boss.width && hitbox.x + hitbox.width > boss.x && hitbox.y < boss.y + boss.height && hitbox.y + hitbox.height > boss.y) {
            const dmg = 25;
            boss.health -= dmg;
            pushFloatingText(boss.x + boss.width / 2, boss.y, `-${dmg}`, '#ffb0ff');
            spawnParticles(boss.x + boss.width / 2, boss.y + boss.height / 2, 'rgba(255,180,255,1)', 12, 3.2, 380);
            playSFX('hit');
            triggerHitstop(50, 0.5);
            if (boss.health <= 0) gameState = 'GAME_WON';
        }
    }

    enemies.forEach(enemy => {
        if (player.x < enemy.x + enemy.width && player.x + player.width > enemy.x && player.y < enemy.y + enemy.height && player.y + player.height > enemy.y) {
            if (!player.isInvincible) {
                player.health -= 20;
                onPlayerDamaged();
                pushFloatingText(player.x + player.width / 2, player.y - 8, '-20', '#ff7070');
                spawnParticles(player.x + player.width / 2, player.y, 'rgba(255,80,80,1)', 10, 3, 320);
                playSFX('playerhurt');
                triggerShake(4, 160);
                if (player.health <= 0) gameState = 'GAME_OVER';
            }
        }
    });

    powerUps.forEach((powerUp, index) => {
        if (player.x < powerUp.x + powerUp.width && player.x + player.width > powerUp.x && player.y < powerUp.y + powerUp.height && player.y + player.height > powerUp.y) {
            switch (powerUp.type) {
                case 'health':
                    player.health = Math.min(player.maxHealth, player.health + 30);
                    pulseVignette(0.5);
                    playSFX('pickup');
                    break;
                case 'spear':
                    player.hasSpear = true;
                    playSFX('pickup');
                    break;
                case 'invincibility':
                    player.isInvincible = true;
                    setTimeout(() => { player.isInvincible = false; }, 10000);
                    pulseVignette(0.8);
                    playSFX('pickup');
                    break;
                case 'ice':
                    enemies.forEach(e => {
                        e.isFrozen = true;
                        setTimeout(() => { e.isFrozen = false; }, 5000);
                    });
                    playSFX('pickup');
                    break;
                default:
                    addScore(20);
                    playSFX('pickup');
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
                    onPlayerDamaged();
                    pushFloatingText(player.x + player.width / 2, player.y - 8, '-30', '#ff7070');
                    spawnParticles(player.x + player.width / 2, player.y, 'rgba(255,80,80,1)', 12, 3, 360);
                    playSFX('playerhurt');
                    triggerShake(8, 220);
                    if (player.health <= 0) gameState = 'GAME_OVER';
                }
            }
            b.damageApplied = true;
        }
    });

    if (gameState === 'BOSS_FIGHT' && player.x < boss.x + boss.width && player.x + player.width > boss.x && player.y < boss.y + boss.height && player.y + player.height > boss.y) {
        if (!player.isInvincible) {
            player.health -= 40;
            onPlayerDamaged();
            pushFloatingText(player.x + player.width / 2, player.y - 8, '-40', '#ff7070');
            spawnParticles(player.x + player.width / 2, player.y, 'rgba(255,80,80,1)', 14, 3, 380);
            playSFX('playerhurt');
            triggerShake(8, 200);
            if (player.health <= 0) gameState = 'GAME_OVER';
        }
    }
}

function checkWinCondition() {
    if (gameState === 'PLAYING' && enemies.length === 0) {
        currentLevelIndex++;
        if (currentLevelIndex >= levels.length) {
            gameState = 'LEVEL_CLEAR';
            availableUpgrades = generateUpgrades(3);
            upgradeChosen = false;
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

    // Attack visuals are handled by muzzle flashes and projectiles
}

function drawEntities(entities, drawHealthBarFunc) {
    const now = Date.now();
    entities.forEach(e => {
        let appliedFilter = false;
        if (e.hitFlashUntil && now < e.hitFlashUntil) {
            ctx.filter = 'brightness(1.8) saturate(140%)';
            appliedFilter = true;
        } else if (e.isFrozen) {
            ctx.filter = 'saturate(0%) brightness(1.5) contrast(200%)';
            appliedFilter = true;
        }

        if (e.image && e.image.complete && !e.image.loadFailed) {
            ctx.drawImage(e.image, e.x, e.y, e.width, e.height);
        } else {
            ctx.fillStyle = 'red';
            ctx.fillRect(e.x, e.y, e.width, e.height);
        }

        if (appliedFilter) ctx.filter = 'none';
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
    const now = Date.now();
    const elapsed = now - lastSlideChange;
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

    const slideKey = backstorySlides[backstoryIndex];
    const slideImg = images[slideKey];

    // Fade in/out alpha for the whole slide
    const alphaIn = clamp(elapsed / BACKSTORY_FADE_MS, 0, 1);
    const alphaOut = clamp((BACKSTORY_SLIDE_MS - elapsed) / BACKSTORY_FADE_MS, 0, 1);
    const slideAlpha = Math.min(alphaIn, alphaOut);

    // Draw background image with fade
    ctx.save();
    ctx.globalAlpha = slideAlpha;
    if (slideImg && slideImg.complete && !slideImg.loadFailed) {
        ctx.drawImage(slideImg, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.restore();

    // Cinematic letterbox bars (full alpha)
    const barH = 60;
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, barH);
    ctx.fillRect(0, canvas.height - barH, canvas.width, barH);

    // Draw slide caption with typewriter effect
    if (backstoryIndex >= 0 && backstoryIndex < backstoryCaptions.length) {
        const captionFull = backstoryCaptions[backstoryIndex] || '';
        const charsVisible = Math.min(
            captionFull.length,
            Math.max(0, Math.floor((elapsed - BACKSTORY_FADE_MS) / TYPEWRITER_SPEED))
        );
        const caption = captionFull.substring(0, charsVisible);

        const margin = 40;
        const maxWidth = canvas.width - margin * 2;
        const lineHeight = 24;
        ctx.font = "18px 'Press Start 2P'";
        ctx.textAlign = 'center';
        const lines = wrapText(ctx, caption, maxWidth);
        const padding = 12;
        const boxHeight = Math.max(lineHeight + padding * 2, lines.length * lineHeight + padding * 2);
        const boxY = canvas.height - boxHeight - 80;

        // Background box (slightly transparent, following slide alpha)
        ctx.save();
        ctx.globalAlpha = slideAlpha * 0.95;
        ctx.fillStyle = 'black';
        ctx.fillRect(margin, boxY, canvas.width - margin * 2, boxHeight);
        ctx.restore();

        ctx.fillStyle = 'white';
        lines.forEach((line, idx) => {
            ctx.fillText(line, canvas.width / 2, boxY + padding + (idx + 0.8) * lineHeight);
        });
    }

    // Advance to next slide
    if (elapsed > BACKSTORY_SLIDE_MS) {
        if (backstoryIndex < backstorySlides.length) {
            backstoryIndex++;
            lastSlideChange = now;
        }
    }

    // Hints
    if (backstoryIndex < backstorySlides.length) {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = "14px 'Press Start 2P'";
        ctx.textAlign = 'left';
        ctx.fillText('Enter: pular', 16, canvas.height - 16);
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
    updateScoreUI();
    comboMultiplier = 1.0; comboExpireAt = 0; refreshComboUI();
    // Set desired position, then ensure it's safe after level load
    player.x = canvas.width / 2 - 25;
    player.y = canvas.height - 60;
    player.health = player.maxHealth;
    player.hasSpear = false;
    player.isInvincible = false;
    player.speed = player.baseSpeed;
    currentLevelIndex = 0;
    loadLevel(currentLevelIndex);
    ensurePlayerSafeSpawn();
    bombs = [];
    lastBombTime = 0;
    projectiles = []; enemyProjectiles = []; muzzleFlashes = [];
    particles = []; floatingTexts = [];
    isPaused = false; timeScale = 1.0; timeScaleUntil = 0; shakeTime = 0; shakeMag = 0;
    hpOnKill = 0; comboExtraMs = 0; availableUpgrades = []; upgradeChosen = false;
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
    const now = Date.now();
    const frameMs = now - lastFrameTime; // ms
    lastFrameTime = now;
    if (timeScaleUntil && now >= timeScaleUntil) timeScale = 1.0;

    // Combo decay
    if (comboExpireAt && now > comboExpireAt) {
        comboMultiplier = 1.0;
        comboExpireAt = 0;
        refreshComboUI();
    }

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
            drawLevelClear();
            break;
        case 'GAME_WON':
            drawScreen('VOCÊ VENCEU!', 'Pressione Enter para reiniciar');
            break;
        case 'PLAYING':
        case 'BOSS_FIGHT': {
            if (!isPaused) {
                updateParallax(frameMs / 16.67);
                updatePlayerPosition();
                if (gameState === 'PLAYING') updateEnemies();
                updateBoss();
                updateBombs();
                updateProjectiles();
                updateEnemyProjectiles();
                updateParticles();
                updateFloatingTexts();
                checkCollisions();
                checkWinCondition();
            }

            // Screen shake
            let sx = 0, sy = 0;
            if (shakeTime > 0) {
                sx = (Math.random() - 0.5) * 2 * shakeMag;
                sy = (Math.random() - 0.5) * 2 * shakeMag;
                shakeTime -= frameMs;
                if (shakeTime <= 0) { shakeTime = 0; shakeMag = 0; }
            }

            ctx.save();
            ctx.translate(sx, sy);
            drawParallax();
            drawObstacles();
            drawEntities(enemies, (enemy) => {
                drawHealthBar(enemy.x, enemy.y - 10, enemy.width, 5, enemy.health, enemy.maxHealth, '#90ee90');
            });
            drawEntities(powerUps);
            if (gameState === 'BOSS_FIGHT') drawEntities([boss]);
            drawBombs();
            drawProjectiles();
            drawEnemyProjectiles();
            drawPlayer();
            drawMuzzleFlashes();
            ctx.restore();

            drawHealthBar(10, 10, 200, 20, player.health, player.maxHealth, '#ff0000');
            if (gameState === 'BOSS_FIGHT') drawHealthBar(canvas.width / 2 - 150, 15, 300, 25, boss.health, boss.maxHealth, '#c300ff');

            drawParticles();
            drawFloatingTexts();
            drawVignette();

            if (isPaused) {
                ctx.save();
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = 'white';
                ctx.textAlign = 'center';
                ctx.font = "28px 'Press Start 2P'";
                ctx.fillText('PAUSADO', canvas.width / 2, canvas.height / 2);
                ctx.restore();
            }
            break;
        }
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
    ensureAudio();

    lastSlideChange = Date.now();
    gameLoop();
}, { once: true });
