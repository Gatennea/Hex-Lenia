// ── 本文件由 tools/split_p2.js 自 index.html 一次性拆出（P2-⑤）──
"use strict";
// ── 页内诊断：日志环缓存 + 即时提示（零依赖，不需要后端）──
window.__dbgLog = [];
function dbg(msg) {
  window.__dbgLog.push(new Date().toTimeString().slice(0, 8) + " " + msg);
  if (window.__dbgLog.length > 60) window.__dbgLog.shift();
  console.info("[HexLenia]", msg);
}
function showToast(msg, ms) {
  let t = document.getElementById("toastBox");
  if (!t) {
    t = document.createElement("div");
    t.id = "toastBox";
    t.style.cssText = "position:fixed;left:50%;bottom:72px;transform:translateX(-50%);background:rgba(18,22,32,.94);color:#e8f0ff;padding:9px 15px;border-radius:9px;font-size:13px;line-height:1.5;z-index:99;pointer-events:none;transition:opacity .4s;border:1px solid rgba(120,160,255,.45);max-width:86vw;box-shadow:0 4px 18px rgba(0,0,0,.4)";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = "1";
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { t.style.opacity = "0"; }, ms || 2800);
}
function placeLife(idx, cx, cy) {
  const e = LIFE_DATA[idx];
  dbg("placeLife idx=" + idx + (e ? " → " + e.name : " ✗数据不存在"));
  if (!e) { showToast("✗ 放置失败：LIFE_DATA[" + idx + "] 不存在（lifecreatures.js 没加载成功？）"); return; }
  const ci = e.rec.indexOf(";cells=");
  if (ci < 0) { showToast("✗ " + e.name + " 记录缺 cells 段"); return; }
  const p = lifeRuleParse(e.rec.slice(0, ci));
  const seed = lifeToCells(e.rec.slice(ci + 7));
  // 自动升网格：实测 Bug(R=26, 38×38) 在 128² 各核半径全灭、256² 存活 → 需 ≥6×R 且 ≥1.8×种子边
  let gridNote = "";
  const need = Math.max(6 * p.R, seed.w * 1.8, seed.h * 1.8);
  let g = 32; while (g < need && g < 512) g *= 2;
  if (g > W) {
    setGrid(g); clearAll();
    cx = W >> 1; cy = H >> 1;   // 升网格会清空场景，改为居中放置
    gridNote = "　⚠ 网格升至 " + g + "²，原内容清空";
    dbg("自动升网格 -> " + g + "² (R=" + p.R + ", 种子" + seed.w + "x" + seed.h + ")");
  }
  if (CH === 1) {   // 物种参数即身份（多物种时不动规则）
    setGlobalR(p.R); T = p.T;
    rules[0].m = p.m; rules[0].s = p.s; rules[0].g = p.grow;
    coreType = p.core;
    rebuildKernels(true);
    $("sR").value = R; $("vR").textContent = R;
    $("sT").value = T; $("vT").textContent = T;
    $("selCore").value = coreType;
    syncParamUI();
  }
  const f = fields[paintCh];
  const x0 = cx - (seed.w >> 1), y0 = cy - (seed.h >> 1);
  let cnt = 0;
  for (let r = 0; r < seed.h; r++) for (let q = 0; q < seed.w; q++) {
    const v = (seed.arr[r] || [])[q];   // arr 是二维行数组
    if (v > 0 && v <= 1) {
      const qq = ((x0 + q) % W + W) % W, rr = ((y0 + r) % H + H) % H;
      f[qq + rr * W] = v; cnt++;
    }
  }
  showToast("✓ 已放置 " + e.name + " [" + e.code + "]（" + cnt + "格）" + gridNote +
    (CH === 1 ? "　R=" + R + " μ=" + rules[0].m + " σ=" + rules[0].s : "（多物种模式，未改参数）"));
  dbg("placed " + e.name + " @(" + cx + "," + cy + ") cells=" + cnt + " 格, 栅格=" + seed.w + "x" + seed.h);
}

function applyJellyParams() {
  // 生物对参数极敏感：单物种时锁定它的“家园参数”（经典预设）；多物种不动规则
  if (CH !== 1) return;
  R = 10; T = 10;
  rules[0].m = 0.15; rules[0].s = 0.016; rules[0].g = "gaus";
  rebuildKernels(true);
  $("sR").value = R; $("vR").textContent = R;
  $("sT").value = T; $("vT").textContent = T;
  syncParamUI();
}
// 图案位图（局部坐标，中心 ≈ ((w-1)/2, (h-1)/2)）
function patternBitmap(name) {
  if (name === "jelly") {
    const u8 = b64ToU8(CREATURE_JELLY), w = 22, h = 22;
    const data = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) data[i] = u8[i] / 100;
    return { w, h, data };
  }
  if (name === "disk") {
    const rad = R * 1.2, s = Math.ceil(rad) + 1, w = 2 * s + 1;
    const data = new Float64Array(w * w);
    for (let r = 0; r < w; r++) for (let q = 0; q < w; q++) {
      const dx = q - s + (r - s) / 2, dy = (SQ3 / 2) * (r - s);
      if (dx * dx + dy * dy < rad * rad) data[q + r * w] = Math.random();
    }
    return { w, h: w, data };
  }
  if (name === "ring") {
    const r1 = R * 0.8, r2 = R * 1.4, s = Math.ceil(r2) + 1, w = 2 * s + 1;
    const data = new Float64Array(w * w);
    for (let r = 0; r < w; r++) for (let q = 0; q < w; q++) {
      const dx = q - s + (r - s) / 2, dy = (SQ3 / 2) * (r - s);
      const d2 = dx * dx + dy * dy;
      if (d2 > r1 * r1 && d2 < r2 * r2) data[q + r * w] = Math.random();
    }
    return { w, h: w, data };
  }
  if (name === "stripe") {
    const bh = Math.max(1, Math.ceil(R * 0.6) - 1), w = W, h = 2 * bh + 1;
    const data = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) data[i] = Math.random();
    return { w, h, data };
  }
  return null;
}

// CG 旋转：在六角笛卡尔平面旋转（视觉真实角度），反向映射 + 双线性重采样回晶格
// 绕整数格点（保证 60° 倍数时晶格自同构近乎无损）
function rotateBitmap(bm, deg) {
  if (!deg) return bm;
  const a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const H3 = SQ3 / 2;
  const cx0 = Math.round((bm.w - 1) / 2), cy0 = Math.round((bm.h - 1) / 2);  // 旋转中心=格点
  const Cx = cx0 + cy0 / 2, Cy = H3 * cy0;                                    // 中心的笛卡尔坐标
  // 源晶格（平行四边形）四角 → 旋转 → AABB（绝对笛卡尔）
  const corners = [[0, 0], [bm.w - 1, 0], [0, bm.h - 1], [bm.w - 1, bm.h - 1]];
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (const [i, j] of corners) {
    const x = (i + j / 2) - Cx, y = H3 * j - Cy;
    const rx = x * ca - y * sa, ry = x * sa + y * ca;
    if (rx < minx) minx = rx; if (rx > maxx) maxx = rx;
    if (ry < miny) miny = ry; if (ry > maxy) maxy = ry;
  }
  minx += Cx; maxx += Cx; miny += Cy; maxy += Cy;
  // 输出轴向包围：J = Y/H3, I = X − J/2
  const j0 = Math.floor(miny / H3), j1 = Math.ceil(maxy / H3);
  const i0 = Math.floor(minx - j1 / 2), i1 = Math.ceil(maxx - j0 / 2);
  const w = i1 - i0 + 1, h = j1 - j0 + 1;
  const data = new Float64Array(w * h);
  const src = (i, j) => (i < 0 || i >= bm.w || j < 0 || j >= bm.h) ? 0 : bm.data[i + j * bm.w];
  for (let jj = 0; jj < h; jj++) {
    const J = j0 + jj, Y = H3 * J;
    for (let ii = 0; ii < w; ii++) {
      const I = i0 + ii, X = I + J / 2;
      // 反向旋转回源笛卡尔 → 源轴向分数坐标 → 双线性
      const dx = X - Cx, dy = Y - Cy;
      const qx = dx * ca + dy * sa + Cx, qy = -dx * sa + dy * ca + Cy;
      const rf = qy / H3, qf = qx - rf / 2;
      const i1s = Math.floor(qf), j1s = Math.floor(rf);
      const fx = qf - i1s, fy = rf - j1s;
      const v = src(i1s,j1s)*(1-fx)*(1-fy) + src(i1s+1,j1s)*fx*(1-fy) + src(i1s,j1s+1)*(1-fx)*fy + src(i1s+1,j1s+1)*fx*fy;
      if (v > 0.004) data[ii + jj * w] = v;
    }
  }
  return { w, h, data };
}

function stampBitmap(bm, cx, cy) {
  const f = fields[paintCh];
  const x0 = cx - ((bm.w - 1) >> 1), y0 = cy - ((bm.h - 1) >> 1);
  for (let r = 0; r < bm.h; r++) for (let q = 0; q < bm.w; q++) {
    const v = bm.data[q + r * bm.w];
    if (v > 0) {
      const qq = ((x0 + q) % W + W) % W, rr = ((y0 + r) % H + H) % H;
      f[qq + rr * W] = v;
    }
  }
}

// 图案印章：不清理现有内容，在指定六角坐标处放置；径向图形不旋转
function placePattern(name, cx, cy) {
  if (name.startsWith("life:")) {
    placeLife(+name.slice(5), cx, cy);
    texDirty = true;
    needRender = true;
    return;
  }
  if (name === "jelly") applyJellyParams();
  let bm = patternBitmap(name);
  if (bm && stampAngle && (name === "jelly" || name === "stripe")) bm = rotateBitmap(bm, stampAngle);
  if (bm) stampBitmap(bm, cx, cy);
  texDirty = true;
  needRender = true;
}

// 整场模式（清空+居中）：供脚本/一键初始化使用
function loadPattern(name) {
  for (let c = 0; c < CH; c++) fields[c].fill(0);
  placePattern(name, W >> 1, H >> 1);
  gen = 0; texDirty = true; needRender = true;
}

// ════════════════════════════════════════════════════════════════
//  坐标换算 / 绘制
// ════════════════════════════════════════════════════════════════
function screenToWorld(sx, sy) { return [(sx - view.x) / view.z, (sy - view.y) / view.z]; }
function worldToAxial(wx, wy) {
  const r = wy / (SQ3 / 2);
  const q = wx - r / 2;
  // cube rounding
  let x = q, z = r, y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return [rx, rz];
}
function paintAt(sx, sy, erase) {
  const [wx, wy] = screenToWorld(sx, sy);
  const [q0, r0] = worldToAxial(wx, wy);
  const f = fields[paintCh];
  const b = brushR;
  for (let dr = -b; dr <= b; dr++) {
    for (let dq = -b; dq <= b; dq++) {
      const dx = dq + dr / 2, dy = (SQ3 / 2) * dr;
      if (dx * dx + dy * dy > b * b + 0.01) continue;
      const q = ((q0 + dq) % W + W) % W, r = ((r0 + dr) % H + H) % H;
      f[q + r * W] = erase ? 0 : 1;
    }
  }
  texDirty = true;
  needRender = true;
}

// ════════════════════════════════════════════════════════════════
//  鼠标交互
// ════════════════════════════════════════════════════════════════
let dragging = 0, lastX = 0, lastY = 0, painting = false;
stage.addEventListener("contextmenu", e => e.preventDefault());
stage.addEventListener("mousedown", e => {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  if (e.button === 1 || e.button === 2 || e.shiftKey) {
    dragging = e.button + 1; lastX = e.clientX; lastY = e.clientY;
    stage.classList.add("panning");
    e.preventDefault();
  } else if (e.button === 0) {
    if (stampPattern) {
      // 印章模式：点击处放置选中图案（不清场）
      const [q0, r0] = worldToAxial(...screenToWorld(sx, sy));
      dbg("画布点击 stamp=" + stampPattern + " @(" + q0 + "," + r0 + ")");
      placePattern(stampPattern, q0, r0);
    } else {
      dbg("画布点击 → 画笔模式（stampPattern 为空）");
      painting = true;
      paintAt(sx, sy, e.altKey);
    }
  }
});
window.addEventListener("mousemove", e => {
  if (dragging) {
    view.x += e.clientX - lastX; view.y += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    needRender = true;
  } else if (painting) {
    const rect = canvas.getBoundingClientRect();
    paintAt(e.clientX - rect.left, e.clientY - rect.top, e.altKey);
  }
});
window.addEventListener("mouseup", () => { dragging = 0; painting = false; stage.classList.remove("panning"); });
stage.addEventListener("wheel", e => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  const [wx, wy] = screenToWorld(sx, sy);
  const f = Math.pow(1.0015, -e.deltaY);
  view.z = Math.min(40, Math.max(0.5, view.z * f));
  view.x = sx - wx * view.z;
  view.y = sy - wy * view.z;
  updateTexScale();           // 缩放改变 → 纹理倍率自适应
  needRender = true;
}, { passive: false });

window.addEventListener("keydown", e => {
  if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "SELECT") {
    e.preventDefault(); toggleRun();
  }
});

// ════════════════════════════════════════════════════════════════
//  截图导出（3× 高清 + 信息栏）
// ════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════
//  存档：场景导出/导入（JSON + base64 场数据）
// ═══════════════════════════════════════════════════
function u8ToB64(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
  return btoa(s);
}
function b64ToU8(b64) {
  const s = atob(b64); const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
function serializeState() {
  const cells = [];
  for (let c = 0; c < CH; c++) {
    const u8 = new Uint8Array(N), f = fields[c];
    for (let i = 0; i < N; i++) {
      let v = Math.round(f[i] * 100);
      if (v < 0) v = 0; else if (v > 100) v = 100;
      u8[i] = v;
    }
    cells.push(u8ToB64(u8));
  }
  return {
    app: "hexlenia", v: 1,
    grid: W, ch: CH, gen,
    R, T, alpha, coreType,
    rules: rules.map(r => ({ src: r.src, dst: r.dst, m: r.m, s: r.s, h: r.h, g: r.g })),
    scheme, tone, lightBg,
    cells
  };
}
function deserializeState(o) {
  if (!o || o.app !== "hexlenia" || o.v !== 1) throw new Error("不是有效的 hexlenia 存档");
  if (![32, 64, 128, 256, 512].includes(o.grid)) throw new Error("网格值无效: " + o.grid);
  if (!Array.isArray(o.rules) || !o.rules.length || !Array.isArray(o.cells)) throw new Error("存档缺少规则或场数据");
  // 参数
  setGlobalR(o.R); T = o.T; alpha = o.alpha; coreType = o.coreType;
  // 网格 / 通道 / 缓冲
  W = H = o.grid; N = W * W;
  CH = Math.max(1, Math.min(3, o.ch | 0));
  initMul = null;
  allocBuffers();
  allocBucketBuffers();
  // 规则
  rules = o.rules.slice(0, 12).map(r => ({
    src: Math.min(CH - 1, r.src | 0), dst: Math.min(CH - 1, r.dst | 0),
    m: +r.m, s: +r.s, h: +r.h, g: GROWTHS[r.g] ? r.g : "gaus"
  }));
  syncSrcChannels();
  rebuildKernels(true);
  // 场
  for (let c = 0; c < CH; c++) {
    const u8 = b64ToU8(o.cells[c]);
    const f = fields[c];
    for (let i = 0; i < N && i < u8.length; i++) f[i] = u8[i] / 100;
  }
  gen = o.gen | 0;
  // 观感
  if (SCHEMES[o.scheme] !== undefined || o.scheme === "teal") scheme = o.scheme;
  tone = o.tone === "smooth" ? "smooth" : "bands";
  lightBg = !!o.lightBg;
  $("selColor").value = scheme;
  $("selBg").value = lightBg ? "light" : "dark";
  $("selTone").value = tone;
  applyColorAssets();
  // UI 同步
  curRule = 0;
  $("sR").value = R; $("vR").textContent = R;
  $("sT").value = T; $("vT").textContent = T;
  $("sA").value = alpha; $("vA").textContent = alpha;
  $("selCore").value = coreType;
  $("selGrid").value = String(W);
  syncRuleUI();
  syncParamUI();
  fitView();
  updateTexScale();
  needRender = true;
}
function exportFile() {
  const data = JSON.stringify(serializeState());
  const blob = new Blob([data], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const d = new Date(), p = n => String(n).padStart(2, "0");
  a.download = `hexlenia-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function screenshot() {
  const scale = 3;
  const ow = Math.round(CANVAS_W * scale), oh = Math.round((CANVAS_H + 26) * scale);
  const oc = document.createElement("canvas");
  oc.width = ow; oc.height = oh;
  const ox = oc.getContext("2d");
  ox.fillStyle = bgFill();
  ox.fillRect(0, 0, ow, oh);
  ox.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, CANVAS_W * scale, CANVAS_H * scale);
  // 信息栏
  ox.fillStyle = "#101026";
  ox.fillRect(0, CANVAS_H * scale, ow, 26 * scale);
  ox.fillStyle = "#8cf";
  ox.font = `${13 * scale / 2}px monospace`;
  const statsTxt = document.getElementById("stats").textContent.replace(/\s+/g, " ");
  ox.fillText(`hexLenia | ${W}×${H} | gen=${gen} | ${new Date().toLocaleString("zh-CN")} | ${statsTxt}`, 12, CANVAS_H * scale + 17 * scale / 2 + 2);
  const link = document.createElement("a");
  link.download = `hexlenia-${Date.now()}.png`;
  link.href = oc.toDataURL("image/png");
  link.click();
}

// ════════════════════════════════════════════════════════════════
//  自检：FFT 卷积 vs 直接卷积（六角环面），返回最大误差
// ════════════════════════════════════════════════════════════════
function selfTest() {
  const A = new Float64Array(N);
  for (let i = 0; i < N; i++) A[i] = Math.random();
  const kf = buildKernel(Math.min(5, R));
  // FFT 路径
  const fr = Float64Array.from(A), fi = new Float64Array(N);
  fft2d(fr, fi, W, H, -1);
  const tr = new Float64Array(N), ti = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    tr[i] = fr[i] * kf.re[i] - fi[i] * kf.im[i];
    ti[i] = fr[i] * kf.im[i] + fi[i] * kf.re[i];
  }
  fft2d(tr, ti, W, H, 1);
  // 直接路径（kernels taps）
  const naive = new Float64Array(N);
  const tp = kf.taps;
  for (let r = 0; r < H; r++) {
    for (let q = 0; q < W; q++) {
      let u = 0;
      for (let t = 0; t < tp.length; t += 3) {
        const dq = tp[t], dr = tp[t + 1], w = tp[t + 2];
        const q2 = (((q + dq) % W) + W) % W, r2 = (((r + dr) % H) + H) % H;
        u += w * A[q2 + r2 * W];
      }
      naive[q + r * W] = u;
    }
  }
  let maxErr = 0;
  for (let i = 0; i < N; i++) maxErr = Math.max(maxErr, Math.abs(tr[i] - naive[i]));
  return { maxErr, taps: tp.length / 3, pass: maxErr < 1e-9 };
}
window.__selfTest = selfTest;

// ════════════════════════════════════════════════════════════════
//  UI 绑定
// ════════════════════════════════════════════════════════════════
const $ = id => document.getElementById(id);
const btnRun = $("btnRun");

function toggleRun() {
  running = !running;
  btnRun.textContent = running ? "⏸ 暂停" : "▶ 继续";
  btnRun.classList.toggle("run", running);
}
btnRun.addEventListener("click", toggleRun);
$("btnStep").addEventListener("click", () => { if (running) toggleRun(); step(); needRender = true; });
$("btnRandom").addEventListener("click", () => { randomInit(); gen = 0; });
$("btnClear").addEventListener("click", clearAll);
$("btnShot").addEventListener("click", screenshot);
$("btnExport").addEventListener("click", exportFile);
$("btnImport").addEventListener("click", () => $("fileImport").click());
$("fileImport").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const rd = new FileReader();
  rd.onload = () => {
    try { deserializeState(JSON.parse(rd.result)); }
    catch (err) { alert("导入失败：" + err.message); }
  };
  rd.readAsText(file);
  e.target.value = "";
});
let stampPattern = "";          // 当前印章（"" = 笔刷绘制模式）
let stampAngle = 0;             // 印章旋转角度（度，对水母/条纹生效）
const HINT_BASE = "左键绘制 · 右键/中键拖拽平移 · 滚轮缩放 · Alt+左键擦除 · 空格暂停 · 点「? 帮助」看参数说明";
function updatePatHint() {
  const h = $("hintLine");
  if (stampPattern) {
    const nm = $("selPattern").selectedOptions[0].textContent;
    h.innerHTML = `📌 <b>印章模式</b>：点击画布放置「${nm}」（保留已有内容，可连续放置；生物类会自动设置其物种参数）· 选「— 图案 —」恢复笔刷`;
  } else {
    h.innerHTML = HINT_BASE;
  }
}
$("selPattern").addEventListener("change", e => {
  stampPattern = e.target.value;
  updatePatHint();
  const txt = e.target.selectedOptions[0] ? e.target.selectedOptions[0].textContent : stampPattern;
  dbg("选中图案 -> " + stampPattern + "（" + txt + "）");
  showToast("🖨 印章模式：" + txt + "　→ 点击画布放置");
});
// 🧪 自检：URL 加 ?selftest=1 自动跑完整放置链路并显示判定
if (typeof location !== "undefined" && location.search.indexOf("selftest") >= 0) setTimeout(() => {
  const sel = $("selPattern");
  const hasOpt = !!sel.querySelector('option[value="life:1"]');
  if (hasOpt) { sel.value = "life:1"; sel.dispatchEvent(new Event("change")); }
  const stampOK = stampPattern === "life:1";
  const mB = rules[0].m;
  let d0 = 0; const f0 = fields[0]; for (let i = 0; i < N; i++) d0 += f0[i];
  const rect = canvas.getBoundingClientRect();
  stage.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, button: 0 }));
  let d1 = 0; for (let i = 0; i < N; i++) d1 += f0[i];
  const pass = stampOK && (d1 - d0) > 0.5;
  const v = "自检｜数据:" + LIFE_DATA.length + " 选项:" + (hasOpt ? "有" : "无") +
    " 选中联动:" + (stampOK ? "OK" : "FAIL") + " 参数切换:" + (rules[0].m !== mB ? "OK" : "未变") +
    " 细胞增量:" + (d1 - d0).toFixed(1) + " → " + (pass ? "PASS ✓" : "FAIL ✗（必须>0.5）");
  dbg(v); showToast(v, 25000);
}, 700);
bindSlider("sRot", "vRot", v => { stampAngle = v; }, v => v + "°");
// 参数预设（sweep2.js 扫参结果：JEWEL = 稳定+紧凑+有动态）
const PARAM_PRESETS = {
  classic: { R: 10, T: 10, m: 0.15, s: 0.016, note: "当前默认" },
  active:  { R: 10, T: 10, m: 0.17, s: 0.014, note: "活性 5×，结构变化最快" },
  wide:    { R: 10, T: 10, m: 0.17, s: 0.050, note: "宽波带，结构更粗壮" },
  sparse:  { R: 10, T: 10, m: 0.13, s: 0.014, note: "低密度，稀疏斑点" }
};
$("selParam").addEventListener("change", e => {
  const p = PARAM_PRESETS[e.target.value];
  if (!p) return;
  setGlobalR(p.R); T = p.T;
  for (const r of rules) { r.m = p.m; r.s = p.s; }
  rebuildKernels(true);
  $("sR").value = R; $("vR").textContent = R;
  $("sT").value = T; $("vT").textContent = T;
  syncParamUI();          // μ/σ 滑块 + G 曲线同步
  needRender = true;
});
$("selView").addEventListener("change", e => { viewMode = e.target.value; needRender = true; });
$("selColor").addEventListener("change", e => { scheme = e.target.value; applyColorAssets(); });
$("selBg").addEventListener("change", e => { lightBg = e.target.value === "light"; applyColorAssets(); });
$("selTone").addEventListener("change", e => { tone = e.target.value; applyColorAssets(); });
function applyColorAssets() {
  rebuildColorAssets();
  texDirty = true;   // 纹理颜色烘焙自 LUT，必须重建
  document.body.classList.toggle("light", lightBg);
  needRender = true;
  drawPlots();
}
$("btnHelp").addEventListener("click", () => {
  const h = $("help"), on = h.style.display === "block";
  h.style.display = on ? "none" : "block";
  $("btnHelp").classList.toggle("active", !on);
});

function bindSlider(id, vid, fn, fmt) {
  const el = $(id), lab = $(vid);
  el.addEventListener("input", () => {
    const v = parseFloat(el.value);
    lab.textContent = fmt ? fmt(v) : v;
    fn(v);
    drawPlots();
  });
}
bindSlider("sR", "vR", v => { setGlobalR(v); rebuildKernels(true); }, v => v.toFixed(0));
bindSlider("sM", "vM", v => { if (rules[curRule]) rules[curRule].m = v; }, v => v.toFixed(3));
bindSlider("sS", "vS", v => { if (rules[curRule]) rules[curRule].s = v; }, v => v.toFixed(3));
bindSlider("sT", "vT", v => { T = v; }, v => v.toFixed(0));
bindSlider("sA", "vA", v => { alpha = v; rebuildKernels(true); }, v => v.toFixed(0));
bindSlider("sSpeed", "vSpeed", v => { speed = v; }, v => v + "/s");
bindSlider("sDens", "vDens", v => { dens = v; }, v => v.toFixed(2));
bindSlider("sBrush", "vBrush", v => { brushR = v; }, v => v.toFixed(0));

$("selCore").addEventListener("change", e => { coreType = e.target.value; rebuildKernels(true); drawPlots(); });
$("selGrow").addEventListener("change", e => { if (rules[curRule]) rules[curRule].g = e.target.value; drawPlots(); });
$("selEco").addEventListener("change", e => applyPreset(e.target.value));
function setGrid(n) {
  W = H = n; N = n * n;
  allocBuffers();
  allocBucketBuffers();
  rebuildKernels(true);
  randomInit();
  gen = 0;
  fitView();
  updateTexScale();
  needRender = true;
  $("selGrid").value = String(n);
}
$("selGrid").addEventListener("change", e => setGrid(parseInt(e.target.value, 10)));

// 规则 chips + 物种绘制选择
function syncRuleUI() {
  const chips = $("ruleChips");
  chips.innerHTML = "";
  if (rules.length > 1) {
    rules.forEach((r, i) => {
      const b = document.createElement("button");
      b.className = "btn chip" + (i === curRule ? " active" : "");
      const lb = r.label || `${LETTERS[r.src]}→${LETTERS[r.dst]}`;
      b.innerHTML = `<span class="swatch" style="background:${CHANNEL_COLORS[r.dst]}"></span>${lb}`;
      b.addEventListener("click", () => { curRule = i; syncRuleUI(); syncParamUI(); });
      chips.appendChild(b);
    });
  }
  // 5d per-rule R：多规则时为当前规则提供独立核半径（顶部 R 滑杆仍=改全部）
  if (rules.length > 1 && rules[curRule]) {
    const wrap = document.createElement("span");
    wrap.style.cssText = "display:inline-flex;align-items:center;gap:3px;margin-left:6px;vertical-align:middle";
    const lab = document.createElement("label");
    lab.textContent = "R/规则";
    lab.style.cssText = "font-size:11px;opacity:.75";
    const inp = document.createElement("input");
    inp.type = "number"; inp.min = 3; inp.max = 40; inp.step = 1;
    inp.value = rules[curRule].rad != null ? rules[curRule].rad : R;
    inp.style.cssText = "width:52px";
    inp.title = "仅当前规则的核半径（per-rule R）；顶部 R 滑杆会同时改所有规则";
    inp.addEventListener("change", () => {
      const v = Math.max(3, Math.min(40, Math.round(+inp.value || R)));
      inp.value = v;
      rules[curRule].rad = v; R = v;
      rebuildKernels(true);
      $("sR").value = R; $("vR").textContent = R;
      dbg("per-rule R: rule" + curRule + " -> " + v + "（其余规则不变）");
      showToast("⚙ 规则" + curRule + " R=" + v + "（仅本规则，核已重建）");
    });
    wrap.appendChild(lab); wrap.appendChild(inp);
    chips.appendChild(wrap);
  }
  const cs = $("chSel");
  cs.innerHTML = "";
  if (CH > 1) {
    for (let c = 0; c < CH; c++) {
      const b = document.createElement("button");
      b.className = "btn chip" + (c === paintCh ? " active" : "");
      b.textContent = "绘制 " + LETTERS[c];
      b.addEventListener("click", () => { paintCh = c; syncRuleUI(); needRender = true; });
      cs.appendChild(b);
    }
  }
}
function syncParamUI() {
  const r = rules[curRule];
  if (!r) return;
  $("sM").value = r.m; $("vM").textContent = r.m.toFixed(3);
  $("sS").value = r.s; $("vS").textContent = r.s.toFixed(3);
  $("selGrow").value = r.g;
  drawPlots();
}

// ════════════════════════════════════════════════════════════════
//  主循环
// ════════════════════════════════════════════════════════════════
let lastTs = 0, acc = 0;
let fpsFrames = 0, fpsLast = 0, fps = 0;
let statLast = 0;

function loop(ts) {
  requestAnimationFrame(loop);
  fpsFrames++;
  if (ts - fpsLast >= 1000) {
    fps = Math.round(fpsFrames * 1000 / (ts - fpsLast));
    fpsFrames = 0; fpsLast = ts;
  }
  const dtMs = lastTs ? ts - lastTs : 16;
  lastTs = ts;

  if (running) {
    acc += dtMs;
    const interval = 1000 / speed;
    if (acc > interval * 4) acc = interval * 4;   // 丢弃积压，防“追帧雪崩”
    let steps = 0;
    const cap = stepMs > 8 ? 3 : 8;               // 慢机自适应：降每帧步数保流畅
    while (acc >= interval && steps < cap) { step(); acc -= interval; steps++; }
    if (steps > 0) needRender = true;
  } else acc = 0;

  if (needRender) { render(); needRender = false; }

  if (ts - statLast >= 500) { updateStats(); statLast = ts; }
}

function updateStats() {
  let total = 0;
  for (let c = 0; c < CH; c++) { const f = fields[c]; for (let i = 0; i < N; i++) total += f[i]; }
  const avg = total / N;
  document.getElementById("stats").innerHTML =
    `代数 <b>${gen}</b> <span class="sep">|</span> FPS <b>${fps}</b> ` +
    `<span class="sep">|</span> 步进 <b>${stepMs.toFixed(1)}ms</b> ` +
    `<span class="sep">|</span> 平均活性 <b>${avg.toFixed(3)}</b> ` +
    `<span class="sep">|</span> 物种 <b>${CH}</b> · 规则 <b>${rules.length}</b> ` +
    `<span class="sep">|</span> 缩放 <b>${view.z.toFixed(2)}x</b>`;
  drawPlots();
}

// ════════════════════════════════════════════════════════════════
//  启动
// ════════════════════════════════════════════════════════════════
applyPreset("solo");
allocBucketBuffers();
fitView();
updateTexScale();           // 先定视图再定纹理倍率
setupPlots();
syncRuleUI();
syncParamUI();
randomInit();
drawPlots();
// 原版生物库下拉（lifecreatures.js 提供）
if (LIFE_DATA.length) {
  const og = document.createElement("optgroup");
  og.label = "原版生物库(" + LIFE_DATA.length + "种)";
  LIFE_DATA.forEach((e, i) => {
    const o = document.createElement("option");
    o.value = "life:" + i;
    o.textContent = (i + 1) + ". " + e.name + " [" + e.code + "]";
    og.appendChild(o);
  });
  $("selPattern").appendChild(og);
} else {
  // 诊断：数据未加载（常见于缓存了旧404 / file:// 协议限制）
  $("hintLine").innerHTML = "⚠ <b>生物库未加载</b>：lifecreatures.js 未取到 —— 请 Ctrl+F5 强刷新，或用本地服务器（如 python3 -m http.server）打开";
}
needRender = true;
requestAnimationFrame(loop);

// ── 5c URL 参数分享：#p=<base64(JSON)>，只含参数不含场（场走 JSON 存档）──
function buildShareHash() {
  const o = { v: 1, g: W, R, T, a: alpha, c: coreType, rs: rules.map(r => [r.src, r.dst, +r.m.toFixed(4), +r.s.toFixed(4), r.h, r.g]) };
  return "#p=" + btoa(JSON.stringify(o));
}
function applyShareHash() {
  if (typeof location === "undefined" || location.hash.indexOf("#p=") !== 0) return false;
  try {
    const o = JSON.parse(atob(location.hash.slice(3)));
    if (o.v !== 1) throw new Error("version mismatch");
    if (o.g && o.g !== W && [32, 64, 128, 256, 512].indexOf(o.g) >= 0) setGrid(o.g);
    setGlobalR(o.R); T = o.T; alpha = o.a; coreType = o.c;
    if (o.rs && o.rs.length === rules.length)
      o.rs.forEach((a, i) => Object.assign(rules[i], { src: a[0], dst: a[1], m: a[2], s: a[3], h: a[4], g: a[5] }));
    rebuildKernels(true);
    $("sR").value = R; $("vR").textContent = R;
    $("sT").value = T; $("vT").textContent = T;
    $("sA").value = alpha; $("vA").textContent = alpha;
    $("selCore").value = coreType;
    syncRuleUI(); syncParamUI();
    showToast("🔗 已从链接载入参数：R=" + R + " μ=" + rules[0].m.toFixed(3) + (rules.length > 1 ? " ×" + rules.length + "条规则" : ""));
    dbg("applyShareHash ok g=" + W + " rules=" + rules.length);
    return true;
  } catch (e) { showToast("🔗 链接参数解析失败：" + e.message); dbg("applyShareHash fail: " + e.message); return false; }
}
$("btnUrl").addEventListener("click", () => {
  const hash = buildShareHash();
  try { history.replaceState(null, "", hash); } catch (_e) {}
  const url = location.href.split("#")[0] + hash;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(
      () => showToast("🔗 参数链接已复制（可直接分享；不含场数据，打开即应用）"),
      () => window.prompt("复制链接：", url));
  } else window.prompt("复制链接：", url);
  dbg("share url len=" + url.length);
});
applyShareHash();  // 启动时若带 #p= 则覆盖参数
