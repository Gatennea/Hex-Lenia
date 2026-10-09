// ── 本文件由 tools/split_p2.js 自 index.html 一次性拆出（P2-⑤）──
"use strict";

// ---------- 增长函数（∈[−1,1]）----------
function gGauss(u, m, s) { const d = u - m; return 2 * Math.exp(-(d * d) / (2 * s * s)) - 1; }
function gPoly(u, m, s) {
  const d = u - m, k = 9 * s * s, t = 1 - d * d / k;
  return (d * d > k ? 0 : Math.pow(t, 4)) * 2 - 1;
}
function gRect(u, m, s) { return Math.abs(u - m) <= s ? 1 : -1; }
function gTrap(u, m, s) {
  const r = Math.abs(u - m), p = s / 2, q = s * 2;
  if (r <= p) return 1;
  if (r <= q) return 2 * (q - r) / (q - p) - 1;
  return -1;
}
const GROWTHS = { gaus: gGauss, poly: gPoly, rect: gRect, trap: gTrap };

// ---------- 核核心函数 Kc(r), r∈[0,1)，支撑 r<1 ----------
function kExp(r, a) {
  if (r <= 0 || r >= 1) return 0;
  const k = 4 * r * (1 - r);
  return Math.exp(a - a / k);
}
function kPoly(r, a) {
  if (r <= 0 || r >= 1) return 0;
  return Math.pow(4 * r * (1 - r), a);
}
function kRect(r) { return (r >= 0.25 && r <= 0.75) ? 1 : 0; }
const CORES = { exp: (r, a) => kExp(r, a), poly: (r, a) => kPoly(r, a), rect: (r) => kRect(r) };

// ════════════════════════════════════════════════════════════════
//  FFT：迭代 radix-2 Cooley-Tukey（行/列两遍 → 2D）
// ════════════════════════════════════════════════════════════════
const fftCache = new Map();
function makeFFT(n) {
  let t = fftCache.get(n);
  if (t) return t;
  const rev = new Uint32Array(n);
  let bits = Math.log2(n);
  for (let i = 0; i < n; i++) {
    let x = i, r = 0;
    for (let b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; }
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) {
    cos[k] = Math.cos(2 * Math.PI * k / n);
    sin[k] = Math.sin(2 * Math.PI * k / n);
  }
  t = { n, rev, cos, sin };
  fftCache.set(n, t);
  return t;
}

// 1D FFT，支持 stride（列变换用）；dir=-1 正变换，dir=+1 逆变换（含 1/n 归一）
function fft1d(re, im, off, stride, tbl, dir) {
  const n = tbl.n, rev = tbl.rev;
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (i < j) {
      const a = off + i * stride, b = off + j * stride;
      let t = re[a]; re[a] = re[b]; re[b] = t;
      t = im[a]; im[a] = im[b]; im[b] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1, st = n / len;
    for (let i = 0; i < n; i += len) {
      for (let j = 0; j < half; j++) {
        const w = j * st;
        const wr = tbl.cos[w];
        const wi = dir < 0 ? -tbl.sin[w] : tbl.sin[w];
        const a0 = off + (i + j) * stride, a1 = off + (i + j + half) * stride;
        const xr = re[a1], xi = im[a1];
        const tr = wr * xr - wi * xi;
        const ti = wr * xi + wi * xr;
        re[a1] = re[a0] - tr; im[a1] = im[a0] - ti;
        re[a0] += tr; im[a0] += ti;
      }
    }
  }
  if (dir > 0) {
    const sc = 1 / n;
    for (let i = 0; i < n; i++) { const a = off + i * stride; re[a] *= sc; im[a] *= sc; }
  }
}

function fft2d(re, im, w, h, dir) {
  const tw = makeFFT(w), th = makeFFT(h);
  for (let r = 0; r < h; r++) fft1d(re, im, r * w, 1, tw, dir);
  for (let c = 0; c < w; c++) fft1d(re, im, c, w, th, dir);
}

// ════════════════════════════════════════════════════════════════
//  核构建：六角距离 → 频域核（缓存）
//  六角轴向 (dq,dr) 的笛卡尔距离：dx = dq+dr/2, dy = (√3/2)·dr
// ════════════════════════════════════════════════════════════════
// 多环核形状（5f）：基环 core(d/R) + 可选第二环带（峰值在 ringC·R 处，沿用所选核型轮廓）
// ringB=0 时逐位等价单环；带内参数 t∈[0.5,1] 使所选核的峰值恰落在环心
function bandW(core, d, rad) {
  const v1 = core(d / rad, alpha);
  if (ringB <= 0) return v1;
  const t = 0.5 + Math.abs(d - ringC * rad) / (2 * RING_W * rad);
  return (1 - ringB) * v1 + ringB * core(t, alpha);
}
function buildKernel(rad) {
  const sp = new Float64Array(N);          // 空间核，中心在索引 0
  const taps = [];                         // {dq,dr,w} 供自检
  const bound = Math.ceil(rad * KERNEL_BOUND_RATIO) + 1;
  const core = CORES[coreType];
  let sum = 0;
  for (let dr = -bound; dr <= bound; dr++) {
    const dy = (SQ3 / 2) * dr;
    for (let dq = -bound; dq <= bound; dq++) {
      const dx = dq + dr / 2;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= rad) continue;              // 支撑 |x| < R（论文）
      const w = bandW(core, d, rad);
      if (w === 0) continue;
      const qi = ((dq % W) + W) % W, ri = ((dr % H) + H) % H;
      sp[ri * W + qi] = w;
      taps.push(dq, dr, w);
      sum += w;
    }
  }
  // ΣK = 1（空间核与 taps 同步归一化，保证 FFT 路径与直接卷积一致）
  if (sum > 0) {
    for (let i = 0; i < N; i++) sp[i] /= sum;
    for (let t = 2; t < taps.length; t += 3) taps[t] /= sum;
  }
  const re = Float64Array.from(sp), im = new Float64Array(N);
  fft2d(re, im, W, H, -1);
  return { re, im, sp, taps, sum };
}

// 规则参数变化 → 重建对应核；R/α/核类型 → 重建全部
function rebuildKernels(all) {
  for (let k = 0; k < rules.length; k++) {
    // per-rule R：优先取规则自己的 rad，缺失才回退全局 R（5d）
    if (all || !rules[k].kf) {
      const rad = rules[k].rad != null ? rules[k].rad : R;
      rules[k].rad = rad;
      rules[k].kf = buildKernel(rad);
    }
  }
}
// 全局 R 写入的唯一入口：同步所有规则的 rad——根治“快照压过新值”类错配（见 rad 事故复盘）
function setGlobalR(v) {
  R = v;
  for (const r of rules) r.rad = v;
}

// ════════════════════════════════════════════════════════════════
//  生态预设（原版多通道规则列表结构）
// ════════════════════════════════════════════════════════════════
const PRESETS = {
  solo: {
    ch: 1,
    rules: [{ src: 0, dst: 0, m: 0.15, s: 0.016, h: 1, g: "gaus" }]
  },
  predator: {
    ch: 2,
    // 参数经 sweep 调优验证（800 步双物种共存）：
    // 猎物 = solo 已证参数；压制规则宽而弱 (s=0.15, h=0.35)，否则窄σ猎物
    // 会边侵蚀边崩塌；捕食者稀疏播种 (initMul)，否则初始高密度压制直接杀死猎物
    initMul: [1, 0.08],
    rules: [
      { src: 0, dst: 0, m: 0.15, s: 0.016, h: 1, g: "gaus", label: "猎物·自持" },
      { src: 0, dst: 1, m: 0.18, s: 0.060, h: 1, g: "gaus", label: "猎物→捕食" },
      { src: 1, dst: 1, m: 0.12, s: 0.080, h: 1, g: "gaus", label: "捕食·自持" },
      { src: 1, dst: 0, m: 0.02, s: 0.150, h: 0.35, g: "gaus", label: "捕食→压制" }
    ]
  },
  compete: {
    ch: 3,
    rules: [
      { src: 0, dst: 0, m: 0.15, s: 0.020, h: 1, g: "gaus", label: "A·自持" },
      { src: 1, dst: 1, m: 0.15, s: 0.020, h: 1, g: "gaus", label: "B·自持" },
      { src: 2, dst: 2, m: 0.15, s: 0.020, h: 1, g: "gaus", label: "C·自持" },
      { src: 1, dst: 0, m: 0.08, s: 0.040, h: 1, g: "gaus", label: "B→压A" },
      { src: 0, dst: 1, m: 0.08, s: 0.040, h: 1, g: "gaus", label: "A→压B" },
      { src: 2, dst: 1, m: 0.08, s: 0.040, h: 1, g: "gaus", label: "C→压B" },
      { src: 1, dst: 2, m: 0.08, s: 0.040, h: 1, g: "gaus", label: "B→压C" },
      { src: 0, dst: 2, m: 0.08, s: 0.040, h: 1, g: "gaus", label: "A→压C" },
      { src: 2, dst: 0, m: 0.08, s: 0.040, h: 1, g: "gaus", label: "C→压A" }
    ]
  }
};

function syncSrcChannels() {
  const s = new Set(rules.map(r => r.src));
  srcChannels = [...s];
}

function applyPreset(name) {
  const p = PRESETS[name];
  CH = p.ch;
  rules = p.rules.map(r => ({ ...r, rad: R }));
  curRule = 0; paintCh = 0;
  initMul = p.initMul || null;
  allocBuffers();
  allocBucketBuffers();   // 分桶数组大小依赖 CH（64 或 512），切换时必须重分
  syncSrcChannels();
  rebuildKernels(true);
  randomInit();
  gen = 0;
  syncRuleUI();
  needRender = true;
}

function allocBuffers() {
  fields = []; nexts = []; D = []; Dn = []; chFft = [];
  bufRe = null; bufIm = null;   // ⚠ 网格可能已变：必须按新 N 重建，否则越界写被丢弃 → 卷积残缺 → 场清零（空间>128 必白屏的根因）
  for (let c = 0; c < CH; c++) {
    fields.push(new Float64Array(N));
    nexts.push(new Float64Array(N));
    D.push(new Float64Array(N));
    Dn.push(0);
    chFft.push({ re: new Float64Array(N), im: new Float64Array(N) });
  }
  texDirty = true;
}

// ════════════════════════════════════════════════════════════════
//  初始化
// ════════════════════════════════════════════════════════════════
function randomInit() {
  for (let c = 0; c < CH; c++) {
    const f = fields[c];
    const d = initMul ? dens * initMul[c] : dens;
    for (let i = 0; i < N; i++) f[i] = Math.random() < d ? Math.random() : 0;
  }
  texDirty = true;
  needRender = true;
}
function clearAll() {
  for (let c = 0; c < CH; c++) fields[c].fill(0);
  gen = 0; texDirty = true; needRender = true;
}

// 🪼 水母：玩家在 gen852 发现的滑行生物（22×22 裁剪，值 0-100 量化）
// 实测：2000+ 步存活，密度 0.0030，漂移 0.325 格/步，细胞数 143-155 呼吸波动
const CREATURE_JELLY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHGRkXFA0EAAAAAAAAAAAAAAAAAAMqCgQLFh4aDgMAAAAAAAAAAAAAAEgBAAAACiMrIxYHAAAAAAAAAAAACjEAAAAABzNCOCoZCAAAAAAAAAAASQ8AAAAAElZYRzwsGQYAAAAAAAABDREAAAAALmRYQ0Y+KRcCAAAAAAADABEAAAAASGNZQk5PMyAPAAAAAAAAAAoNAAAOPVZbXWRXLR0aBAAAAAAAAAAOCQAXLzxOYGQ9EAsVDwAAAAAAAAADDw0XIyhASjsAAAAJFwAAAAAAAAAAAx8qGR4oLQAAAAAAGgAAAAAAAAAAABwlJR4UAAAAAAAAHgAAAAAAAAAAAA8XKiYFAAAAAAAAKwAAAAAAAAAAAAAKFxcRCAAAAAAZHwAAAAAAAAAAAAAAAAAHDxAIBxBQAAAAAAAAAAAAAAAAAAAAAAcNEEcAAAAAAAAAAAAAAAAAAAAAAAAACAIAAAAAAAAAAAAAAAAAAAAAAAAADQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

const LIFE_DATA = (typeof LENIA_LIFEFORMS !== "undefined") ? LENIA_LIFEFORMS : [];

// ── 原版生物库：规则串解析 + zip 种子解码（原版 ToCellArray 移植）──
function lifeRuleParse(rs) {
  const o = { R: 10, T: 10, m: 0.15, s: 0.016, core: "exp", grow: "gaus" };
  const mR = rs.match(/R=(\d+)/); if (mR) o.R = +mR[1];
  const mk = rs.match(/k=([a-z0-9]+(?:\/[0-9]+)*)/);
  if (mk) { const c = mk[1]; o.core = c === "quad4" ? "poly" : (c === "stpz1/4" || c === "stpz" || c === "life") ? "rect" : "exp"; }
  const md = rs.match(/d=([a-z0-9]+)\((-?[\d.eE+-]+),(-?[\d.eE+-]+)\)/);
  if (md) { o.grow = md[1] === "quad4" ? "poly" : md[1] === "stpz" ? "rect" : md[1] === "trap" ? "trap" : "gaus"; o.m = +md[2]; o.s = +md[3]; }
  const mt = rs.match(/\*([\d.]+)\s*$/); if (mt && +mt[1] > 0) o.T = Math.round(1 / +mt[1]);
  return o;
}
function lifeToCells(st) {
  const isZip = st.startsWith("(zip)");
  if (isZip) st = st.substring(5);
  const sep = isZip ? "" : ",";
  const fromZip = c => c === "0" ? 0 : c === "1" ? 100 : c.charCodeAt(0) - 191;
  const fromRep = t => t === "" ? 1 : (t.charCodeAt(0) >= 192 ? (t.length === 1 ? fromZip(t) : fromZip(t[0]) * 100 + fromZip(t[1])) : parseInt(t, 10));
  let rows = st.split("/"), w = 0;
  for (let i = 0; i < rows.length; i++) {
    let row = rows[i].trim();
    if (isZip) {
      const segs = row.split("-"); row = "";
      for (const seg of segs) { const p = seg.split("."); row += p.length === 1 ? seg : "0".repeat(fromRep(p[0])) + (p[1] || ""); }
    }
    rows[i] = row = row.split(sep);
    w = Math.max(w, row.length);
    if (isZip) for (let j = 0; j < row.length; j++) { const v = fromZip(row[j]) / 100; row[j] = v < 0 ? 0 : v; }
    else for (let j = 0; j < row.length; j++) row[j] = parseFloat(row[j]) || 0;
  }
  return { arr: rows, w, h: rows.length };
}
// ════════════════════════════════════════════════════════════════
//  模拟步进（FFT 卷积，与原版 NextGen/calc_once 同构）
// ════════════════════════════════════════════════════════════════
let bufRe = null, bufIm = null;

function step() {
  const t0 = performance.now();
  if (!bufRe) { bufRe = new Float64Array(N); bufIm = new Float64Array(N); }

  // 需要作为源的通道 → 前向 FFT 缓存
  for (let u = 0; u < srcChannels.length; u++) {
    const c = srcChannels[u];
    const fc = chFft[c];
    fc.re.set(fields[c]);
    fc.im.fill(0);
    fft2d(fc.re, fc.im, W, H, -1);
  }

  for (let c = 0; c < CH; c++) { D[c].fill(0); Dn[c] = 0; }

  // 每条规则：U = IFFT(FFT(A[src]) ⊙ FFT(K))，D[dst] += h·G(U)
  for (const rule of rules) {
    const fc = chFft[rule.src], kf = rule.kf;
    const re = bufRe, im = bufIm;
    for (let i = 0; i < N; i++) {
      re[i] = fc.re[i] * kf.re[i] - fc.im[i] * kf.im[i];
      im[i] = fc.re[i] * kf.im[i] + fc.im[i] * kf.re[i];
    }
    fft2d(re, im, W, H, 1);           // 逆变换（已含 1/N 归一）
    const G = GROWTHS[rule.g], m = rule.m, s = rule.s, h = rule.h;
    const d = D[rule.dst];
    for (let i = 0; i < N; i++) d[i] += h * G(re[i], m, s);
    Dn[rule.dst] += h;
  }

  // A' = clip(A + dt·D/Σh, 0, 1)
  const dt = 1 / T;
  for (let c = 0; c < CH; c++) {
    if (Dn[c] <= 0) continue;
    const f = dt / Dn[c];
    const a = fields[c], b = nexts[c], d = D[c];
    for (let i = 0; i < N; i++) {
      const v = a[i] + f * d[i];
      b[i] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
    fields[c] = b; nexts[c] = a;      // 双缓冲切换
  }
  gen++;
  texDirty = true;
  stepMs = stepMs * 0.9 + (performance.now() - t0) * 0.1;
}

