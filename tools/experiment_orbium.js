// ═══════════════════════════════════════════════════════════════
//  原版 Lenia 预设移植实验：
//  1. 从 Lenia-LifeForms.js 提取 Orbium (O2(a)) 规则+种子
//  2. 忠实移植原版 ToCellArray zip 解码器
//  3. 用原版参数 (R=13, T=10, μ=0.15, σ=0.017, bump4) 在六角网格运行
//  4. 量化：存活 / 活性 / 中心漂移（是否像方格版一样移动）/ ASCII 形态
// ═══════════════════════════════════════════════════════════════
const fs = require("fs");

// ---------- 1. 提取 O2 记录 ----------
const lf = fs.readFileSync(__dirname + "/../lenia-reference/Lenia-LifeForms.js", "utf8");
const i0 = lf.indexOf('["O2(a)"');
if (i0 < 0) { console.log("O2 not found"); process.exit(1); }
const rs = lf.indexOf('"R=', i0);
const re_ = lf.indexOf('"', rs + 1);
const record = lf.slice(rs + 1, re_);
const cellsStr = record.split(";cells=")[1];
const ruleStr = record.split(";cells=")[0];
console.log("Orbium rule:", ruleStr);
console.log("cells 长度:", cellsStr.length);

// ---------- 2. 原版 ToCellArray 解码器（忠实移植 Lenia.html:2046）----------
const ZIP_START = 192, ZIP_HEADER = "(zip)";
function fromZip(c) { return c === "0" ? 0 : c === "1" ? 100 : c.charCodeAt(0) - (ZIP_START - 1); }
function isZipC(c) { return c.charCodeAt(0) >= ZIP_START; }
function fromRepeatSt(st) {
  if (st === "") return 1;
  if (isZipC(st[0])) return st.length === 1 ? fromZip(st) : fromZip(st[0]) * 100 + fromZip(st[1]);
  return parseInt(st, 10);
}
function toCellArray(cellSt) {
  const isZip = cellSt.startsWith(ZIP_HEADER);
  if (isZip) cellSt = cellSt.substring(ZIP_HEADER.length);
  const colSep = isZip ? "" : ",";
  let cells = cellSt.split("/");
  const h = cells.length;
  let w = 0;
  for (let i = 0; i < h; i++) {
    let row = cells[i].trim();
    if (isZip) {
      const row2 = row.split("-"); row = "";
      for (const seg of row2) {
        const row3 = seg.split(".");
        if (row3.length === 1) row += seg;
        else row += "0".repeat(fromRepeatSt(row3[0])) + row3[1];
      }
    }
    cells[i] = row = row.split(colSep);
    w = Math.max(w, row.length);
    if (isZip) for (let j = 0; j < row.length; j++) row[j] = Math.round(fromZip(row[j]) / 100 * 100) / 100;
  }
  return { arr: cells, w, h };
}

const seed = toCellArray(cellsStr);
let vmin = 1, vmax = 0, nonzero = 0, total = 0;
for (const row of seed.arr) for (const v of row) { vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); if (v > 0.001) nonzero++; total++; }
console.log(`种子: ${seed.w}×${seed.h}  值域 [${vmin}, ${vmax}]  非零 ${nonzero}/${total}`);
// 打印种子 ASCII（验证解码合理）
function ascii(arr, w, h) {
  let s = "";
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const v = arr[j] && arr[j][i] !== undefined ? arr[j][i] : 0;
      s += v < 0.005 ? "." : v < 0.3 ? "o" : v < 0.7 ? "O" : "@";
    }
    s += "\n";
  }
  return s;
}
console.log("种子 ASCII:");
console.log(ascii(seed.arr, seed.w, seed.h));

// ---------- 3. 加载引擎 ----------
const html = require("./src").html();
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function makeEl() { return { style: {}, innerHTML: "", textContent: "", value: "0", classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, appendChild() {}, getContext() { return new Proxy({}, { get(t, p) { if (p === "canvas") return { width: 0, height: 0 }; if (p === "createImageData") return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }); return t[p] !== undefined ? t[p] : () => {}; }, set() { return true; } }); }, getBoundingClientRect() { return { left: 0, top: 0 }; }, width: 0, height: 0 }; }
const els = {};
const document = { getElementById(id) { if (!els[id]) els[id] = makeEl(); return els[id]; }, createElement() { return makeEl(); }, addEventListener() {} };
const window = { devicePixelRatio: 1, addEventListener() {}, requestAnimationFrame() {} };
function requestAnimationFrame() {}
const performance = { now: () => Number(process.hrtime.bigint() / 1000n) / 1000 };
const fn = new Function("document", "window", "requestAnimationFrame", "performance",
  src + `;return {
    applyPreset, step, N, W, H,
    get fields(){return fields}, get rules(){return rules}, get gen(){return gen},
    clearAll, randomInit,
    setR(v){ R = v; rebuildKernels(true); },
    setT(v){ T = v; },
    setCore(c){ coreType = c; rebuildKernels(true); },
    rebuild(){ rebuildKernels(true); }
  };`);
const api = fn(document, window, requestAnimationFrame, performance);
const N = api.N, WW = api.W, HH = api.H;

// ---------- 4. 实验运行器 ----------
function placeSeed(cx, cy) {
  api.clearAll();
  const f = api.fields[0];
  const x0 = cx - (seed.w >> 1), y0 = cy - (seed.h >> 1);
  for (let j = 0; j < seed.h; j++) for (let i = 0; i < seed.w; i++) {
    const v = seed.arr[j][i];
    if (v > 0) {
      const q = ((x0 + i) % WW + WW) % WW, r = ((y0 + j) % HH + HH) % HH;
      f[q + r * WW] = v;
    }
  }
}
function density(c) { let s = 0; const f = api.fields[c || 0]; for (let i = 0; i < N; i++) s += f[i]; return s / N; }
function activity() {  // 单步平均 |ΔA|（step 后重新取 fields[0]，避免双缓冲交换后引用过期）
  const snap = Float64Array.from(api.fields[0]);
  api.step();
  const f2 = api.fields[0];
  let s = 0;
  for (let i = 0; i < N; i++) s += Math.abs(f2[i] - snap[i]);
  return s / N;
}
function com() {  // 环面质心（圆均值）
  let sx = 0, sy = 0, cw = 0;
  const f = api.fields[0];
  for (let r = 0; r < HH; r++) for (let q = 0; q < WW; q++) {
    const v = f[q + r * WW];
    if (v < 0.01) continue;
    const ax = 2 * Math.PI * q / WW, ay = 2 * Math.PI * r / HH;
    sx += Math.cos(ax) * v; sy += Math.sin(ax) * v; cw += v;
    // 简化：仅用 x/y 圆均值
    var _ = 0;
  }
  let yyx = 0, yy = 0;
  for (let r = 0; r < HH; r++) for (let q = 0; q < WW; q++) {
    const v = f[q + r * WW];
    if (v < 0.01) continue;
    const ay = 2 * Math.PI * r / HH;
    yyx += Math.cos(ay) * v; yy += Math.sin(ay) * v;
  }
  const x = ((Math.atan2(sy, sx) / (2 * Math.PI)) * WW + WW) % WW;
  const y = ((Math.atan2(yy, yyx) / (2 * Math.PI)) * HH + HH) % HH;
  return [x, y];
}
function wrapDelta(a, b, n) { let d = b - a; if (d > n / 2) d -= n; if (d < -n / 2) d += n; return d; }

function window24(cx, cy) {
  const f = api.fields[0];
  const rad = 13;
  let s = "";
  for (let j = -rad; j <= rad; j++) {
    for (let i = -rad; i <= rad; i++) {
      const q = (((cx + i) % WW) + WW) % WW, r = (((cy + j) % HH) + HH) % HH;
      const v = f[q + r * WW];
      s += v < 0.005 ? "." : v < 0.3 ? "o" : v < 0.7 ? "O" : "@";
    }
    s += "\n";
  }
  return s;
}

function runCase(name, setup, gens = 1000) {
  setup();
  console.log(`\n═══ ${name} ═══`);
  const snaps = {};
  const marks = [0, Math.floor(gens / 2), gens - 1];
  let prevCom = null, drift = 0;
  const traj = [];
  for (let g = 0; g < gens; g++) {
    if (g === 300 || g === 600) { const a = activity(); traj.push(`act@${g}=${a.toFixed(4)}`); }
    else api.step();
    if (g % 100 === 99 || g === 0) traj.push(`d@${g + 1}=${density().toFixed(4)}`);
    const c = com();
    if (prevCom) drift += Math.hypot(wrapDelta(prevCom[0], c[0], WW), wrapDelta(prevCom[1], c[1], HH));
    prevCom = c;
    if (marks.includes(g)) snaps[g] = window24(Math.round(c[0]), Math.round(c[1]));
  }
  const act = activity();
  console.log(traj.join("  "));
  console.log(`最终活性/步=${act.toExponential(2)}  累计质心漂移=${drift.toFixed(1)} 格`);
  console.log("--- gen0 形态（质心±13 窗口）---");
  console.log(snaps[0]);
  console.log(`--- gen${gens - 1} 形态 ---`);
  console.log(snaps[gens - 1] || "(无)");
  return { act, drift };
}

// ---------- 5. 方格对照引擎（同一套核/增长/更新代码，换成方格晶格） ----------
function squareConv() {
  const R2 = 13;
  const nT = 600, tdq = new Int32Array(nT), tdr = new Int32Array(nT), tw = new Float64Array(nT);
  let nt = 0, sum = 0;
  const b = Math.ceil(R2) + 1;
  for (let dr = -b; dr <= b; dr++) for (let dq = -b; dq <= b; dq++) {
    const d = Math.sqrt(dq * dq + dr * dr);
    if (d >= R2) continue;
    const r = d / R2, k = 4 * r * (1 - r);
    const w = (r <= 0 || r >= 1) ? 0 : Math.exp(4 - 4 / k);
    if (w > 0) { tdq[nt] = dq; tdr[nt] = dr; tw[nt] = w; nt++; sum += w; }
  }
  for (let i = 0; i < nt; i++) tw[i] /= sum;
  console.log(`[square] taps=${nt}`);
  const f = new Float64Array(NN_SQ), nx = new Float64Array(NN_SQ);
  const S = WW;
  const x0 = (S >> 1) - (seed.w >> 1), y0 = (S >> 1) - (seed.h >> 1);
  for (let j = 0; j < seed.h; j++) for (let i = 0; i < seed.w; i++) {
    const v = seed.arr[j][i];
    if (v > 0) f[((x0 + i) % S + S) % S + (((y0 + j) % S + S) % S) * S] = v;
  }
  const m = 0.15, inv2s2 = 1 / (2 * 0.017 * 0.017), dt = 0.1;
  const traj = [];
  let prevCx = null, drift = 0;
  const SQS = S * S;
  for (let g = 0; g < 300; g++) {
    for (let r = 0; r < S; r++) {
      const rb = r * S;
      for (let q = 0; q < S; q++) {
        let u = 0;
        for (let t = 0; t < nt; t++) {
          const q2 = q + tdq[t]; const r2 = r + tdr[t];
          u += tw[t] * f[(q2 < 0 ? q2 + S : q2 >= S ? q2 - S : q2) + (r2 < 0 ? r2 + S : r2 >= S ? r2 - S : r2) * S];
        }
        const du = u - m;
        nx[rb + q] = f[rb + q] + dt * (2 * Math.exp(-du * du * inv2s2) - 1);
      }
    }
    for (let i = 0; i < SQS; i++) { const v = nx[i]; f[i] = v < 0 ? 0 : v > 1 ? 1 : v; }
    if (g % 100 === 99) { let s = 0; for (let i = 0; i < SQS; i++) s += f[i]; traj.push(`d@${g + 1}=${(s / SQS).toFixed(4)}`); }
    // 质心（x/y 圆均值）
    let sx = 0, sy = 0, ax = 0, ay = 0;
    for (let r = 0; r < S; r++) for (let q = 0; q < S; q++) { const v = f[q + r * S]; if (v < 0.01) continue; const thx = 2 * Math.PI * q / S, thy = 2 * Math.PI * r / S; sx += Math.cos(thx) * v; sy += Math.sin(thx) * v; ax += Math.cos(thy) * v; ay += Math.sin(thy) * v; }
    const cx = ((Math.atan2(sy, sx) / (2 * Math.PI)) * S + S) % S;
    const cy = ((Math.atan2(ay, ax) / (2 * Math.PI)) * S + S) % S;
    if (prevCx !== null) drift += Math.hypot(wrapDelta(prevCx, cx, S), wrapDelta(prevCy, cy, S));
    prevCx = cx; prevCy = cy;
    if (g === 299) {
      const cxq = Math.round(cx), cyq = Math.round(cy);   // 双轴质心取窗
      let s2 = "";
      for (let j = -13; j <= 13; j++) { for (let i = -13; i <= 13; i++) { const v = f[(((cxq + i) % S + S) % S) + ((((cyq + j) % S + S) % S)) * S]; s2 += v < 0.005 ? "." : v < 0.3 ? "o" : v < 0.7 ? "O" : "@"; } s2 += "\n"; }
      snapsSq = s2;
    }
  }
  console.log(`[square] ${traj.join("  ")}`);
  console.log(`[square] 累计质心漂移=${drift.toFixed(1)} 格`);
  console.log("--- square gen299 形态（中心窗口）---");
  console.log(snapsSq);
}
let snapsSq = "";
const NN_SQ = WW * HH;

// ---------- 6. 用例（六角在前，方格对照最后） ----------
const GENS = 600;

runCase("A: Orbium 原参数(R=13,m=0.15,s=0.017) + 原版种子 → 六角", () => {
  api.applyPreset("solo");
  api.rules[0].m = 0.15; api.rules[0].s = 0.017;
  api.setR(13); api.setT(10); api.setCore("exp");
  placeSeed(WW >> 1, HH >> 1);
}, GENS);

runCase("B: 原版参数 + 随机0.5初始化 → 六角", () => {
  api.applyPreset("solo");
  api.rules[0].m = 0.15; api.rules[0].s = 0.017;
  api.setR(13); api.setT(10); api.setCore("exp");
  api.randomInit();
}, GENS);

runCase("D: 隔离 σ：R=13 + σ=0.016（我们默认σ）随机", () => {
  api.applyPreset("solo");
  api.rules[0].m = 0.15; api.rules[0].s = 0.016;
  api.setR(13); api.setT(10); api.setCore("exp");
  api.randomInit();
}, GENS);

runCase("E: 隔离 R：R=10 + σ=0.017（原版σ）随机", () => {
  api.applyPreset("solo");
  api.rules[0].m = 0.15; api.rules[0].s = 0.017;
  api.setR(10); api.setT(10); api.setCore("exp");
  api.randomInit();
}, GENS);

runCase("F: 我们默认（R=10, σ=0.016）随机 — 基准", () => {
  api.applyPreset("solo");
  api.setR(10); api.setT(10);
  api.randomInit();
}, GENS);

runCase("S: 【方格对照】Orbium 参数+种子 @ 方格晶格（验证规则代码本身）", () => { squareConv(); }, 1);
