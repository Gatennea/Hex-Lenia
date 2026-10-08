// 对照实验：57 种原版生物 + 水母(对照) 在【六角核】vs【方格核】下的行为差异
// 单变量设计：同一 FFT/增长/更新引擎，只换 rules[0].kf（核几何）
//   hex  : dx=dq+dr/2, dy=√3/2·dr（轴向六角笛卡尔）——游戏现状
//   square: dx=dq, dy=dr（整数格欧氏）——原版 Lenia 出身处
// 用法: node compare_grids.js [起始i] [结束i]   （默认 0 14）
const fs = require("fs");

// ---- LifeForms 数据 ----
const wLoader = {};
new Function("window", fs.readFileSync(__dirname + "/../lifecreatures.js", "utf8"))(wLoader);
const LIFE = wLoader.LENIA_LIFEFORMS;

// ---- DOM 桩（复用 test_node 模式）----
function makeEl() {
  return {
    style: {}, innerHTML: "", textContent: "", value: "0",
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, appendChild() {},
    getContext() {
      return new Proxy({}, {
        get(t, p) {
          if (p === "canvas") return { width: 0, height: 0 };
          if (p === "createImageData") return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
          if (t[p] !== undefined) return t[p];
          return () => {};
        },
        set() { return true; }
      });
    },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    width: 0, height: 0
  };
}
const els = {};
const document = {
  getElementById(id) { if (!els[id]) els[id] = makeEl(); return els[id]; },
  createElement() { return makeEl(); },
  addEventListener() {},
  body: { classList: { toggle() {}, add() {}, remove() {} } }
};
const window = { devicePixelRatio: 1, addEventListener() {}, requestAnimationFrame() {} };
function requestAnimationFrame() {}
const performance = { now: () => Date.now() };

const html = fs.readFileSync(__dirname + "/../index.html", "utf8");
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const RET = `
return { get W(){return W}, get H(){return H}, get N(){return N}, get R(){return R}, get T(){return T},
  get coreType(){return coreType}, get alpha(){return alpha},
  get fields(){return fields}, get rules(){return rules},
  applyPreset, clearAll, rebuildKernels, fft2d, CORES, GROWTHS,
  lifeRuleParse, lifeToCells, setGrid, step, buildKernel,
  CREATURE_JELLY, b64ToU8, SQ3,
  setParams: (r, t, c) => { R = r; T = t; coreType = c; } };`;
const api = new Function("document", "window", "requestAnimationFrame", "performance", "LENIA_LIFEFORMS",
  src + RET)(document, window, requestAnimationFrame, performance, LIFE);

// ---- 方格核（与 buildKernel 同构，仅距离改整数格欧氏）----
function buildKernelSq(rad) {
  const N = api.N, W = api.W, H = api.H;
  const sp = new Float64Array(N);
  const bound = Math.ceil(rad * 1.6) + 1;
  const core = api.CORES[api.coreType];
  let sum = 0;
  for (let dr = -bound; dr <= bound; dr++) {
    for (let dq = -bound; dq <= bound; dq++) {
      const d = Math.sqrt(dq * dq + dr * dr);
      if (d >= rad) continue;
      const w = core(d / rad, api.alpha);
      if (w === 0) continue;
      const qi = ((dq % W) + W) % W, ri = ((dr % H) + H) % H;
      sp[ri * W + qi] = w; sum += w;
    }
  }
  if (sum > 0) for (let i = 0; i < N; i++) sp[i] /= sum;
  const re = Float64Array.from(sp), im = new Float64Array(N);
  api.fft2d(re, im, W, H, -1);
  return { re, im };
}

// ---- 指标 ----
const dens = () => { let s = 0; const f = api.fields[0]; for (let i = 0; i < api.N; i++) s += f[i]; return s / api.N; };
function centroid() {
  const f = api.fields[0], N = api.N, W = api.W;
  let m = 0, sx = 0, sy = 0;
  for (let i = 0; i < N; i++) { const v = f[i]; if (v > 0) { m += v; sx += v * (i % W); sy += v * ((i / W) | 0); } }
  return m > 0 ? [sx / m, sy / m] : [0, 0];
}
function copyField() { return Float64Array.from(api.fields[0]); }
function shiftedDiff(a, b, dq, dr) {
  // Σ|a(i) - b(i - d)| / Σ(a+b)，环面回绕
  const N = api.N, W = api.W, H = api.H;
  dq = ((Math.round(dq) % W) + W) % W; dr = ((Math.round(dr) % H) + H) % H;
  let num = 0, den = 0;
  for (let r = 0; r < H; r++) {
    const sr = (r + dr) % H;
    for (let c = 0; c < W; c++) {
      const sc = (c + dq) % W;
      const x = a[r * W + c], y = b[sr * W + sc];
      num += Math.abs(x - y); den += x + y;
    }
  }
  return den > 0 ? num / den : 0;
}
function activityLast(k) {
  // 最后 k 步平均活动度 mean|Δ|/N
  let acc = 0;
  for (let i = 0; i < k; i++) {
    const snap = copyField();
    api.step();
    const f = api.fields[0];
    let s = 0; for (let j = 0; j < api.N; j++) s += Math.abs(f[j] - snap[j]);
    acc += s / api.N;
  }
  return acc / k;
}
function measure(steps, isHex) {
  const W = api.W, H = api.H, SQ3 = api.SQ3;
  const snap0 = copyField();
  const c0 = centroid();
  const SAMPLE = 20;
  let px = c0[0], py = c0[1], path = 0, nx = 0, ny = 0;
  const devs = [];
  for (let s = 1; s <= steps; s++) {
    api.step();
    if (s % SAMPLE === 0 || s === steps) {
      const c = centroid();
      let dq = c[0] - px, dr = c[1] - py;
      if (dq > W / 2) dq -= W; if (dq < -W / 2) dq += W;
      if (dr > H / 2) dr -= H; if (dr < -H / 2) dr += H;
      px += dq; py += dr;
      // 网格几何 → 笛卡尔位移
      const dx = isHex ? dq + dr / 2 : dq;
      const dy = isHex ? (SQ3 / 2) * dr : dr;
      const L = Math.hypot(dx, dy);
      path += L; nx += dx; ny += dy;
      if (L > 0.35) {           // 只在有明显位移时记录航向（避免静止噪声）
        let th = Math.atan2(dy, dx) * 180 / Math.PI;
        const lat = isHex ? 60 : 45;   // 最近晶格方向
        let dev = ((th % lat) + lat + lat / 2) % lat - lat / 2;
        devs.push(Math.abs(dev));
      }
    }
  }
  const dEnd = dens();
  const act = activityLast(5);
  const cEnd = centroid();
  const shapeDiff = shiftedDiff(snap0, api.fields[0], cEnd[0] - c0[0], cEnd[1] - c0[1]);
  const speed = path / steps;
  const net = Math.hypot(nx, ny);
  const straight = path > 0 ? net / path : 1;
  const latDev = devs.length ? devs.reduce((a, b) => a + b, 0) / devs.length : null;
  return { alive: dEnd > 0.0005, dEnd, act, speed, straight, latDev, shapeDiff };
}

// ---- 载入单个生物 → 参数+细胞 ----
function loadCreature(e) {
  let rule, cells, name;
  if (e === "jelly") {
    name = "🪼水母(对照)";
    rule = "R=10;d=gaus(0.15,0.016)*0.1";
    const u8 = api.b64ToU8(api.CREATURE_JELLY), w = 22, h = 22;
    const arr = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) arr[i] = u8[i] / 100;
    cells = { arr: rows2(arr, w, h), w, h };
  } else {
    name = e.name + " [" + e.code + "]";
    rule = e.rec.slice(0, e.rec.indexOf(";cells="));
    cells = api.lifeToCells(e.rec.slice(e.rec.indexOf(";cells=") + 7));
  }
  return { name, p: api.lifeRuleParse(rule), cells };
}
function rows2(arr, w, h) { const out = []; for (let r = 0; r < h; r++) out.push(Array.from(arr.slice(r * w, r * w + w))); return out; }

function setup(cr) {
  const p = cr.p;
  api.applyPreset("solo");
  // 网格需求（同 placeLife：≥6R 或 ≥1.8×种子边）
  const need = Math.max(6 * p.R, cr.cells.w * 1.8, cr.cells.h * 1.8);
  let g = 32; while (g < need && g < 512) g *= 2;
  if (g > api.W) api.setGrid(g);
  const R = p.R;
  Object.assign(api.rules[0], { m: p.m, s: p.s, g: p.grow, h: 1, src: 0, dst: 0 });
  api.setParams(R, p.T, p.core);   // 写全局 R/T/coreType
  api.rebuildKernels(true);       // 六角核
  api.clearAll();
  const f = api.fields[0], W = api.W, H = api.H;
  const x0 = (W >> 1) - (cr.cells.w >> 1), y0 = (H >> 1) - (cr.cells.h >> 1);
  let cnt = 0;
  for (let r = 0; r < cr.cells.h; r++) for (let q = 0; q < cr.cells.w; q++) {
    const v = (cr.cells.arr[r] || [])[q];
    if (v > 0 && v <= 1) { f[(((x0 + q) % W) + W) % W + ((((y0 + r) % H) + H) % H) * W] = v; cnt++; }
  }
  return cnt;
}

// ---- 主流程 ----
const A = +(process.argv[2] || 0), B = +(process.argv[3] || 7);
const list = ["jelly"].concat(LIFE.slice(A, B).map(e => e));
const STEPS = 300;
console.log("批次 [" + A + "," + B + ")  网格=" + api.W + "²  步数=" + STEPS);
const rows = [];
for (const e of list) {
  const cr = loadCreature(e);
  const cnt = setup(cr);
  const grid = api.W;
  const hex = measure(STEPS, true);
  // 方格核：只换 kf，其余全同
  api.rules[0].kf = buildKernelSq(api.rules[0].rad || api.R);
  setup2(cr);
  const sq = measure(STEPS, false);
  const fmt = (m) => (m.alive ? "活" : "死") + " act=" + m.act.toExponential(1)
    + " v=" + m.speed.toFixed(3) + " 直=" + m.straight.toFixed(2)
    + " 偏=" + (m.latDev === null ? " -  " : m.latDev.toFixed(1) + "°")
    + " 形=" + m.shapeDiff.toFixed(2);
  console.log(cr.name + " (" + grid + "²," + cnt + "格)");
  console.log("   六角: " + fmt(hex));
  console.log("   方格: " + fmt(sq));
  rows.push({ name: cr.name, hex, sq });
}
console.log("DONE " + rows.length);

function setup2(cr) {  // 方格核前重置场（不重建核）
  const p = cr.p;
  api.clearAll();
  const f = api.fields[0], W = api.W, H = api.H;
  const x0 = (W >> 1) - (cr.cells.w >> 1), y0 = (H >> 1) - (cr.cells.h >> 1);
  for (let r = 0; r < cr.cells.h; r++) for (let q = 0; q < cr.cells.w; q++) {
    const v = (cr.cells.arr[r] || [])[q];
    if (v > 0 && v <= 1) f[(((x0 + q) % W) + W) % W + ((((y0 + r) % H) + H) % H) * W] = v;
  }
}
