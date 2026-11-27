/* Ball Crash — rotate the tower, drop the ball, crash through everything. */
(() => {
  'use strict';

  // ---------- Tunables ----------
  const TAU = Math.PI * 2;
  const SEGMENTS = 12;
  const SEG_A = TAU / SEGMENTS;
  const R_IN = 0.9;            // platform inner radius (hidden by the pole)
  const R_OUT = 3.0;           // platform outer radius
  const PLAT_H = 0.34;         // platform thickness
  const SPACING = 3.4;         // vertical distance between platforms
  const BALL_R = 0.3;
  const BALL_Z = 1.95;         // ball's distance from the tower axis
  const GRAVITY = 32;
  const BOUNCE_V = 11.5;
  const MAX_FALL = 20;
  const FIRE_STREAK = 3;       // gaps in a row (no bounce) needed for fireball
  const FIRE_TIME = 1.25;      // seconds of fireball fuel
  const FIRE_REFILL = 0.35;    // fuel gained per gap passed while on fire
  const STEP = 1 / 120;        // physics timestep
  const DRAG_SPEED = 0.011;    // radians per pixel
  const KEY_SPEED = 3.4;       // radians per second

  const SAFE = 0, GAP = 1, HAZ = 2;

  const THEMES = [
    { bg: ['#1b1340', '#3b1f6b'], safe: 0x7c5cff, pole: 0xf1eaff, ball: 0xffd23f, fog: 0x2e1c5c },
    { bg: ['#05263b', '#0b5470'], safe: 0x19c3b5, pole: 0xe8fbff, ball: 0xfff275, fog: 0x0a3d57 },
    { bg: ['#2a1a05', '#6b3d0b'], safe: 0xffa630, pole: 0xfff4e0, ball: 0x7df9ff, fog: 0x4d2c08 },
    { bg: ['#0b2b12', '#1d6b34'], safe: 0x8ce36a, pole: 0xf0ffe8, ball: 0xff7ad9, fog: 0x154d24 },
    { bg: ['#2b0b2e', '#5e1a63'], safe: 0xff7ad9, pole: 0xfff0fd, ball: 0x8cf5ff, fog: 0x451548 },
    { bg: ['#101a2e', '#2a3f66'], safe: 0xdfe7f5, pole: 0x8fb3ff, ball: 0xffb347, fog: 0x1f2f4f },
  ];

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ui = {
    lvCur: $('lvCur'), lvNext: $('lvNext'), prog: $('prog'), score: $('score'), best: $('best'),
    fire: $('fire'), fuel: $('fuel'), popups: $('popups'), mute: $('mute'),
    overlay: $('overlay'), ovTitle: $('ovTitle'), ovText: $('ovText'), ovStats: $('ovStats'), ovBtn: $('ovBtn'),
  };

  const store = {
    get(k, d) { try { const v = localStorage.getItem('ballcrash.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('ballcrash.' + k, JSON.stringify(v)); } catch { /* ignore */ } },
  };

  // ---------- Renderer / scene ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 13, 32);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2040, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 24 });
  sun.shadow.bias = -0.002;
  scene.add(sun, sun.target);

  const tower = new THREE.Group();
  scene.add(tower);

  // ---------- Materials / geometry ----------
  const mats = {
    safe: new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05 }),
    haz: new THREE.MeshStandardMaterial({ color: 0x1a0308, emissive: 0xff1030, emissiveIntensity: 0.6, roughness: 0.35 }),
    spike: new THREE.MeshStandardMaterial({ color: 0x220508, emissive: 0xff3050, emissiveIntensity: 0.9, roughness: 0.3 }),
    finishA: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.12, roughness: 0.3 }),
    finishB: new THREE.MeshStandardMaterial({ roughness: 0.3, emissiveIntensity: 0.2 }),
    pole: new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.1 }),
    ball: new THREE.MeshStandardMaterial({ roughness: 0.22, metalness: 0.05, emissive: 0xff5a00, emissiveIntensity: 0 }),
    splat: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  };

  function makeSegmentGeometry() {
    const bevel = 0.06;
    const pad = 0.014;
    const rIn = R_IN + bevel, rOut = R_OUT - bevel;
    const a0 = pad + bevel / R_OUT, a1 = SEG_A - pad - bevel / R_OUT;
    const steps = 8;
    const pts = [];
    // Shape (sx, sy) maps to world (x, z) after rotateX; world angle = atan2(x, z).
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (a1 - a0) * (i / steps);
      pts.push(new THREE.Vector2(Math.sin(a) * rOut, Math.cos(a) * rOut));
    }
    for (let i = steps; i >= 0; i--) {
      const a = a0 + (a1 - a0) * (i / steps);
      pts.push(new THREE.Vector2(Math.sin(a) * rIn, Math.cos(a) * rIn));
    }
    const depth = PLAT_H - bevel * 2;
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
      depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 1,
    });
    geo.rotateX(Math.PI / 2);           // extrusion now points down (-y)
    geo.translate(0, depth / 2, 0);     // center vertically: spans ±PLAT_H/2
    return geo;
  }

  const geos = {
    seg: makeSegmentGeometry(),
    spike: new THREE.ConeGeometry(0.17, 0.55, 8),
    ball: new THREE.SphereGeometry(BALL_R, 32, 20),
    splat: new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2),
    spark: new THREE.SphereGeometry(0.16, 8, 6),
    chip: new THREE.SphereGeometry(0.09, 6, 4),
    confetti: new THREE.BoxGeometry(0.14, 0.04, 0.22),
  };

  // ---------- Ball ----------
  const ballMesh = new THREE.Mesh(geos.ball, mats.ball);
  ballMesh.castShadow = true;
  scene.add(ballMesh);
  const ballColor = new THREE.Color();
  const fireColor = new THREE.Color(0xff6a1a);

  const ball = { y: 0, vy: 0, squash: 0, visible: true };

  // ---------- Game state ----------
  let state = 'menu';          // menu | play | dead | clear
  let level = store.get('level', 1);
  let best = store.get('best', 0);
  let score = 0;
  let streak = 0;
  let fire = false;
  let fuel = 0;
  let towerRot = 0;
  let platforms = [];
  let nextIdx = 0;
  let pole = null;
  let theme = THEMES[0];
  let camY = 0;
  let shake = 0;
  let time = 0;
  const splats = [];
  const debris = [];

  // ---------- Level building ----------
  const rand = (n) => Math.floor(Math.random() * n);

  // ---------- Difficulty ----------
  // One smooth curve drives everything: 0 at level 1, ~0.5 at level 10, ~0.75 at level 20, then levels off.
  const difficulty = (n) => 1 - Math.exp(-(n - 1) / 14);
  // Rounds x up or down at random so the average is exactly x (2.3 -> 2 most of the time, 3 sometimes).
  const roundRandom = (x) => Math.floor(x) + (Math.random() < x - Math.floor(x) ? 1 : 0);

  function levelSettings(n) {
    const d = difficulty(n);
    return {
      platforms: Math.min(12 + n, 40),
      hazards: 0.5 + d * 3.5,                         // average red segments per platform (out of 12)
      narrowGap: n < 6 ? 0 : Math.min(0.35, d * 0.45), // chance a gap is only one segment wide
      spin: n < 6 ? 0 : Math.min(0.3, d * 0.4),        // chance a platform spins on its own
      spinSpeed: 0.25 + d * 0.45,
    };
  }

  // Segments of a new platform that sit directly under the gaps of the platform above it.
  // These never get hazards, so dropping through a gap can't land you straight on spikes.
  function segmentsUnderGaps(prev, rot) {
    const out = new Set();
    if (!prev || prev.spin) return out;
    prev.types.forEach((type, g) => {
      if (type !== GAP) return;
      for (const f of [0.02, 0.5, 0.98]) {
        out.add(Math.floor(wrap((g + f) * SEG_A + prev.baseRot - rot) / SEG_A) % SEGMENTS);
      }
    });
    return out;
  }

  function genTypes(i, cfg, count, protect) {
    const t = new Array(SEGMENTS).fill(SAFE);
    let gapSize = Math.random() < cfg.narrowGap ? 1 : 2;
    if (Math.random() < 0.12) gapSize = 3;              // occasional wide gap for combos
    const gapStart = i === 0 ? 3 + rand(6) : rand(SEGMENTS);
    for (let k = 0; k < gapSize; k++) t[(gapStart + k) % SEGMENTS] = GAP;

    if (i >= 2) {
      // Ease in over the level: 70% of the level's difficulty at the top, 100% near the bottom.
      let x = cfg.hazards * (0.7 + 0.3 * i / count);
      if (Math.random() < 0.12) x *= 0.4;               // the odd breather platform
      const open = [];
      for (let s = 0; s < SEGMENTS; s++) if (t[s] === SAFE && !protect.has(s)) open.push(s);
      for (let h = Math.min(6, roundRandom(x), open.length - 1); h > 0; h--) {
        t[open.splice(rand(open.length), 1)[0]] = HAZ;
      }
    }
    return t;
  }

  function makeSegment(type, finishIdx) {
    let mat = mats.safe;
    if (type === HAZ) mat = mats.haz;
    if (finishIdx !== undefined) mat = finishIdx % 2 ? mats.finishB : mats.finishA;
    const m = new THREE.Mesh(geos.seg, mat);
    m.receiveShadow = true;
    m.castShadow = false;
    if (type === HAZ) {
      for (const r of [1.45, 2.05, 2.65]) {
        const s = new THREE.Mesh(geos.spike, mats.spike);
        s.position.set(Math.sin(SEG_A / 2) * r, PLAT_H / 2 + 0.27, Math.cos(SEG_A / 2) * r);
        m.add(s);
      }
    }
    return m;
  }

  function addPlatform(y, types, baseRot, spin, finish) {
    const group = new THREE.Group();
    group.position.y = y;
    group.rotation.y = baseRot;
    for (let s = 0; s < SEGMENTS; s++) {
      if (types[s] === GAP) continue;
      const m = makeSegment(types[s], finish ? s : undefined);
      m.rotation.y = s * SEG_A;
      m.userData.seg = s;
      group.add(m);
    }
    tower.add(group);
    platforms.push({ y, types, baseRot, spin, finish, group, smashed: false });
  }

  function applyTheme() {
    theme = THEMES[(level - 1) % THEMES.length];
    document.documentElement.style.setProperty('--bg-top', theme.bg[0]);
    document.documentElement.style.setProperty('--bg-bot', theme.bg[1]);
    document.documentElement.style.setProperty('--accent', '#' + new THREE.Color(theme.ball).getHexString());
    mats.safe.color.setHex(theme.safe);
    mats.pole.color.setHex(theme.pole);
    mats.finishB.color.setHex(theme.ball);
    mats.finishB.emissive.setHex(theme.ball);
    ballColor.setHex(theme.ball);
    mats.ball.color.copy(ballColor);
    mats.splat.color.setHex(theme.ball);
    scene.fog.color.setHex(theme.fog);
  }

  function clearLevel() {
    while (tower.children.length) tower.remove(tower.children[0]);
    for (const d of debris) scene.remove(d.obj);
    debris.length = 0;
    splats.length = 0;
    platforms = [];
    ui.popups.innerHTML = '';
  }

  function buildLevel() {
    clearLevel();
    applyTheme();
    const cfg = levelSettings(level);
    const count = cfg.platforms;
    let prev = null;
    for (let i = 0; i < count; i++) {
      const spin = i > 1 && Math.random() < cfg.spin
        ? (Math.random() < 0.5 ? -1 : 1) * cfg.spinSpeed * (0.8 + Math.random() * 0.4) : 0;
      const rot = i === 0 ? 0 : Math.random() * TAU;
      const protect = spin ? new Set() : segmentsUnderGaps(prev, rot);
      addPlatform(-i * SPACING, genTypes(i, cfg, count, protect), rot, spin, false);
      prev = platforms[platforms.length - 1];
    }
    addPlatform(-count * SPACING, new Array(SEGMENTS).fill(SAFE), 0, 0, true);

    const height = count * SPACING + 14;
    pole = new THREE.Mesh(new THREE.CylinderGeometry(R_IN + 0.02, R_IN + 0.02, height, 40), mats.pole);
    pole.position.y = -count * SPACING / 2 + 3;
    pole.receiveShadow = true;
    tower.add(pole);

    towerRot = 0;
    nextIdx = 0;
    streak = 0;
    setFire(false);
    ball.y = PLAT_H / 2 + BALL_R + 2.2;
    ball.vy = 0;
    ball.visible = true;
    ballMesh.visible = true;
    camY = 0;
    time = 0;
    ui.lvCur.textContent = level;
    ui.lvNext.textContent = level + 1;
    updateHud();
  }

  // ---------- Collision helpers ----------
  const wrap = (a) => ((a % TAU) + TAU) % TAU;
  const platformRot = (p) => p.baseRot + p.spin * time;

  function segmentUnderBall(p) {
    // Ball sits at world angle 0; convert to the platform's local angle.
    const local = wrap(-(towerRot + platformRot(p)));
    return Math.min(SEGMENTS - 1, Math.floor(local / SEG_A));
  }

  // ---------- Effects ----------
  const _v = new THREE.Vector3();
  const _q = new THREE.Quaternion();

  function popup(text, cls) {
    _v.set(0, ball.y + 0.6, BALL_Z).project(camera);
    const el = document.createElement('div');
    el.className = 'pop' + (cls ? ' ' + cls : '');
    el.textContent = text;
    el.style.left = ((_v.x + 1) / 2 * innerWidth + (Math.random() * 40 - 20)) + 'px';
    el.style.top = ((1 - _v.y) / 2 * innerHeight) + 'px';
    ui.popups.appendChild(el);
    setTimeout(() => el.remove(), 850);
  }

  function addDebris(obj, vel, spin, life, gravity = 20, fadeMats = null, shrink = false) {
    debris.push({ obj, vel, spin, life, max: life, gravity, mats: fadeMats, shrink, s0: obj.scale.x });
  }

  function fadeable(obj) {
    const list = [];
    obj.traverse((o) => {
      if (o.material) {
        o.material = o.material.clone();
        o.material.transparent = true;
        list.push(o.material);
      }
    });
    return list;
  }

  function addSplat(p) {
    const local = wrap(-(towerRot + platformRot(p)));
    const m = new THREE.Mesh(geos.splat, mats.splat);
    const s = 0.3 + Math.random() * 0.12;
    m.scale.set(s, 1, s * (0.8 + Math.random() * 0.4));
    m.rotation.y = Math.random() * TAU;
    m.position.set(Math.sin(local) * BALL_Z, PLAT_H / 2 + 0.006, Math.cos(local) * BALL_Z);
    p.group.add(m);
    splats.push(m);
    if (splats.length > 24) {
      const old = splats.shift();
      if (old.parent) old.parent.remove(old);
    }
  }

  function smashPlatform(p) {
    p.smashed = true;
    const rot = towerRot + platformRot(p);
    tower.rotation.y = towerRot;          // sync transforms so pieces detach in place
    p.group.rotation.y = platformRot(p);
    const parts = p.group.children.slice();
    for (const m of parts) {
      if (m.userData.seg === undefined) { p.group.remove(m); continue; } // splats
      const mid = m.userData.seg * SEG_A + SEG_A / 2 + rot;
      scene.attach(m);
      const speed = 4 + Math.random() * 4;
      addDebris(
        m,
        new THREE.Vector3(Math.sin(mid) * speed, 2 + Math.random() * 5, Math.cos(mid) * speed),
        new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 8),
        0.9 + Math.random() * 0.4, 22, fadeable(m)
      );
    }
    tower.remove(p.group);
  }

  function burst(geo, color, count, y, speed, life, additive) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: Array.isArray(color) ? color[i % color.length] : color, transparent: true,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !additive,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(0, y, BALL_Z);
      m.rotation.set(Math.random() * TAU, Math.random() * TAU, 0);
      scene.add(m);
      const a = Math.random() * TAU, up = Math.random();
      addDebris(
        m,
        new THREE.Vector3(Math.cos(a) * speed * (1 - up * 0.5), up * speed * 1.2, Math.sin(a) * speed * (1 - up * 0.5)),
        new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0),
        life * (0.6 + Math.random() * 0.6), 14, [mat]
      );
    }
  }

  let sparkTimer = 0;
  function fireTrail(dt) {
    sparkTimer -= dt;
    if (sparkTimer > 0) return;
    sparkTimer = 0.016;
    const mat = new THREE.MeshBasicMaterial({
      color: Math.random() < 0.5 ? 0xff5a00 : 0xffc040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const m = new THREE.Mesh(geos.spark, mat);
    m.position.set((Math.random() - 0.5) * 0.2, ball.y + 0.1, BALL_Z + (Math.random() - 0.5) * 0.2);
    m.scale.setScalar(0.9 + Math.random() * 0.8);
    scene.add(m);
    addDebris(m, new THREE.Vector3((Math.random() - 0.5) * 0.8, 2.5, (Math.random() - 0.5) * 0.8),
      new THREE.Vector3(), 0.35, 0, [mat], true);
  }

  // ---------- Audio ----------
  let actx = null;
  let muted = store.get('muted', false);
  function ensureAudio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { actx = null; }
    }
    if (actx && actx.state === 'suspended') actx.resume();
  }
  function tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, delay = 0) {
    if (muted || !actx) return;
    const t = actx.currentTime + delay;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq) {
    if (muted || !actx) return;
    const len = Math.floor(actx.sampleRate * dur);
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
    src.buffer = buf;
    f.type = 'lowpass';
    f.frequency.value = freq;
    g.gain.value = vol;
    src.connect(f).connect(g).connect(actx.destination);
    src.start();
  }
  const sfx = {
    bounce: () => tone(480, 0.13, 'sine', 0.22, 240),
    pass: (s) => tone(380 + Math.min(s, 10) * 70, 0.09, 'triangle', 0.13),
    fire: () => { tone(220, 0.45, 'sawtooth', 0.08, 880); noise(0.4, 0.15, 2500); },
    smash: () => { noise(0.3, 0.45, 1400); tone(170, 0.22, 'square', 0.1, 55); },
    die: () => { noise(0.45, 0.4, 700); tone(330, 0.6, 'sawtooth', 0.14, 45); },
    clear: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.18, null, i * 0.09)),
  };
  function setMuted(m) {
    muted = m;
    store.set('muted', m);
    ui.mute.textContent = m ? '🔇' : '🔊';
  }
  setMuted(muted);

  // ---------- Game events ----------
  function setFire(on) {
    fire = on;
    fuel = on ? FIRE_TIME : 0;
    ui.fire.classList.toggle('hidden', !on);
  }

  function addScore(n) {
    score += n;
    if (score > best) { best = score; store.set('best', best); }
    updateHud();
  }

  function passPlatform() {
    streak++;
    const pts = 10 * streak;
    addScore(pts);
    sfx.pass(streak);
    if (fire) {
      fuel = Math.min(FIRE_TIME, fuel + FIRE_REFILL);
      popup('+' + pts, 'big');
    } else if (streak >= FIRE_STREAK) {
      setFire(true);
      sfx.fire();
      popup('FIREBALL!', 'big');
    } else {
      popup('+' + pts, streak > 1 ? 'gold' : '');
    }
  }

  function smash(p) {
    smashPlatform(p);
    streak++;
    addScore(25);
    ball.vy *= 0.5;
    shake = Math.max(shake, 0.35);
    sfx.smash();
    popup('CRASH +25', 'big');
  }

  function bounce(p) {
    const top = p.y + PLAT_H / 2;
    ball.y = top + BALL_R;
    ball.vy = BOUNCE_V;
    ball.squash = 1;
    streak = 0;
    addSplat(p);
    sfx.bounce();
  }

  function die() {
    state = 'dead';
    ball.visible = false;
    ballMesh.visible = false;
    burst(geos.chip, theme.ball, 22, ball.y, 6, 0.9, false);
    shake = 0.6;
    sfx.die();
    setTimeout(() => showOverlay('dead'), 900);
  }

  function finishLevel(p) {
    bounce(p);
    if (state !== 'play') return;
    setFire(false);
    state = 'clear';
    const bonus = 50 * level;
    addScore(bonus);
    popup('LEVEL CLEAR +' + bonus, 'gold');
    burst(geos.confetti, [0xffffff, theme.ball, theme.safe, 0xff5f8f], 50, ball.y + 0.2, 7, 1.6, false);
    sfx.clear();
    level++;
    store.set('level', level);
    setTimeout(() => showOverlay('clear'), 900);
  }

  // ---------- Physics ----------
  function step(dt) {
    time += dt;
    ball.vy = Math.max(ball.vy - GRAVITY * dt, -MAX_FALL);
    ball.y += ball.vy * dt;

    if (fire) {
      fuel -= dt;
      if (fuel <= 0) { setFire(false); streak = 0; }
    }

    while (nextIdx < platforms.length) {
      const p = platforms[nextIdx];
      const top = p.y + PLAT_H / 2;
      if (ball.y - BALL_R > top) break;

      if (p.finish) { finishLevel(p); break; }
      if (state !== 'play') { bounce(p); break; }   // menu: just bounce on the first platform

      const type = p.types[segmentUnderBall(p)];
      if (type === GAP) { nextIdx++; passPlatform(); continue; }
      if (fire) { nextIdx++; smash(p); continue; }
      if (type === HAZ) { die(); return; }
      bounce(p);
      break;
    }
  }

  // ---------- HUD / overlay ----------
  function updateHud() {
    ui.score.textContent = score;
    ui.best.textContent = 'BEST ' + best;
    const total = Math.max(1, platforms.length - 1);
    ui.prog.style.width = Math.min(100, (nextIdx / total) * 100) + '%';
  }

  function showOverlay(kind) {
    if (kind === 'dead') {
      ui.ovTitle.innerHTML = '<span class="crash">CRASHED</span>';
      ui.ovText.textContent = 'You hit a hazard on level ' + level + '.';
      ui.ovStats.textContent = 'Score ' + score + '  ·  Best ' + best;
      ui.ovBtn.textContent = 'RETRY';
    } else if (kind === 'clear') {
      ui.ovTitle.innerHTML = 'LEVEL<br><span class="crash">CLEARED</span>';
      ui.ovText.textContent = 'Next up: level ' + level + '.';
      ui.ovStats.textContent = 'Score ' + score + '  ·  Best ' + best;
      ui.ovBtn.textContent = 'NEXT';
    }
    ui.overlay.dataset.kind = kind;
    ui.overlay.classList.remove('hidden');
  }

  function onOverlayAction() {
    ensureAudio();
    const kind = ui.overlay.dataset.kind || 'menu';
    if (kind === 'dead') score = 0;
    if (kind !== 'menu') buildLevel();
    ui.overlay.classList.add('hidden');
    state = 'play';
    updateHud();
  }

  ui.ovBtn.addEventListener('click', (e) => { e.stopPropagation(); onOverlayAction(); });
  ui.overlay.addEventListener('click', onOverlayAction);
  ui.mute.addEventListener('click', (e) => { e.stopPropagation(); ensureAudio(); setMuted(!muted); });

  // ---------- Input ----------
  const keys = new Set();
  let dragging = false, lastX = 0;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
    ensureAudio();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    if (state === 'play') towerRot += dx * DRAG_SPEED;
  });
  const endDrag = () => { dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  addEventListener('keydown', (e) => {
    keys.add(e.code);
    if ((e.code === 'Space' || e.code === 'Enter') && !ui.overlay.classList.contains('hidden')) {
      e.preventDefault();
      onOverlayAction();
    }
    if (e.code === 'KeyM') { ensureAudio(); setMuted(!muted); }
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  // ---------- Resize ----------
  let camDist = 9.5, camHeight = 5.2;
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Pull back on narrow (portrait) screens so the full tower stays in view.
    const narrow = Math.max(0, Math.min(1, (1.1 - camera.aspect) / 0.6));
    camDist = 9.5 + narrow * 4.5;
    camHeight = 5.2 + narrow * 2.5;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // ---------- Main loop ----------
  let last = performance.now();
  let acc = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (state === 'play') {
      if (keys.has('ArrowLeft') || keys.has('KeyA')) towerRot -= KEY_SPEED * dt;
      if (keys.has('ArrowRight') || keys.has('KeyD')) towerRot += KEY_SPEED * dt;
    }

    if (state !== 'dead') {
      acc += dt;
      while (acc >= STEP) { step(STEP); acc -= STEP; if (state === 'dead') break; }
    } else {
      time += dt;
    }

    // Tower and spinning platforms
    tower.rotation.y = towerRot;
    for (const p of platforms) if (p.spin && !p.smashed) p.group.rotation.y = platformRot(p);

    // Ball visuals
    ball.squash = Math.max(0, ball.squash - dt * 7);
    const sq = Math.sin(ball.squash * Math.PI) * 0.28;
    ballMesh.position.set(0, ball.y - sq * BALL_R * 0.5, BALL_Z);
    ballMesh.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);
    const heat = fire ? 1 : (state === 'play' && streak === FIRE_STREAK - 1 ? 0.35 : 0);
    mats.ball.emissiveIntensity += (heat * 1.4 - mats.ball.emissiveIntensity) * Math.min(1, dt * 10);
    mats.ball.color.copy(ballColor).lerp(fireColor, Math.min(1, mats.ball.emissiveIntensity / 1.4));
    if (fire && ball.visible) fireTrail(dt);
    if (fire) ui.fuel.style.width = Math.max(0, (fuel / FIRE_TIME) * 100) + '%';

    // Hazard pulse
    const pulse = 0.5 + 0.5 * Math.sin(time * 6);
    mats.haz.emissiveIntensity = 0.35 + pulse * 0.4;
    mats.spike.emissiveIntensity = 0.6 + pulse * 0.6;

    // Debris
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.life -= dt;
      if (d.life <= 0) {
        scene.remove(d.obj);
        if (d.mats) for (const m of d.mats) m.dispose();
        debris.splice(i, 1);
        continue;
      }
      d.vel.y -= d.gravity * dt;
      d.obj.position.addScaledVector(d.vel, dt);
      d.obj.rotation.x += d.spin.x * dt;
      d.obj.rotation.y += d.spin.y * dt;
      d.obj.rotation.z += d.spin.z * dt;
      const k = d.life / d.max;
      if (d.mats) for (const m of d.mats) m.opacity = Math.min(1, k * 1.6);
      if (d.shrink) d.obj.scale.setScalar(d.s0 * k);
    }

    // Camera: follows the ball down, never back up.
    if (ball.y < camY) camY += (ball.y - camY) * (1 - Math.exp(-dt * 9));
    shake = Math.max(0, shake - dt * 1.6);
    const sx = (Math.random() - 0.5) * shake * 0.5, sy = (Math.random() - 0.5) * shake * 0.5;
    camera.position.set(sx, camY + camHeight + sy, camDist);
    camera.lookAt(0, camY - 1.4, 0);

    sun.position.set(2.5, ball.y + 9, BALL_Z + 3);
    sun.target.position.set(0, ball.y - 2, BALL_Z);

    if (state === 'play') updateHud();
    renderer.render(scene, camera);
  }

  // ---------- Debug hook (only with ?debug in the URL) ----------
  if (/[?&]debug\b/.test(location.search)) {
    window.ballCrash = {
      get state() { return { state, level, score, streak, fire, fuel, nextIdx, total: platforms.length, ballY: ball.y, towerRot }; },
      setRot(r) { towerRot = r; },
      platform(i) { const p = platforms[i]; return p && { types: p.types, rot: platformRot(p), baseRot: p.baseRot, spin: p.spin, finish: p.finish, smashed: p.smashed }; },
      setLevel(n) { level = n; buildLevel(); },
    };
  }

  // ---------- Boot ----------
  buildLevel();
  ui.overlay.dataset.kind = 'menu';
  if (level > 1) ui.ovStats.textContent = 'Continue from level ' + level;
  requestAnimationFrame(frame);
})();
