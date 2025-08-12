import { Maze, drawMaze } from './maze.js'

const els = {
  screenSelect: document.getElementById('screenSelect'),
  screenGame: document.getElementById('screenGame'),
  startBtn: document.getElementById('startBtn'),
  ageGrid: document.getElementById('ageGrid'),
  themeGrid: document.getElementById('themeGrid'),
  coinDisplay: document.getElementById('coinDisplay'),
  backBtn: document.getElementById('backBtn'),
  levelTag: document.getElementById('levelTag'),
  canvas: document.getElementById('gameCanvas'),
  toast: document.getElementById('toast'),
}

const ctx = els.canvas.getContext('2d');

// State
const store = {
  age: null, // 3..6
  theme: null, // 'animals' | 'vehicles'
  coins: 0,
  level: 1,
}

const UNLOCKS = { vehicles: 15 };

loadStore();
updateCoinDisplay();
refreshThemeButtons();

// Selection handlers
bindSelectable(els.ageGrid, 'age');
bindSelectable(els.themeGrid, 'theme');

els.startBtn.addEventListener('click', () => {
  if (!store.age || !store.theme) return;
  startGame();
});

els.backBtn.addEventListener('click', () => {
  switchScreen('select');
});

function bindSelectable(root, key) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-' + key + ']');
    if (!btn) return;
    [...root.querySelectorAll('button')].forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    store[key] = key === 'age' ? Number(btn.dataset[key]) : btn.dataset[key];
    els.startBtn.disabled = !(store.age && store.theme);
    // Auto-start when both selected (aligns with spec)
    if (store.age && store.theme && els.screenSelect.classList.contains('active')) {
      startGame();
    }
  });
}

function switchScreen(which) {
  if (which === 'select') {
    els.screenSelect.classList.add('active');
    els.screenGame.classList.remove('active');
    refreshThemeButtons();
  } else {
    els.screenSelect.classList.remove('active');
    els.screenGame.classList.add('active');
  }
}

// Game implementation
let maze, vis, metrics;
let player = { cellX: 0, cellY: 0, x: 0, y: 0, radius: 16, themeIcon: '🐶', hurtFlash: 0 };
let dragging = false;
let lastTouch = null;
let rafId = 0;
let inputSetup = false;
let lastHurtAt = 0;
let running = false;
let won = false;

function startGame() {
  switchScreen('game');
  // Ensure canvas has correct size now that the screen is visible
  fitCanvas();
  const conf = difficultyForAge(store.age);
  maze = new Maze(conf.size, conf.size);
  maze.generate(Date.now());
  maze.start = { x: 0, y: 0 };
  maze.goal = { x: maze.cols - 1, y: maze.rows - 1 };
  metrics = drawMaze(ctx, maze, { w: els.canvas.width, h: els.canvas.height });
  player.cellX = maze.start.x; player.cellY = maze.start.y;
  const [px, py] = cellCenter(player.cellX, player.cellY);
  player.x = px; player.y = py;
  player.radius = Math.max(10, Math.floor(metrics.cellSize * 0.24));
  player.themeIcon = store.theme === 'vehicles' ? '🚗' : '🐶';
  won = false;
  els.levelTag.textContent = `${store.age}さい・${maze.cols}×${maze.rows}`;
  drawAll();
  setupInput();
  startLoop();
}

function difficultyForAge(age) {
  switch (age) {
    case 3: return { size: 5 };
    case 4: return { size: 7 };
    case 5: return { size: 9 };
    case 6: return { size: 12 };
    default: return { size: 7 };
  }
}

function cellCenter(cx, cy) {
  const { originX, originY, cellSize } = metrics;
  return [originX + (cx + 0.5) * cellSize, originY + (cy + 0.5) * cellSize];
}

function setupInput() {
  if (inputSetup) return;
  inputSetup = true;
  const el = els.canvas;
  el.addEventListener('touchstart', onStart, { passive: true });
  el.addEventListener('touchmove', onMove, { passive: false });
  el.addEventListener('touchend', onEnd, { passive: true });
  // Pointer support (desktop testing)
  el.addEventListener('pointerdown', onStart);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onEnd);
}

function withinPlayer(x, y) {
  const dx = x - player.x, dy = y - player.y;
  return dx*dx + dy*dy <= player.radius * player.radius * 1.6; // easier to grab
}

function canvasPoint(evt) {
  const r = els.canvas.getBoundingClientRect();
  const isTouch = evt.touches && evt.touches[0];
  const p = isTouch ? evt.touches[0] : evt;
  const x = (p.clientX - r.left) * (els.canvas.width / r.width);
  const y = (p.clientY - r.top) * (els.canvas.height / r.height);
  return { x, y };
}

function onStart(evt) {
  const { x, y } = canvasPoint(evt);
  if (withinPlayer(x, y)) {
    dragging = true; lastTouch = { x, y };
  }
}
function onMove(evt) {
  if (!dragging) return;
  evt.preventDefault();
  const { x, y } = canvasPoint(evt);
  lastTouch = { x, y };
}
function onEnd() { dragging = false; lastTouch = null; }

function startLoop() {
  if (running) return; running = true;
  const tick = () => {
    if (!running) return;
    const speed = Math.max(3, Math.floor(metrics.cellSize * 0.32));
    if (dragging && lastTouch) {
      const vx = lastTouch.x - player.x;
      const vy = lastTouch.y - player.y;
      const dist = Math.hypot(vx, vy);
      if (dist > 0.5) {
        const step = Math.min(speed, dist);
        const dx = (vx / dist) * step;
        const dy = (vy / dist) * step;
        const res = attemptMove(player.x, player.y, dx, dy);
        player.x = res.x; player.y = res.y;
      }
    }
    // Update cell from position
    const c = cellFromPoint(player.x, player.y);
    if (c) { player.cellX = c.x; player.cellY = c.y; }
    drawAll();
    if (!won && player.cellX === maze.goal.x && player.cellY === maze.goal.y) {
      won = true; onGoal();
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function attemptMove(cx, cy, dx, dy) {
  // try full move
  let nx = cx + dx, ny = cy + dy;
  if (canTraverse(cx, cy, nx, ny)) return { x: nx, y: ny };
  // try slide on X axis
  nx = cx + dx; ny = cy;
  if (canTraverse(cx, cy, nx, ny)) return { x: nx, y: ny };
  // try slide on Y axis
  nx = cx; ny = cy + dy;
  if (canTraverse(cx, cy, nx, ny)) return { x: nx, y: ny };
  maybeHurt();
  return { x: cx, y: cy };
}

function canTraverse(x1, y1, x2, y2) {
  const a = cellFromPoint(x1, y1);
  const b = cellFromPoint(x2, y2);
  if (!a || !b) return false;
  if (a.x === b.x && a.y === b.y) return true;
  const dx = b.x - a.x; const dy = b.y - a.y;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return false; // skip diagonal/multi jumps
  const dir = dx === 1 ? 1 : dx === -1 ? 3 : dy === 1 ? 2 : 0;
  return maze.canMove(a.x, a.y, dir);
}

function cellFromPoint(px, py) {
  const { originX, originY, cellSize } = metrics;
  const x = Math.floor((px - originX) / cellSize);
  const y = Math.floor((py - originY) / cellSize);
  if (x < 0 || y < 0 || x >= maze.cols || y >= maze.rows) return null;
  return { x, y };
}

function drawAll() {
  metrics = drawMaze(ctx, maze, { w: els.canvas.width, h: els.canvas.height });
  // Goal flag
  const [gx, gy] = cellCenter(maze.goal.x, maze.goal.y);
  drawEmoji(ctx, '🏁', gx, gy, Math.floor(player.radius * 1.2));
  // Player
  if (player.hurtFlash > 0) {
    ctx.save();
    ctx.shadowColor = 'rgba(255,0,0,0.8)'; ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(255, 89, 94, 0.22)';
    circle(ctx, player.x, player.y, player.radius * 1.2, true);
    ctx.restore();
    player.hurtFlash -= 1;
  }
  drawEmoji(ctx, player.themeIcon, player.x, player.y, player.radius);
}

function drawEmoji(ctx, emoji, x, y, r) {
  ctx.save();
  ctx.font = `${r * 2}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(emoji, x, y + r * 0.05);
  ctx.restore();
}

function circle(ctx, x, y, r, fill=false) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
  fill ? ctx.fill() : ctx.stroke();
}

function onGoal() {
  toast('ゴール！ +5コイン');
  coinsAdd(5);
  vibrate(80);
  fanfare();
  // small jump animation
  const jump = () => {
    let t = 0; const T = 22; const startY = player.y;
    const step = () => {
      t++;
      const k = t / T;
      player.y = startY - Math.sin(k * Math.PI) * (player.radius * 0.8);
      drawAll();
      if (t < T) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  jump();
  // regenerate a new maze after a brief delay
  setTimeout(() => startGame(), 900);
}

function hurt() {
  player.hurtFlash = 8;
  errorBeep();
  vibrate(40);
  drawAll();
}

function maybeHurt() {
  const now = performance.now();
  if (now - lastHurtAt > 220) {
    lastHurtAt = now; hurt();
  }
}

// Audio (no assets): simple WebAudio beeps
let audioCtx;
function ac() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); return audioCtx; }

function errorBeep() {
  const ctxA = ac();
  const o = ctxA.createOscillator(); const g = ctxA.createGain();
  o.type = 'square'; o.frequency.value = 220;
  g.gain.setValueAtTime(0.0001, ctxA.currentTime);
  g.gain.exponentialRampToValueAtTime(0.2, ctxA.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctxA.currentTime + 0.12);
  o.connect(g).connect(ctxA.destination); o.start(); o.stop(ctxA.currentTime + 0.14);
}

function fanfare() {
  const ctxA = ac();
  const g = ctxA.createGain(); g.gain.value = 0.08; g.connect(ctxA.destination);
  const notes = [523.25, 659.25, 783.99, 1046.5];
  const t0 = ctxA.currentTime + 0.02;
  notes.forEach((f, i) => {
    const o = ctxA.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const gg = ctxA.createGain(); gg.gain.value = 0.0001;
    gg.gain.exponentialRampToValueAtTime(0.18, t0 + i * 0.1 + 0.02);
    gg.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.1 + 0.18);
    o.connect(gg).connect(g); o.start(t0 + i * 0.1); o.stop(t0 + i * 0.1 + 0.22);
  });
}

// Vibration
function vibrate(ms) { if (navigator.vibrate) navigator.vibrate(ms); }

// Coins + localStorage
function loadStore() {
  try {
    const raw = localStorage.getItem('mazeKids.v1');
    if (raw) {
      const d = JSON.parse(raw);
      store.coins = d.coins ?? 0;
      store.level = d.level ?? 1;
    }
  } catch {}
}
function saveStore() {
  try {
    localStorage.setItem('mazeKids.v1', JSON.stringify({ coins: store.coins, level: store.level }));
  } catch {}
}
function coinsAdd(n) {
  const wasVehiclesUnlocked = store.coins >= (UNLOCKS.vehicles || 0);
  store.coins += n;
  updateCoinDisplay(); saveStore();
  const nowVehiclesUnlocked = store.coins >= (UNLOCKS.vehicles || 0);
  refreshThemeButtons();
  if (!wasVehiclesUnlocked && nowVehiclesUnlocked) {
    toast('のりものテーマが解放された！');
  }
}
function updateCoinDisplay() { els.coinDisplay.textContent = `🪙 ${store.coins}`; }

function themeLabel(t) { return t === 'vehicles' ? 'のりもの 🚗' : 'どうぶつ 🐶'; }
function refreshThemeButtons() {
  const btns = els.themeGrid.querySelectorAll('button[data-theme]');
  btns.forEach(btn => {
    const t = btn.dataset.theme;
    const need = UNLOCKS[t] || 0;
    const unlocked = store.coins >= need;
    btn.disabled = !unlocked && need > 0;
    btn.classList.toggle('locked', !unlocked && need > 0);
    btn.textContent = unlocked ? themeLabel(t) : `${themeLabel(t)} 🔒${need}`;
    if (!unlocked && store.theme === t) {
      // prevent starting with locked theme
      store.theme = null;
      [...els.themeGrid.querySelectorAll('button')].forEach(b => b.classList.remove('selected'));
      els.startBtn.disabled = !(store.age && store.theme);
    }
  });
}

// Toast
let toastTimer = 0;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 1200);
}

// Fit canvas to device pixel ratio
function fitCanvas() {
  const wrap = els.canvas.parentElement.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  els.canvas.width = Math.floor(wrap.width * dpr);
  els.canvas.height = Math.floor(wrap.height * dpr);
  if (maze) { drawAll(); }
}
window.addEventListener('resize', fitCanvas);
window.addEventListener('orientationchange', () => setTimeout(fitCanvas, 100));
fitCanvas();
