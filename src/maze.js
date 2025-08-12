// Simple grid maze generator and renderer

export class Maze {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.grid = new Array(cols * rows).fill(0).map((_, i) => new Cell(i % cols, Math.floor(i / cols)));
    this.start = { x: 0, y: 0 };
    this.goal = { x: cols - 1, y: rows - 1 };
  }

  idx(x, y) { return y * this.cols + x; }

  neighbors(x, y) {
    const res = [];
    if (y > 0) res.push({ x, y: y - 1, dir: 0 }); // top
    if (x < this.cols - 1) res.push({ x: x + 1, y, dir: 1 }); // right
    if (y < this.rows - 1) res.push({ x, y: y + 1, dir: 2 }); // bottom
    if (x > 0) res.push({ x: x - 1, y, dir: 3 }); // left
    return res;
  }

  generate(seed = Date.now()) {
    // Recursive backtracker (iterative) with seeded RNG
    const rand = mulberry32(seed >>> 0);
    const stack = [];
    const visited = new Set();
    const startX = 0, startY = 0;
    stack.push({ x: startX, y: startY });
    visited.add(this.idx(startX, startY));

    while (stack.length) {
      const current = stack[stack.length - 1];
      const unvisited = this.neighbors(current.x, current.y).filter(n => !visited.has(this.idx(n.x, n.y)));
      if (unvisited.length === 0) { stack.pop(); continue; }
      const n = unvisited[Math.floor(rand() * unvisited.length)];
      // carve passage between current and n
      const cIdx = this.idx(current.x, current.y);
      const nIdx = this.idx(n.x, n.y);
      const c = this.grid[cIdx];
      const nb = this.grid[nIdx];
      c.open(n.dir);
      nb.open((n.dir + 2) % 4);
      visited.add(nIdx);
      stack.push({ x: n.x, y: n.y });
    }
    // set goal farthest cell (simple heuristic: bottom-right)
    this.goal = { x: this.cols - 1, y: this.rows - 1 };
  }

  canMove(x, y, dir) {
    // dir: 0 top,1 right,2 bottom,3 left
    const c = this.grid[this.idx(x, y)];
    if (!c.isOpen(dir)) return false;
    if (dir === 0 && y <= 0) return false;
    if (dir === 1 && x >= this.cols - 1) return false;
    if (dir === 2 && y >= this.rows - 1) return false;
    if (dir === 3 && x <= 0) return false;
    return true;
  }
}

export class Cell {
  constructor(x, y) {
    this.x = x; this.y = y;
    // bit flags: top(1), right(2), bottom(4), left(8)
    this.passages = 0;
  }
  open(dir) { this.passages |= (1 << dir); }
  isOpen(dir) { return (this.passages & (1 << dir)) !== 0; }
}

export function drawMaze(ctx, maze, opts) {
  const { w, h, padding = 16, wall = '#1f2937', path = '#e9ecef' } = opts;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  const cols = maze.cols, rows = maze.rows;
  const cellSize = Math.floor(Math.min(w, h) - padding * 2) / Math.max(cols, rows);
  const originX = (w - cellSize * cols) / 2;
  const originY = (h - cellSize * rows) / 2;

  // background path
  ctx.fillStyle = path;
  ctx.fillRect(originX, originY, cellSize * cols, cellSize * rows);

  // draw walls
  ctx.strokeStyle = wall;
  ctx.lineWidth = Math.max(4, Math.floor(cellSize * 0.14));
  ctx.lineCap = 'round';

  // outer border
  ctx.strokeRect(originX, originY, cellSize * cols, cellSize * rows);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = maze.grid[y * cols + x];
      const cx = originX + x * cellSize;
      const cy = originY + y * cellSize;
      // top wall
      if (!cell.isOpen(0)) line(ctx, cx, cy, cx + cellSize, cy);
      // right wall
      if (!cell.isOpen(1)) line(ctx, cx + cellSize, cy, cx + cellSize, cy + cellSize);
      // bottom wall
      if (!cell.isOpen(2)) line(ctx, cx, cy + cellSize, cx + cellSize, cy + cellSize);
      // left wall
      if (!cell.isOpen(3)) line(ctx, cx, cy, cx, cy + cellSize);
    }
  }

  // draw start and goal
  const s = maze.start;
  const g = maze.goal;
  const center = (xx, yy) => [originX + (xx + 0.5) * cellSize, originY + (yy + 0.5) * cellSize];
  const [sx, sy] = center(s.x, s.y);
  const [gx, gy] = center(g.x, g.y);
  ctx.fillStyle = '#2ec4b622';
  circle(ctx, sx, sy, cellSize * 0.34, true);
  ctx.fillStyle = '#ff9f1c22';
  circle(ctx, gx, gy, cellSize * 0.34, true);

  ctx.restore();

  return { cellSize, originX, originY };
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function circle(ctx, x, y, r, fill=false) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  fill ? ctx.fill() : ctx.stroke();
}

// simple seeded RNG
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

