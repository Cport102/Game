/*
How to run:
1) Keep index.html, style.css, and game.js in the same folder.
2) Put your character sprite at assets/Andrea.png.
3) Open index.html in a modern browser (Chrome/Firefox/Safari).
*/

(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const soundBtn = document.getElementById("soundToggle");
  const MODES = {
    START: "START",
    RUNNING: "RUNNING",
    CHASE_MODE: "CHASE_MODE",
    GAME_OVER: "GAME_OVER",
    WIN: "WIN",
  };

  const state = {
    mode: MODES.START, // START | RUNNING | CHASE_MODE | GAME_OVER | WIN
    score: 0, // percentage points, e.g. 1.23 => 1.23%
    best: Number(localStorage.getItem("dinoBestScore") || 0),
    worldSpeed: 360,
    speedGain: 0,
    spawnTimer: 0,
    spawnMin: 1.1,
    spawnMax: 1.9,
    obstacles: [],
    birds: [],
    birdSpawnTimer: 0,
    birdSpawnMin: 7.5,
    birdSpawnMax: 13,
    birdObstacleLockTimer: 0,
    birdWasActive: false,
    clouds: [],
    groundOffset: 0,
    soundOn: false,
    lastTs: 0,
    initialized: false,
    messageText: "",
    messageTimer: 0,
    defaultPlayerX: 0,
  };

  const sizes = {
    w: window.innerWidth,
    h: window.innerHeight,
    dpr: Math.max(1, Math.min(2, window.devicePixelRatio || 1)),
    groundY: 0,
    laneH: 0,
  };

  const player = {
    x: 0,
    y: 0,
    w: 44,
    h: 48,
    vy: 0,
    gravity: 2400,
    jumpImpulse: 860,
    grounded: true,
    fastFallMul: 1.75,
  };

  const sprite = {
    image: new Image(),
    loaded: false,
    failed: false,
    // Replace this path with a different image file in /assets if needed.
    src: "assets/Andrea.png",
  };

  const birdFace = {
    image: new Image(),
    loaded: false,
    failed: false,
    // Replace this path with a different bird face image in /assets if needed.
    src: "assets/Max.JPG",
  };

  const chaserFace = {
    image: new Image(),
    loaded: false,
    failed: false,
    // Replace this path with a different chaser face image in /assets if needed.
    src: "assets/Chris.png",
  };

  const obstaclePresets = [
    { w: 26, h: 42 },
    { w: 36, h: 56 },
    { w: 48, h: 76 },
    { w: 62, h: 64 },
  ];

  const keys = {
    down: false,
  };

  const doubleJump = {
    active: false,
    used: false,
  };

  const chase = {
    triggeredThisRun: false,
    pending: false,
    returning: false,
    returnTimer: 0,
    duration: 5,
    timer: 0,
    overlayTimer: 0,
    mashSpeed: 0,
    mashBoost: 360,
    mashDecay: 560,
    maxMashSpeed: 1100,
    lead: 0,
    maxLead: 150,
    particleTimer: 0,
    particles: [],
    chaser: {
      x: -80,
      y: 0,
      w: 44,
      h: 62,
      tripped: false,
      tripTimer: 0,
      angle: 0,
    },
  };

  // Optional audio stub (simple WebAudio beeps when enabled).
  let audioCtx = null;
  function playBeep(freq, duration = 0.07, type = "square", gain = 0.03) {
    if (!state.soundOn) return;
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + duration);
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function syncPlayerSize() {
    const baseH = Math.max(56, Math.min(82, Math.floor(sizes.h * 0.1)));

    if (sprite.loaded && sprite.image.naturalWidth > 0 && sprite.image.naturalHeight > 0) {
      const aspect = sprite.image.naturalWidth / sprite.image.naturalHeight;
      const h = baseH;
      const headH = h * 0.42;
      const headW = headH * aspect;
      let w = Math.max(h * 0.42, headW * 1.15);

      const maxW = Math.max(62, Math.floor(sizes.w * 0.16));
      if (w > maxW) {
        w = maxW;
      }

      player.w = Math.round(w);
      player.h = Math.round(baseH);
    } else {
      player.h = baseH;
      player.w = Math.round(baseH * 0.5);
    }

    if (state.mode !== MODES.RUNNING && state.mode !== MODES.CHASE_MODE) {
      player.y = sizes.groundY - player.h;
      player.vy = 0;
      player.grounded = true;
    }
  }

  function resize() {
    sizes.w = window.innerWidth;
    sizes.h = window.innerHeight;
    sizes.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    canvas.width = Math.floor(sizes.w * sizes.dpr);
    canvas.height = Math.floor(sizes.h * sizes.dpr);
    canvas.style.width = `${sizes.w}px`;
    canvas.style.height = `${sizes.h}px`;

    ctx.setTransform(sizes.dpr, 0, 0, sizes.dpr, 0, 0);

    sizes.laneH = Math.max(110, Math.floor(sizes.h * 0.24));
    sizes.groundY = sizes.h - sizes.laneH;

    state.defaultPlayerX = Math.max(64, Math.floor(sizes.w * 0.16));
    if (state.mode !== MODES.CHASE_MODE) {
      player.x = state.defaultPlayerX;
    }
    chase.chaser.y = sizes.groundY - chase.chaser.h;
    syncPlayerSize();
  }

  function initClouds() {
    state.clouds = [];
    const n = Math.max(5, Math.floor(sizes.w / 220));
    for (let i = 0; i < n; i += 1) {
      state.clouds.push({
        x: rand(0, sizes.w),
        y: rand(30, sizes.groundY - 90),
        r: rand(8, 20),
        speedMul: rand(0.08, 0.2),
      });
    }
  }

  function nextSpawnDelay() {
    const speedFactor = Math.min(0.42, (state.worldSpeed - 360) / 2400);
    const min = Math.max(0.45, state.spawnMin - speedFactor);
    const max = Math.max(min + 0.2, state.spawnMax - speedFactor * 1.1);
    return rand(min, max);
  }

  function nextBirdSpawnDelay() {
    const speedFactor = Math.min(2.8, (state.worldSpeed - 360) / 300);
    const min = Math.max(3.6, state.birdSpawnMin - speedFactor * 0.45);
    const max = Math.max(min + 1.6, state.birdSpawnMax - speedFactor * 0.65);
    return rand(min, max);
  }

  function showMessage(text, duration = 2.1) {
    state.messageText = text;
    state.messageTimer = duration;
  }

  function resetRun() {
    state.score = 0;
    state.worldSpeed = 360;
    state.spawnTimer = nextSpawnDelay();
    state.obstacles = [];
    state.birds = [];
    state.birdSpawnTimer = nextBirdSpawnDelay();
    state.birdObstacleLockTimer = 0;
    state.birdWasActive = false;
    state.groundOffset = 0;
    state.messageText = "";
    state.messageTimer = 0;
    doubleJump.active = false;
    doubleJump.used = false;
    chase.triggeredThisRun = false;
    chase.pending = false;
    chase.returning = false;
    chase.returnTimer = 0;
    chase.timer = 0;
    chase.overlayTimer = 0;
    chase.mashSpeed = 0;
    chase.lead = 0;
    chase.particleTimer = 0;
    chase.particles = [];
    chase.chaser.tripped = false;
    chase.chaser.tripTimer = 0;
    chase.chaser.angle = 0;
    chase.chaser.x = -chase.chaser.w - 70;
    chase.chaser.y = sizes.groundY - chase.chaser.h;
    player.x = state.defaultPlayerX;
    player.y = sizes.groundY - player.h;
    player.vy = 0;
    player.grounded = true;
    initClouds();
  }

  function startRun() {
    resetRun();
    state.mode = MODES.RUNNING;
    playBeep(540, 0.06, "triangle", 0.02);
  }

  function gameOver() {
    state.mode = MODES.GAME_OVER;
    chase.pending = false;
    chase.returning = false;
    const snapped = Math.floor(state.score * 100) / 100;
    if (snapped > state.best) {
      state.best = snapped;
      localStorage.setItem("dinoBestScore", String(snapped));
    }
    playBeep(160, 0.16, "sawtooth", 0.05);
  }

  function winGame() {
    state.mode = MODES.WIN;
    chase.pending = false;
    chase.returning = false;
    const snapped = Math.floor(state.score * 100) / 100;
    if (snapped > state.best) {
      state.best = snapped;
      localStorage.setItem("dinoBestScore", String(snapped));
    }
    playBeep(980, 0.12, "triangle", 0.03);
  }

  function jump() {
    if (!player.grounded) return false;
    player.vy = -player.jumpImpulse;
    player.grounded = false;
    playBeep(720, 0.05, "square", 0.03);
    return true;
  }

  function doubleJumpBoost() {
    player.vy = -player.jumpImpulse * 0.92;
    doubleJump.used = true;
    playBeep(920, 0.06, "triangle", 0.03);
    return true;
  }

  function birdObstacleSafeGap() {
    return Math.max(260, state.worldSpeed * 0.78);
  }

  function obstacleMinGap() {
    return Math.max(190, state.worldSpeed * 0.53);
  }

  function enforceObstacleSpacing() {
    if (state.obstacles.length < 2) return;

    const minGap = obstacleMinGap();
    state.obstacles.sort((a, b) => a.x - b.x);

    for (let i = 1; i < state.obstacles.length; i += 1) {
      const prev = state.obstacles[i - 1];
      const curr = state.obstacles[i];
      const minX = prev.x + prev.w + minGap;
      if (curr.x < minX) {
        curr.x = minX;
      }
    }
  }

  function spawnObstacle() {
    const preset = obstaclePresets[(Math.random() * obstaclePresets.length) | 0];
    const w = preset.w + rand(-3, 3);
    const h = preset.h + rand(-4, 4);
    let x = sizes.w + rand(20, 120);
    // Never allow a last-moment obstacle too close to the player.
    const minAheadOfPlayer = player.x + player.w + obstacleMinGap();
    if (x < minAheadOfPlayer) x = minAheadOfPlayer;

    // Keep a safe recovery lane after birds so landing/jump chaining stays possible.
    const safeGap = birdObstacleSafeGap();
    for (const b of state.birds) {
      const minX = b.x + b.w + safeGap;
      if (x < minX) x = minX;
    }

    state.obstacles.push({
      x,
      y: sizes.groundY - h,
      w,
      h,
      passed: false,
    });
    enforceObstacleSpacing();
  }

  function spawnBird() {
    const h = rand(30, 42);
    const w = h * rand(1.5, 1.9);
    const startY = rand(36, Math.max(70, sizes.groundY * 0.28));

    const newBird = {
      x: sizes.w + rand(80, 200),
      y: startY,
      w,
      h,
      vx: state.worldSpeed * rand(1.04, 1.18),
      vy: rand(120, 170),
      phase: "dive", // dive -> glide | climb
      cleared: false,
    };
    state.birds.push(newBird);
    state.birdWasActive = true;

    // If an obstacle is too close behind the new bird, push it back.
    const safeGap = birdObstacleSafeGap();
    for (const o of state.obstacles) {
      if (o.x >= newBird.x && o.x < newBird.x + newBird.w + safeGap) {
        o.x = newBird.x + newBird.w + safeGap + rand(18, 72);
      }
    }
    enforceObstacleSpacing();

    doubleJump.active = true;
    doubleJump.used = false;
    // Lock ground obstacle spawns while the bird sequence is active.
    state.birdObstacleLockTimer = Math.max(state.birdObstacleLockTimer, 1.35);
    state.spawnTimer = Math.max(nextSpawnDelay(), 1.25);
    showMessage("content guy incoming, double jump activated", 2.3);
  }

  function intersectsAABB(a, b, padA = 0, padB = 0) {
    return (
      a.x + padA < b.x + b.w - padB &&
      a.x + a.w - padA > b.x + padB &&
      a.y + padA < b.y + b.h - padB &&
      a.y + a.h - padA > b.y + padB
    );
  }

  function startChaseMode() {
    // State transition: RUNNING -> CHASE_MODE once score >= 5% and lane is clear.
    state.mode = MODES.CHASE_MODE;
    chase.pending = false;
    chase.timer = 0;
    chase.overlayTimer = 1.1;
    chase.mashSpeed = 0;
    chase.lead = 0;
    chase.particleTimer = 0;
    chase.particles = [];
    chase.chaser.x = -chase.chaser.w - 60;
    chase.chaser.y = sizes.groundY - chase.chaser.h;
    chase.chaser.tripped = false;
    chase.chaser.tripTimer = 0;
    chase.chaser.angle = 0;
    doubleJump.active = false;
    doubleJump.used = false;
    showMessage("CHASE!", 1.2);
  }

  function endChaseMode() {
    // State transition: CHASE_MODE -> RUNNING with a smooth return to default lane.
    state.mode = MODES.RUNNING;
    chase.triggeredThisRun = true;
    chase.returning = true;
    chase.returnTimer = 1.05;
    chase.pending = false;
    chase.mashSpeed = 0;
    chase.lead = 0;
    chase.particles = [];
    state.spawnTimer = nextSpawnDelay();
    state.birdSpawnTimer = nextBirdSpawnDelay();
  }

  function updateRunningMode(dt) {
    // +1.00% every 5 seconds.
    state.score += dt / 5;
    if (state.score >= 10) {
      state.score = 10;
      winGame();
      return;
    }

    if (state.messageTimer > 0) {
      state.messageTimer = Math.max(0, state.messageTimer - dt);
    }
    if (state.birdObstacleLockTimer > 0) {
      state.birdObstacleLockTimer = Math.max(0, state.birdObstacleLockTimer - dt);
    }

    state.groundOffset = (state.groundOffset + state.worldSpeed * dt) % 44;

    // Player physics.
    const fallMul = keys.down && !player.grounded ? player.fastFallMul : 1;
    player.vy += player.gravity * fallMul * dt;
    player.y += player.vy * dt;

    const floorY = sizes.groundY - player.h;
    if (player.y >= floorY) {
      player.y = floorY;
      player.vy = 0;
      player.grounded = true;
    }

    // Smoothly restore default camera position after chase.
    if (chase.returning) {
      chase.returnTimer = Math.max(0, chase.returnTimer - dt);
      const pull = Math.min(1, dt * 8);
      player.x += (state.defaultPlayerX - player.x) * pull;
      if (Math.abs(player.x - state.defaultPlayerX) < 0.6 || chase.returnTimer <= 0) {
        player.x = state.defaultPlayerX;
        chase.returning = false;
      }
    }

    // Clouds parallax.
    for (const c of state.clouds) {
      c.x -= state.worldSpeed * c.speedMul * dt;
      if (c.x < -c.r * 3) {
        c.x = sizes.w + rand(10, 80);
        c.y = rand(30, sizes.groundY - 90);
      }
    }

    // Stop spawning before chase trigger and during return transition.
    const allowSpawns = !chase.pending && !chase.returning;
    const allowGroundObstacleSpawn = allowSpawns && state.birds.length === 0 && state.birdObstacleLockTimer <= 0;
    if (allowGroundObstacleSpawn) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnObstacle();
        state.spawnTimer = nextSpawnDelay();
      }
    }

    const playerHitbox = { x: player.x, y: player.y, w: player.w, h: player.h };
    const hitPad = 6;

    for (let i = state.obstacles.length - 1; i >= 0; i -= 1) {
      const o = state.obstacles[i];
      o.x -= state.worldSpeed * dt;

      if (o.x + o.w < -20) {
        state.obstacles.splice(i, 1);
        continue;
      }

      if (intersectsAABB(playerHitbox, o, hitPad, 2)) {
        gameOver();
        return;
      }

      if (!o.passed && o.x + o.w < player.x) {
        o.passed = true;
      }
    }

    enforceObstacleSpacing();

    if (allowSpawns) {
      state.birdSpawnTimer -= dt;
      if (state.birdSpawnTimer <= 0) {
        spawnBird();
        state.birdSpawnTimer = nextBirdSpawnDelay();
      }
    }

    for (let i = state.birds.length - 1; i >= 0; i -= 1) {
      const b = state.birds[i];

      b.vx = Math.max(b.vx, state.worldSpeed * 1.04);
      b.x -= b.vx * dt;

      if (b.phase === "dive") {
        b.y += b.vy * dt;
        const diveFloor = sizes.groundY - player.h * 0.9;
        if (b.y >= diveFloor) {
          b.y = diveFloor;
          b.phase = "glide";
          b.vy = 0;
        }
      } else if (b.phase === "climb") {
        b.y += b.vy * dt;
        b.vy += 220 * dt;
      }

      if (!b.cleared && b.x + b.w < player.x) {
        b.cleared = true;
        const jumpedOverBird = player.y + player.h < b.y + b.h * 0.42;
        if (jumpedOverBird) {
          b.phase = "climb";
          b.vy = -(190 + state.worldSpeed * 0.2);
          b.vx = Math.max(b.vx, state.worldSpeed * 1.12);
          playBeep(840, 0.04, "triangle", 0.02);
        }
      }

      if (intersectsAABB(playerHitbox, b, hitPad, 3)) {
        gameOver();
        return;
      }

      const safeGap = birdObstacleSafeGap();
      const minObstacleX = b.x + b.w + safeGap;
      for (const o of state.obstacles) {
        if (o.x >= b.x && o.x < minObstacleX) {
          o.x = minObstacleX + rand(12, 56);
        }
      }
      enforceObstacleSpacing();

      if (b.x + b.w < -50 || b.y < -b.h * 2) {
        state.birds.splice(i, 1);
      }
    }

    if (state.birds.length === 0) {
      doubleJump.active = false;
      doubleJump.used = false;
      // Apply short recovery lockout only once when birds have just cleared.
      if (state.birdWasActive) {
        state.birdObstacleLockTimer = Math.max(state.birdObstacleLockTimer, 0.55);
        state.spawnTimer = Math.max(nextSpawnDelay(), 1.0);
        state.birdWasActive = false;
      }
    }

    // Trigger chase once per run when IRR reaches 5%.
    if (!chase.triggeredThisRun && !chase.pending && state.score >= 5) {
      chase.pending = true;
      showMessage("CHASE incoming - clear the lane!", 1.5);
    }

    // Transition only after existing hazards have fully cleared.
    if (chase.pending && state.obstacles.length === 0 && state.birds.length === 0) {
      startChaseMode();
    }
  }

  function updateChaseMode(dt) {
    // CHASE_MODE timer: exactly 5 seconds of mash gameplay before guaranteed escape.
    chase.timer += dt;
    state.score += dt / 5;
    if (state.score >= 10) {
      state.score = 10;
      winGame();
      return;
    }

    if (state.messageTimer > 0) {
      state.messageTimer = Math.max(0, state.messageTimer - dt);
    }
    if (chase.overlayTimer > 0) {
      chase.overlayTimer = Math.max(0, chase.overlayTimer - dt);
    }

    // Mash mechanic: Space adds speed; decay removes speed when mashing stops.
    chase.mashSpeed = Math.max(0, chase.mashSpeed - chase.mashDecay * dt);
    chase.mashSpeed = Math.min(chase.maxMashSpeed, chase.mashSpeed);
    chase.lead = Math.min(chase.maxLead, chase.lead + chase.mashSpeed * dt * 0.12);
    chase.lead = Math.max(0, chase.lead - 28 * dt);

    const centerX = sizes.w * 0.5 - player.w * 0.5;
    const targetX = centerX + chase.lead;
    player.x += (targetX - player.x) * Math.min(1, dt * 9);
    player.y = sizes.groundY - player.h;
    player.vy = 0;
    player.grounded = true;

    const chaseScroll = state.worldSpeed * 1.85 + chase.mashSpeed * 0.26;
    state.groundOffset = (state.groundOffset + chaseScroll * dt) % 44;

    for (const c of state.clouds) {
      c.x -= chaseScroll * c.speedMul * 1.8 * dt;
      if (c.x < -c.r * 3) {
        c.x = sizes.w + rand(20, 120);
        c.y = rand(26, sizes.groundY - 90);
      }
    }

    // Dust trail particles (bounded array to avoid leaks).
    chase.particleTimer -= dt;
    while (chase.particleTimer <= 0) {
      chase.particles.push({
        x: player.x + player.w * 0.15 + rand(-6, 6),
        y: sizes.groundY - rand(4, 16),
        vx: -rand(90, 170),
        vy: -rand(8, 30),
        life: rand(0.24, 0.48),
        size: rand(3, 6),
      });
      chase.particleTimer += 0.026;
    }

    for (let i = chase.particles.length - 1; i >= 0; i -= 1) {
      const p = chase.particles[i];
      p.x += (p.vx - chase.mashSpeed * 0.03) * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) chase.particles.splice(i, 1);
    }
    if (chase.particles.length > 100) {
      chase.particles.splice(0, chase.particles.length - 100);
    }

    if (!chase.chaser.tripped) {
      const targetBehind = player.x - chase.chaser.w - 28 + chase.lead * 0.18;
      chase.chaser.x += (targetBehind - chase.chaser.x) * Math.min(1, dt * 2.4);
      if (intersectsAABB(player, chase.chaser, 6, 5)) {
        gameOver();
        return;
      }
    } else {
      chase.chaser.tripTimer += dt;
      chase.chaser.angle = Math.min(1.1, chase.chaser.tripTimer * 2.4);
      chase.chaser.x -= (50 + chase.chaser.tripTimer * 110) * dt;
      chase.chaser.y = sizes.groundY - chase.chaser.h + Math.min(20, chase.chaser.tripTimer * 26);

      if (chase.chaser.tripTimer >= 0.85) {
        endChaseMode();
        return;
      }
    }

    if (chase.timer >= chase.duration && !chase.chaser.tripped) {
      chase.chaser.tripped = true;
      chase.chaser.tripTimer = 0;
      showMessage("Escaped!", 1.1);
      playBeep(980, 0.08, "triangle", 0.03);
    }
  }

  function update(dt) {
    switch (state.mode) {
      case MODES.RUNNING:
        updateRunningMode(dt);
        break;
      case MODES.CHASE_MODE:
        updateChaseMode(dt);
        break;
      case MODES.START:
      case MODES.GAME_OVER:
      case MODES.WIN:
      default:
        if (state.messageTimer > 0) {
          state.messageTimer = Math.max(0, state.messageTimer - dt);
        }
        break;
    }
  }

  function drawBackground(isNight) {
    ctx.fillStyle = isNight ? "#121418" : "#f7f7f7";
    ctx.fillRect(0, 0, sizes.w, sizes.h);

    // Distant dots/stars.
    ctx.fillStyle = isNight ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.15)";
    const dotCount = 26;
    for (let i = 0; i < dotCount; i += 1) {
      const x = (i * 173 + state.groundOffset * 0.35) % (sizes.w + 60) - 30;
      const y = 25 + ((i * 67) % Math.max(40, sizes.groundY - 130));
      const s = (i % 3) + 1;
      ctx.fillRect(x, y, s, s);
    }

    // Clouds.
    ctx.fillStyle = isNight ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.13)";
    for (const c of state.clouds) {
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.r * 1.6, c.r, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGround(isNight) {
    const groundColor = isNight ? "#d9dde2" : "#1f1f1f";
    const accentColor = isNight ? "rgba(217,221,226,0.45)" : "rgba(31,31,31,0.28)";

    ctx.strokeStyle = groundColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, sizes.groundY + 1.5);
    ctx.lineTo(sizes.w, sizes.groundY + 1.5);
    ctx.stroke();

    ctx.fillStyle = accentColor;
    const seg = 22;
    const gap = 22;
    for (let x = -state.groundOffset; x < sizes.w + seg; x += seg + gap) {
      ctx.fillRect(x, sizes.groundY + 14, seg, 3);
    }
  }

  function drawPlayer(isNight) {
    const runningAnim = state.mode === MODES.RUNNING || state.mode === MODES.CHASE_MODE;
    const bob = player.grounded && runningAnim ? Math.sin(performance.now() * 0.02) * 1.2 : 0;
    const y = player.y + bob;
    const w = player.w;
    const h = player.h;

    const headZoneH = Math.round(h * 0.42);
    const torsoH = Math.round(h * 0.33);
    const legH = Math.max(8, h - headZoneH - torsoH);
    const torsoW = Math.max(10, Math.round(w * 0.44));
    const torsoX = player.x + (w - torsoW) / 2;
    const torsoY = y + headZoneH - 1;
    const hipsY = torsoY + torsoH;
    const limbColor = isNight ? "#f1f4f7" : "#1c1c1c";

    if (sprite.loaded) {
      const aspect = sprite.image.naturalWidth / sprite.image.naturalHeight;
      let headH = headZoneH;
      let headW = headH * aspect;
      const maxHeadW = w * 0.95;
      if (headW > maxHeadW) {
        headW = maxHeadW;
        headH = headW / aspect;
      }
      const headX = player.x + (w - headW) / 2;
      const headY = y + (headZoneH - headH) * 0.5;
      ctx.drawImage(sprite.image, headX, headY, headW, headH);
    } else {
      // Fallback head if sprite fails to load.
      const headColor = isNight ? "#f4f4f4" : "#1d1d1d";
      ctx.fillStyle = headColor;
      const headW = Math.max(16, Math.round(w * 0.7));
      const headH = Math.max(16, Math.round(headZoneH * 0.9));
      const headX = player.x + (w - headW) / 2;
      const headY = y + (headZoneH - headH) * 0.5;
      ctx.fillRect(headX, headY, headW, headH);
    }

    // Torso.
    ctx.fillStyle = limbColor;
    ctx.fillRect(torsoX, torsoY, torsoW, torsoH);

    // Arms.
    const armW = Math.max(4, Math.round(torsoW * 0.2));
    const armH = Math.max(7, Math.round(torsoH * 0.72));
    const armSwing = player.grounded && runningAnim ? Math.sin(performance.now() * 0.02) * 3 : 0;
    ctx.fillRect(torsoX - armW + armSwing, torsoY + 2, armW, armH);
    ctx.fillRect(torsoX + torsoW - armSwing, torsoY + 2, armW, armH);

    // Legs.
    const legW = Math.max(5, Math.round(torsoW * 0.28));
    const stride = player.grounded && runningAnim ? Math.sin(performance.now() * 0.025) * 4 : 0;
    ctx.fillRect(torsoX + torsoW * 0.18 + stride, hipsY, legW, legH);
    ctx.fillRect(torsoX + torsoW * 0.58 - stride, hipsY, legW, legH);
  }

  function drawObstacles(isNight) {
    ctx.fillStyle = isNight ? "#e7eaee" : "#212121";
    for (const o of state.obstacles) {
      ctx.fillRect(o.x, o.y, o.w, o.h);

      // Spikes/notches for silhouette.
      ctx.fillRect(o.x + 4, o.y - 8, 6, 8);
      if (o.w > 34) ctx.fillRect(o.x + o.w - 12, o.y - 10, 6, 10);
    }
  }

  function drawBirds(isNight) {
    for (const b of state.birds) {
      const bodyColor = isNight ? "#e7eaee" : "#212121";
      const wingColor = isNight ? "#ced5dc" : "#3a3a3a";
      const flap = Math.sin(performance.now() * 0.03 + b.x * 0.04) * b.h * 0.2;

      // Body.
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.ellipse(b.x + b.w * 0.55, b.y + b.h * 0.55, b.w * 0.42, b.h * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      // Wing.
      ctx.fillStyle = wingColor;
      ctx.beginPath();
      ctx.moveTo(b.x + b.w * 0.52, b.y + b.h * 0.56);
      ctx.lineTo(b.x + b.w * 0.86, b.y + b.h * 0.32 - flap);
      ctx.lineTo(b.x + b.w * 0.76, b.y + b.h * 0.72);
      ctx.closePath();
      ctx.fill();

      // Beak.
      ctx.fillStyle = isNight ? "#f3d17d" : "#bf8a2f";
      ctx.beginPath();
      ctx.moveTo(b.x + b.w * 0.02, b.y + b.h * 0.52);
      ctx.lineTo(b.x + b.w * 0.18, b.y + b.h * 0.46);
      ctx.lineTo(b.x + b.w * 0.18, b.y + b.h * 0.6);
      ctx.closePath();
      ctx.fill();

      // Face.
      const faceSize = b.h * 0.72;
      const faceX = b.x + b.w * 0.16;
      const faceY = b.y + b.h * 0.16;
      if (birdFace.loaded) {
        ctx.drawImage(birdFace.image, faceX, faceY, faceSize, faceSize);
      } else {
        ctx.fillStyle = isNight ? "#fafafa" : "#111111";
        ctx.fillRect(faceX, faceY, faceSize, faceSize);
      }
    }
  }

  function drawChaseEffects(isNight) {
    if (state.mode !== MODES.CHASE_MODE) return;

    // Motion blur behind the player.
    const blurAlpha = Math.min(0.24, 0.08 + chase.mashSpeed / 6000);
    ctx.fillStyle = isNight ? `rgba(230,236,241,${blurAlpha})` : `rgba(30,30,30,${blurAlpha})`;
    ctx.fillRect(player.x - 38 - chase.lead * 0.06, player.y + 8, 36 + chase.lead * 0.08, player.h - 14);

    // Dust trail particles.
    for (const p of chase.particles) {
      ctx.fillStyle = isNight ? "rgba(220,225,230,0.5)" : "rgba(45,45,45,0.35)";
      ctx.fillRect(p.x, p.y, p.size, p.size * 0.72);
    }

    // Chaser.
    ctx.save();
    ctx.translate(chase.chaser.x + chase.chaser.w * 0.5, chase.chaser.y + chase.chaser.h * 0.8);
    ctx.rotate(chase.chaser.angle);
    ctx.translate(-chase.chaser.w * 0.5, -chase.chaser.h * 0.8);
    // Draw body first so the face can be layered above it.
    ctx.fillStyle = isNight ? "#f2f2f2" : "#202020";
    ctx.fillRect(0, 16, chase.chaser.w, chase.chaser.h - 16);
    ctx.fillStyle = isNight ? "#121212" : "#efefef";
    ctx.fillRect(6, chase.chaser.h - 13, 10, 13);
    ctx.fillRect(chase.chaser.w - 16, chase.chaser.h - 13, 10, 13);
    const faceX = 6;
    const faceY = -2;
    const faceW = chase.chaser.w - 12;
    const faceH = 24;
    if (chaserFace.loaded) {
      ctx.drawImage(chaserFace.image, faceX, faceY, faceW, faceH);
    } else {
      ctx.fillStyle = isNight ? "#f0b39c" : "#6f3f32";
      ctx.fillRect(faceX, faceY, faceW, faceH);
    }
    ctx.restore();

    if (chase.overlayTimer > 0) {
      const alpha = Math.min(1, chase.overlayTimer / 0.25);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = isNight ? `rgba(245,245,245,${alpha})` : `rgba(30,30,30,${alpha})`;
      ctx.font = "800 44px 'Trebuchet MS', 'Segoe UI', sans-serif";
      ctx.fillText("CHASE!", sizes.w * 0.5, sizes.h * 0.22);
      ctx.font = "700 18px 'Trebuchet MS', 'Segoe UI', sans-serif";
      ctx.fillText("Mash SPACE to accelerate", sizes.w * 0.5, sizes.h * 0.27);
    }

    // Persistent flashing chase instruction.
    const flashAlpha = 0.35 + (Math.sin(performance.now() * 0.018) * 0.5 + 0.5) * 0.65;
    const pw = Math.min(sizes.w - 44, 440);
    const ph = 36;
    const px = (sizes.w - pw) / 2;
    const py = 18;
    ctx.fillStyle = isNight ? `rgba(240,245,250,${0.16 * flashAlpha})` : `rgba(20,20,20,${0.14 * flashAlpha})`;
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = isNight ? `rgba(238,244,250,${0.8 * flashAlpha})` : `rgba(18,18,18,${0.7 * flashAlpha})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 16px 'Trebuchet MS', 'Segoe UI', sans-serif";
    ctx.fillStyle = isNight ? `rgba(245,248,252,${flashAlpha})` : `rgba(24,24,24,${flashAlpha})`;
    ctx.fillText("tap rapidly to escape", sizes.w / 2, py + ph / 2 + 0.5);
  }

  function drawHud(isNight) {
    const scoreDisplay = (Math.floor(state.score * 100) / 100).toFixed(2);
    const bestDisplay = (Math.floor(state.best * 100) / 100).toFixed(2);

    ctx.fillStyle = isNight ? "#f3f3f3" : "#1c1c1c";
    ctx.font = "700 20px 'Trebuchet MS', 'Segoe UI', sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(`IRR ${scoreDisplay}%`, sizes.w - 18, 14);

    ctx.font = "600 16px 'Trebuchet MS', 'Segoe UI', sans-serif";
    ctx.fillStyle = isNight ? "rgba(243,243,243,0.85)" : "rgba(28,28,28,0.78)";
    ctx.fillText(`Best IRR ${bestDisplay}%`, sizes.w - 18, 39);
  }

  function drawMessage(isNight) {
    if (state.messageTimer <= 0 || !state.messageText) return;

    const alpha = Math.min(1, state.messageTimer / 0.4);
    const w = Math.min(sizes.w - 28, 540);
    const h = 44;
    const x = (sizes.w - w) / 2;
    const y = 16;

    ctx.fillStyle = isNight ? `rgba(18,21,26,${0.78 * alpha})` : `rgba(255,255,255,${0.82 * alpha})`;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = isNight ? `rgba(230,236,242,${0.72 * alpha})` : `rgba(20,20,20,${0.5 * alpha})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 16px 'Trebuchet MS', 'Segoe UI', sans-serif";
    ctx.fillStyle = isNight ? `rgba(244,248,252,${alpha})` : `rgba(22,22,22,${alpha})`;
    ctx.fillText(state.messageText, sizes.w / 2, y + h / 2 + 0.5);

    // Flash helper during bird windows where double jump is available.
    if (state.mode === MODES.RUNNING && doubleJump.active && state.birds.length > 0) {
      const flashAlpha = 0.35 + (Math.sin(performance.now() * 0.018) * 0.5 + 0.5) * 0.65;
      const fw = Math.min(sizes.w - 40, 420);
      const fh = 34;
      const fx = (sizes.w - fw) / 2;
      const fy = y + h + 10;

      ctx.fillStyle = isNight ? `rgba(240,245,250,${0.18 * flashAlpha})` : `rgba(15,15,15,${0.16 * flashAlpha})`;
      ctx.fillRect(fx, fy, fw, fh);
      ctx.strokeStyle = isNight ? `rgba(238,244,250,${0.82 * flashAlpha})` : `rgba(20,20,20,${0.72 * flashAlpha})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(fx + 0.5, fy + 0.5, fw - 1, fh - 1);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "700 15px 'Trebuchet MS', 'Segoe UI', sans-serif";
      ctx.fillStyle = isNight ? `rgba(245,248,252,${flashAlpha})` : `rgba(20,20,20,${flashAlpha})`;
      ctx.fillText("double tap to double jump", sizes.w / 2, fy + fh / 2 + 0.5);
    }
  }

  function drawCenterText(title, subtitle, isNight) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillStyle = isNight ? "rgba(16,18,22,0.45)" : "rgba(255,255,255,0.55)";
    ctx.fillRect(0, 0, sizes.w, sizes.h);

    ctx.fillStyle = isNight ? "#f3f3f3" : "#1a1a1a";
    ctx.font = "700 38px 'Trebuchet MS', 'Segoe UI', sans-serif";
    ctx.fillText(title, sizes.w / 2, sizes.h * 0.44);

    ctx.font = "600 19px 'Trebuchet MS', 'Segoe UI', sans-serif";
    ctx.fillStyle = isNight ? "rgba(243,243,243,0.9)" : "rgba(26,26,26,0.86)";
    ctx.fillText(subtitle, sizes.w / 2, sizes.h * 0.52);
  }

  function drawLoadingScreen() {
    ctx.fillStyle = "#f7f7f7";
    ctx.fillRect(0, 0, sizes.w, sizes.h);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "700 32px 'Trebuchet MS', 'Segoe UI', sans-serif";
    ctx.fillText("Loading sprite...", sizes.w / 2, sizes.h * 0.46);
    ctx.font = "600 17px 'Trebuchet MS', 'Segoe UI', sans-serif";
    ctx.fillStyle = "rgba(26,26,26,0.8)";
    ctx.fillText("Expected heads: assets/Andrea.png and assets/Max.JPG", sizes.w / 2, sizes.h * 0.53);
  }

  function render() {
    const isNight = Math.floor(state.score / 1) % 2 === 1;

    ctx.save();
    if (state.mode === MODES.CHASE_MODE) {
      const intensity = 1.3 + Math.min(2.5, chase.mashSpeed / 250);
      ctx.translate(rand(-intensity, intensity), rand(-intensity, intensity));
    }

    drawBackground(isNight);
    drawGround(isNight);
    drawObstacles(isNight);
    drawBirds(isNight);
    drawPlayer(isNight);
    drawChaseEffects(isNight);
    ctx.restore();

    drawHud(isNight);
    drawMessage(isNight);

    if (state.mode === MODES.START) {
      drawCenterText("Press Space to start", "Jump with Space or Up", isNight);
    } else if (state.mode === MODES.GAME_OVER) {
      drawCenterText("Game Over", "Press Space to restart or click", isNight);
    } else if (state.mode === MODES.WIN) {
      drawCenterText("congratulations, you cleared the carry hurdle", "Press Space to restart or click", isNight);
    }
  }

  function frame(ts) {
    if (!state.lastTs) state.lastTs = ts;
    let dt = (ts - state.lastTs) / 1000;
    state.lastTs = ts;

    // Clamp dt to avoid giant simulation jumps after tab switches.
    dt = Math.min(0.05, Math.max(0, dt));

    update(dt);
    render();

    requestAnimationFrame(frame);
  }

  function bootGame() {
    if (state.initialized) return;
    state.initialized = true;
    resize();
    resetRun();
    state.mode = MODES.START;
    requestAnimationFrame(frame);
  }

  function onJumpAction() {
    if (!state.initialized) return;

    if (state.mode === MODES.START) {
      startRun();
      return;
    }
    if (state.mode === MODES.GAME_OVER || state.mode === MODES.WIN) {
      startRun();
      return;
    }
    if (state.mode === MODES.RUNNING) {
      jump();
    }
  }

  function handleSpaceInput() {
    if (!state.initialized) return;

    if (state.mode === MODES.START || state.mode === MODES.GAME_OVER || state.mode === MODES.WIN) {
      onJumpAction();
      return;
    }

    if (state.mode === MODES.CHASE_MODE) {
      chase.mashSpeed = Math.min(chase.maxMashSpeed, chase.mashSpeed + chase.mashBoost);
      playBeep(640 + Math.min(250, chase.mashSpeed * 0.12), 0.025, "square", 0.015);
      return;
    }

    if (state.mode !== MODES.RUNNING) return;

    if (player.grounded) {
      jump();
      return;
    }

    // True consecutive double jump: second press while airborne, only while a bird is on screen.
    if (!player.grounded && state.birds.length > 0 && doubleJump.active && !doubleJump.used) {
      doubleJumpBoost();
    }
  }

  window.addEventListener("keydown", (e) => {
    const code = e.code;

    if (code === "Space" || code === "ArrowUp" || code === "ArrowDown") {
      e.preventDefault();
    }

    if (e.repeat) return;

    if (code === "Space" || code === "ArrowUp") {
      if (!state.initialized) return;

      if (code === "Space") {
        handleSpaceInput();
        return;
      }

      // Up Arrow keeps normal behavior (no airborne double jump).
      if (state.mode === MODES.START || state.mode === MODES.GAME_OVER || state.mode === MODES.WIN) {
        onJumpAction();
        return;
      }
      if (state.mode === MODES.RUNNING) {
        jump();
      }
    }

    if (code === "ArrowDown") {
      keys.down = true;
    }
  }, { passive: false });

  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowDown") {
      keys.down = false;
    }
  });

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    handleSpaceInput();
  }, { passive: false });

  soundBtn.addEventListener("click", () => {
    state.soundOn = !state.soundOn;
    soundBtn.textContent = `Sound: ${state.soundOn ? "On" : "Off"}`;
    soundBtn.setAttribute("aria-pressed", String(state.soundOn));
    if (state.soundOn) playBeep(520, 0.04, "triangle", 0.02);
  });

  window.addEventListener("resize", () => {
    resize();
    initClouds();
  });

  function initSprite() {
    sprite.image.addEventListener("load", () => {
      sprite.loaded = true;
      sprite.failed = false;
      syncPlayerSize();
      bootGame();
    }, { once: true });

    sprite.image.addEventListener("error", () => {
      sprite.loaded = false;
      sprite.failed = true;
      console.warn(`Sprite failed to load at ${sprite.src}. Using rectangle fallback.`);
      syncPlayerSize();
      bootGame();
    }, { once: true });

    sprite.image.src = sprite.src;
  }

  function initBirdFace() {
    birdFace.image.addEventListener("load", () => {
      birdFace.loaded = true;
      birdFace.failed = false;
    }, { once: true });

    birdFace.image.addEventListener("error", () => {
      birdFace.loaded = false;
      birdFace.failed = true;
      console.warn(`Bird face failed to load at ${birdFace.src}. Using bird fallback face.`);
    }, { once: true });

    birdFace.image.src = birdFace.src;
  }

  function initChaserFace() {
    chaserFace.image.addEventListener("load", () => {
      chaserFace.loaded = true;
      chaserFace.failed = false;
    }, { once: true });

    chaserFace.image.addEventListener("error", () => {
      chaserFace.loaded = false;
      chaserFace.failed = true;
      console.warn(`Chaser face failed to load at ${chaserFace.src}. Using fallback face.`);
    }, { once: true });

    chaserFace.image.src = chaserFace.src;
  }

  resize();
  drawLoadingScreen();
  initBirdFace();
  initChaserFace();
  initSprite();
})();
