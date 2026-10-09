// ── 本文件由 tools/split_p2.js 自 index.html 一次性拆出（P2-⑤）──
"use strict";
// ════════════════════════════════════════════════════════════════
//  渲染：调色板分桶批绘（每帧 ≤64/512 次 fill）
// ════════════════════════════════════════════════════════════════
const stage = document.getElementById("stage");
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
let dpr = window.devicePixelRatio || 1;
canvas.style.width = CANVAS_W + "px";
canvas.style.height = CANVAS_H + "px";
canvas.width = Math.round(CANVAS_W * dpr);
canvas.height = Math.round(CANVAS_H * dpr);

// 视图（世界坐标：格距 = 1；矩形环绕显示：每行 x = (q + r/2) mod W）
// 内容框：x ∈ [−0.5, W+0.25]（右缘取平滑主份的最小覆盖，保证零缝隙），y ∈ [0, H·√3/2]
const view = { x: 0, y: 0, z: 1 };
function contentBox() {
  return { x0: -0.5, y0: 0, w: W + 0.75, h: (SQ3 / 2) * H };
}
function fitView() {
  const b = contentBox();
  view.z = Math.min(CANVAS_W / b.w, CANVAS_H / b.h) * VIEW_FIT_MARGIN;
  view.x = (CANVAS_W - b.w * view.z) / 2 - b.x0 * view.z;
  view.y = (CANVAS_H - b.h * view.z) / 2 - b.y0 * view.z;
}

// 六角顶点（pointy-top，顶点角 60i+30°），单位外接圆
const HEXV = [];
for (let i = 0; i < 6; i++) {
  const a = (60 * i + 30) * Math.PI / 180;
  HEXV.push(Math.cos(a), Math.sin(a));
}

// ═══════════════════════════════════════════════════════════
//  配色系统：原版 Lenia 四色表（Lenia.html COLORS，0-15 刻度 ×17）
//  + 现有青黄；背景 白底(原版)/黑底 联动零值色与页面主题
// ═══════════════════════════════════════════════════════════
let palSingle = [], paletteRgb = [];
let scheme = "blue";          // blue(原版默认) | grey | green | rainbow | teal
let lightBg = true;           // 白底 = 原版风
let tone = "bands";           // bands=原版11档离散色带（边缘锐利，默认）| smooth=连续渐变
const SCHEMES = {
  blue:    [[9,15,15],[6,13,15],[3,11,15],[0,9,15],[3,8,15],[6,7,15],[9,6,15],[11,4,15],[13,2,15],[15,0,15],[11,0,5]],
  grey:    [[13,13,13],[12,12,12],[11,11,11],[10,10,10],[9,9,9],[8,8,8],[7,7,7],[6,6,6],[5,5,5],[4,4,4],[1,1,1]],
  green:   [[9,15,9],[7,13,7],[5,11,5],[3,10,3],[5,10,3],[8,10,1],[11,8,0],[13,6,3],[15,4,6],[15,2,9],[9,0,7]],
  rainbow: [[0,15,15],[0,7,15],[0,0,15],[0,7,7],[0,15,0],[7,15,0],[15,15,0],[15,7,0],[15,0,0],[15,0,7],[15,0,15]],
  teal:    null
};
const TEAL_STOPS = [
  [0.00, 10, 12, 40], [0.30, 40, 90, 160], [0.55, 40, 180, 150],
  [0.80, 220, 210, 70], [1.00, 255, 255, 240]
];
function bgFill() { return lightBg ? "#ffffff" : "#050508"; }

let RAMP_LUT = new Uint8Array(1024 * 3);
function rebuildColorAssets() {
  // 锚点：零值点（原版 COLOR_ZERO=[15,15,15] 白；黑底用暗色）+ 色表
  const zero = lightBg ? [255, 255, 255] : (scheme === "teal" ? [10, 12, 40] : [6, 6, 10]);
  const pts = [{ p: 0, c: zero }];
  if (scheme === "teal") {
    for (const s of TEAL_STOPS) {
      if (lightBg && s[0] === 0) continue;
      pts.push({ p: lightBg ? 0.02 + s[0] * 0.98 : s[0], c: [s[1], s[2], s[3]] });
    }
  } else {
    const a = SCHEMES[scheme];
    for (let i = 0; i < a.length; i++) pts.push({ p: 0.01 + 0.99 * i / (a.length - 1), c: [a[i][0] * 17, a[i][1] * 17, a[i][2] * 17] });
  }
  // 1024 档 LUT（bands：取色阶离散化，值平滑但颜色突变 → 边缘锐利，
  //  这正是原版“平滑场却看着清晰”的秘密；smooth：锚点间线性插值）
  const nA = pts.length - 1;   // 锚点数（不含零点）
  for (let i = 0; i < 1024; i++) {
    const t = i / 1023;
    let cr, cg, cb;
    if (tone === "bands") {
      if (i === 0) { cr = pts[0].c[0]; cg = pts[0].c[1]; cb = pts[0].c[2]; }
      else {
        const idx = Math.min(nA - 1, Math.floor(t * (nA - 1) + 1e-9));
        const ac = pts[idx + 1].c;
        cr = ac[0]; cg = ac[1]; cb = ac[2];
      }
    } else {
      let k = 0;
      while (k < pts.length - 2 && t > pts[k + 1].p) k++;
      const a = pts[k], b = pts[k + 1];
      const f = b.p === a.p ? 0 : Math.min(1, Math.max(0, (t - a.p) / (b.p - a.p)));
      cr = (a.c[0] + (b.c[0] - a.c[0]) * f + 0.5) | 0;
      cg = (a.c[1] + (b.c[1] - a.c[1]) * f + 0.5) | 0;
      cb = (a.c[2] + (b.c[2] - a.c[2]) * f + 0.5) | 0;
    }
    RAMP_LUT[i * 3] = cr; RAMP_LUT[i * 3 + 1] = cg; RAMP_LUT[i * 3 + 2] = cb;
  }
  // 像素模式 64 档调色板
  palSingle = [];
  for (let i = 0; i < PAL_N; i++) {
    const L = Math.round(i / (PAL_N - 1) * 1023) * 3;
    palSingle.push(`rgb(${RAMP_LUT[L]},${RAMP_LUT[L + 1]},${RAMP_LUT[L + 2]})`);
  }
  // 多物种 8³ 桶（白底 = 油墨减色，零值融入白底）
  paletteRgb = [];
  for (let i = 0; i < 512; i++) {
    let r = ((i >> 6) & 7) * 255 / 7 | 0;
    let g = ((i >> 3) & 7) * 255 / 7 | 0;
    let b = (i & 7) * 255 / 7 | 0;
    if (lightBg) { r = 255 - r; g = 255 - g; b = 255 - b; }
    paletteRgb.push(`rgb(${r},${g},${b})`);
  }
}
rebuildColorAssets();
document.body.classList.toggle("light", lightBg);

// 分桶计数排序缓冲（复用，避免每帧分配）
let bucketCnt, bucketStart, order, bucketKey;
function allocBucketBuffers() {
  bucketCnt = new Int32Array(CH === 1 ? PAL_N : 512);
  bucketStart = new Int32Array(bucketCnt.length + 1);
  order = new Int32Array(N);
  bucketKey = new Uint16Array(N);
}

// ═════════════════════════════════════════════════════════════
//  平滑渲染：场 → 纹理 (W+2)×H（左右各补 1 列环绕像素防接缝）
//  → 仿射变换（剪切）映射到六角晶格 → drawImage 双线性插值
//  布局：texel 中心 (i+0.5, j+0.5) → 世界 (i−1 + j/2, (√3/2)·j)
//  因 texel 坐标带 mod（矩形环绕），需画两份（x=0 与 x=−W）覆盖矩形
// ═════════════════════════════════════════════════════════════
const texCanvas = document.createElement("canvas");
const texCtx = texCanvas.getContext("2d");
let crWeights = null, crOffsets = null;   // Catmull-Rom 权重/抽头偏移（每相位 4 个）
let tmpF = null;                // 水平插值中间缓冲
function chooseTexScale() {
  // 纹理倍率自适应：按“设备像素/格”反推，使 GPU 残余双线性放大 ≤ ~1.45×
  // 同时限制纹理 ≤ ~1M 像素（约束构建成本）；缩放/换网格时自动重选
  const px = view.z * (window.devicePixelRatio || 1);
  const want = Math.max(1, Math.round(px / TEX_GPU_MARGIN));
  const maxS = Math.min(10, Math.max(1, Math.floor(Math.sqrt(1040000 / ((W + 2) * H)))));
  return Math.min(want, maxS);
}
function updateTexScale() {
  const s = chooseTexScale();
  if (s !== texScale || !texImg) resizeTexture();
}
function resizeTexture() {
  texScale = chooseTexScale();
  const s = texScale;
  texCanvas.width = (W + 2) * s;
  texCanvas.height = H * s;
  texImg = texCtx.createImageData(texCanvas.width, texCanvas.height);
  // Catmull-Rom：输出像素 I → 源坐标 u = (I+0.5)/s − 1（样本点=格 q 整数坐标）
  // 分解 I = m·s + p：抽头 = m + tapOff[p][k]，权重只依赖相位 p
  crWeights = new Float64Array(s * 4);
  crOffsets = new Int32Array(s * 4);
  for (let p = 0; p < s; p++) {
    const t = (p + 0.5) / s - 0.5;
    const i1 = Math.floor(t), f = t - i1;
    const f2 = f * f, f3 = f2 * f;
    crWeights[p * 4 + 0] = -0.5 * f3 + f2 - 0.5 * f;
    crWeights[p * 4 + 1] = 1.5 * f3 - 2.5 * f2 + 1;
    crWeights[p * 4 + 2] = -1.5 * f3 + 2 * f2 + 0.5 * f;
    crWeights[p * 4 + 3] = 0.5 * f3 - 0.5 * f2;
    for (let k = 0; k < 4; k++) crOffsets[p * 4 + k] = i1 - 1 + k;  // −1：坐标系平移（格 q）
  }
  tmpF = new Float32Array(H * (W + 2) * s * 3);   // CH≤3 余量
  texDirty = true;
}

// 色带 LUT 已由上方 rebuildColorAssets() 统一维护（随配色/背景切换重建）
// 双三次（Catmull-Rom）可分离两遍：水平（带左右环绕）→ 垂直（带上下环绕）
// 输出 (W+2)s × Hs，s = texScale；比双线性保边明显更锐，且跨环面接缝平滑
function buildTexture() {
  const s = texScale, Wout = (W + 2) * s, Hout = H * s;
  const d = texImg.data;
  if (CH === 1) {
    // ---- 水平 pass（单物种专用，无分支）----
    const F = fields[0];
    for (let j = 0; j < H; j++) {
      const trow = j * Wout, brow = j * W;
      for (let I = 0; I < Wout; I++) {
        const p = I % s, m = (I - p) / s, b4 = p * 4;
        let a = 0;
        for (let k = 0; k < 4; k++) {
          const w = crWeights[b4 + k];
          if (w === 0) continue;
          let q = m + crOffsets[b4 + k];
          if (q >= W) q -= W; else if (q < 0) q += W;
          a += w * F[q + brow];
        }
        tmpF[trow + I] = a;
      }
    }
    // ---- 垂直 pass → 纹理（LUT 上色）----
    for (let J = 0; J < Hout; J++) {
      const p = J % s, m = (J - p) / s, b4 = p * 4;
      const r0 = m + crOffsets[b4], r1 = m + crOffsets[b4 + 1], r2 = m + crOffsets[b4 + 2], r3 = m + crOffsets[b4 + 3];
      const rr0 = (r0 >= H ? r0 - H : r0 < 0 ? r0 + H : r0) * Wout;
      const rr1 = (r1 >= H ? r1 - H : r1 < 0 ? r1 + H : r1) * Wout;
      const rr2 = (r2 >= H ? r2 - H : r2 < 0 ? r2 + H : r2) * Wout;
      const rr3 = (r3 >= H ? r3 - H : r3 < 0 ? r3 + H : r3) * Wout;
      const w0 = crWeights[b4], w1 = crWeights[b4 + 1], w2 = crWeights[b4 + 2], w3 = crWeights[b4 + 3];
      const orow = J * Wout * 4;
      for (let I = 0; I < Wout; I++) {
        let v = 0;
        if (w0) v += w0 * tmpF[rr0 + I];
        if (w1) v += w1 * tmpF[rr1 + I];
        if (w2) v += w2 * tmpF[rr2 + I];
        if (w3) v += w3 * tmpF[rr3 + I];
        const e = v <= 0 ? 0 : v >= 1 ? 1023 : (v * 1023) | 0;   // LUT 索引 0..1023
        const P = orow + I * 4, L = e * 3;
        d[P] = RAMP_LUT[L]; d[P + 1] = RAMP_LUT[L + 1]; d[P + 2] = RAMP_LUT[L + 2]; d[P + 3] = 255;
      }
    }
  } else {
    // ---- 多物种：水平 ----
    for (let j = 0; j < H; j++) {
      const trow = j * Wout * CH;
      for (let I = 0; I < Wout; I++) {
        const p = I % s, m = (I - p) / s, b4 = p * 4;
        let a0 = 0, a1 = 0, a2 = 0;
        for (let k = 0; k < 4; k++) {
          const w = crWeights[b4 + k];
          if (w === 0) continue;
          let q = m + crOffsets[b4 + k];
          if (q >= W) q -= W; else if (q < 0) q += W;
          const idx = q + j * W;
          a0 += w * fields[0][idx];
          if (CH > 1) a1 += w * fields[1][idx];
          if (CH > 2) a2 += w * fields[2][idx];
        }
        const t2 = trow + I * CH;
        tmpF[t2] = a0;
        if (CH > 1) { tmpF[t2 + 1] = a1; if (CH > 2) tmpF[t2 + 2] = a2; }
      }
    }
    // ---- 多物种：垂直 ----
    for (let J = 0; J < Hout; J++) {
      const p = J % s, m = (J - p) / s, b4 = p * 4;
      const r0 = m + crOffsets[b4], r1 = m + crOffsets[b4 + 1], r2 = m + crOffsets[b4 + 2], r3 = m + crOffsets[b4 + 3];
      const rr0 = (r0 >= H ? r0 - H : r0 < 0 ? r0 + H : r0) * Wout * CH;
      const rr1 = (r1 >= H ? r1 - H : r1 < 0 ? r1 + H : r1) * Wout * CH;
      const rr2 = (r2 >= H ? r2 - H : r2 < 0 ? r2 + H : r2) * Wout * CH;
      const rr3 = (r3 >= H ? r3 - H : r3 < 0 ? r3 + H : r3) * Wout * CH;
      const w0 = crWeights[b4], w1 = crWeights[b4 + 1], w2 = crWeights[b4 + 2], w3 = crWeights[b4 + 3];
      const orow = J * Wout * 4;
      for (let I = 0; I < Wout; I++) {
        const off = I * CH;
        let v0 = 0, v1 = 0, v2 = 0;
        if (w0) { const b = rr0 + off; v0 += w0 * tmpF[b]; if (CH > 1) v1 += w0 * tmpF[b + 1]; if (CH > 2) v2 += w0 * tmpF[b + 2]; }
        if (w1) { const b = rr1 + off; v0 += w1 * tmpF[b]; if (CH > 1) v1 += w1 * tmpF[b + 1]; if (CH > 2) v2 += w1 * tmpF[b + 2]; }
        if (w2) { const b = rr2 + off; v0 += w2 * tmpF[b]; if (CH > 1) v1 += w2 * tmpF[b + 1]; if (CH > 2) v2 += w2 * tmpF[b + 2]; }
        if (w3) { const b = rr3 + off; v0 += w3 * tmpF[b]; if (CH > 1) v1 += w3 * tmpF[b + 1]; if (CH > 2) v2 += w3 * tmpF[b + 2]; }
        const P = orow + I * 4;
        let b0 = v0 <= 0 ? 0 : v0 >= 1 ? 255 : (v0 * 255 + 0.5) | 0;
        let b1 = v1 <= 0 ? 0 : v1 >= 1 ? 255 : (v1 * 255 + 0.5) | 0;
        let b2 = v2 <= 0 ? 0 : v2 >= 1 ? 255 : (v2 * 255 + 0.5) | 0;
        if (lightBg) { b0 = 255 - b0; b1 = 255 - b1; b2 = 255 - b2; }  // 白底：油墨减色，零值=白
        d[P] = b0; d[P + 1] = b1; d[P + 2] = b2;
        d[P + 3] = 255;
      }
    }
  }
  texCtx.putImageData(texImg, 0, 0);
}

function renderSmooth() {
  if (!texImg) resizeTexture();
  if (texDirty) { buildTexture(); texDirty = false; }   // 仅场变化时重建（缩放/平移不重建）
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = bgFill();
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // 裁剪到内容框：避免主份的未环绕溢出/环绕份的越界像素落进留白区
  const b = contentBox();
  ctx.save();
  ctx.beginPath();
  ctx.rect(dpr * (view.x + b.x0 * view.z), dpr * (view.y + b.y0 * view.z),
           dpr * b.w * view.z, dpr * b.h * view.z);
  ctx.clip();
  // 仿射：输出像素 (I,J) → 世界；X = I/s + J/2s − 1.75, Y = (√3/2s)·J
  const a = dpr * view.z / texScale;
  ctx.setTransform(a, 0, a / 2, a * SQ3 / 2, dpr * (view.x - 1.75 * view.z), dpr * view.y);
  ctx.drawImage(texCanvas, 0, 0);                 // 主份
  ctx.drawImage(texCanvas, -W * texScale, 0);     // 环绕份：填充每行左侧被 mod 裁开的区域
  ctx.restore();
}

function drawLegend() {
  if (CH > 1) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = "11px monospace";
    const ink = lightBg ? ["#0a7f70", "#c23a78", "#9a7b00"] : CHANNEL_COLORS;
    for (let c = 0; c < CH; c++) {
      ctx.fillStyle = ink[c];
      ctx.fillText(`${LETTERS[c]}=ch${c}${c === paintCh ? " ●绘制中" : ""}`, 10 + c * 90, CANVAS_H - 10);
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  K(d) / G(u) 实时曲线（原版右栏图表的简化版）
// ═══════════════════════════════════════════════════════════
const PW = 230, PH = 88;
let pkc = null, pgc = null;
function setupPlots() {
  const d = window.devicePixelRatio || 1;
  for (const id of ["plotK", "plotG"]) {
    const cv = document.getElementById(id);
    cv.width = PW * d; cv.height = PH * d;
    cv.style.width = PW + "px"; cv.style.height = PH + "px";
  }
  pkc = document.getElementById("plotK").getContext("2d");
  pgc = document.getElementById("plotG").getContext("2d");
}
function drawPlots() {
  if (!pkc) return;
  const d = window.devicePixelRatio || 1;
  const bgc = lightBg ? "#ffffff" : "#101024";
  const axc = lightBg ? "#99aabb" : "#4a4a6a";
  const curC = lightBg ? "#09f" : "#37e6d0";
  const ink = lightBg ? ["#0a7f70", "#c23a78", "#9a7b00"] : CHANNEL_COLORS;
  // ── K(d) ──
  pkc.setTransform(d, 0, 0, d, 0, 0);
  pkc.fillStyle = bgc; pkc.fillRect(0, 0, PW, PH);
  pkc.strokeStyle = axc; pkc.lineWidth = 1;
  pkc.beginPath(); pkc.moveTo(3, PH - 3.5); pkc.lineTo(PW - 2, PH - 3.5); pkc.moveTo(3.5, 3); pkc.lineTo(3.5, PH - 3); pkc.stroke();
  const xMax = R * 1.12;
  const xR = 3 + (R / xMax) * (PW - 6);
  pkc.setLineDash([3, 3]); pkc.strokeStyle = lightBg ? "#b55" : "#a66";
  pkc.beginPath(); pkc.moveTo(xR, 3); pkc.lineTo(xR, PH - 4); pkc.stroke(); pkc.setLineDash([]);
  pkc.strokeStyle = curC; pkc.lineWidth = 1.8; pkc.beginPath();
  for (let px = 0; px <= PW - 6; px++) {
    const dd = (px / (PW - 6)) * xMax;
    const v = dd < R ? CORES[coreType](dd / R, alpha) : 0;
    const x = 3 + px, y = (PH - 4) - v * (PH - 9);
    if (px === 0) pkc.moveTo(x, y); else pkc.lineTo(x, y);
  }
  pkc.stroke();
  // ── G(u) ──
  pgc.setTransform(d, 0, 0, d, 0, 0);
  pgc.fillStyle = bgc; pgc.fillRect(0, 0, PW, PH);
  const y0 = 3 + (PH - 6) / 2;
  pgc.strokeStyle = axc; pgc.lineWidth = 1;
  pgc.beginPath(); pgc.moveTo(3, PH - 3.5); pgc.lineTo(PW - 2, PH - 3.5); pgc.stroke();
  pgc.setLineDash([2, 4]); pgc.strokeStyle = lightBg ? "#b55" : "#a66";
  pgc.beginPath(); pgc.moveTo(3, y0); pgc.lineTo(PW - 3, y0); pgc.stroke();
  pgc.setLineDash([]);
  const single = rules.length <= 1;
  rules.forEach((r, idx) => {
    const col = single ? curC : ink[r.dst % 3];
    pgc.strokeStyle = col; pgc.lineWidth = (idx === curRule || single) ? 1.8 : 1.1;
    pgc.beginPath();
    for (let px = 0; px <= PW - 6; px++) {
      const u = px / (PW - 6);
      const v = GROWTHS[r.g](u, r.m, r.s);
      const x = 3 + px, y = y0 - v * ((PH - 7) / 2);
      if (px === 0) pgc.moveTo(x, y); else pgc.lineTo(x, y);
    }
    pgc.stroke();
    // μ 标记（当前规则粗虚线，其余细虚线）
    const xm = 3 + r.m * (PW - 6);
    pgc.setLineDash([3, 3]);
    pgc.lineWidth = idx === curRule ? 1.6 : 0.8;
    pgc.strokeStyle = col;
    pgc.beginPath(); pgc.moveTo(xm, 3); pgc.lineTo(xm, PH - 4); pgc.stroke();
    pgc.setLineDash([]);
  });
}

function render() {
  if (viewMode === "smooth") { renderSmooth(); drawLegend(); return; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = bgFill();
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * view.z, 0, 0, dpr * view.z, dpr * view.x, dpr * view.y);

  const buckets = bucketCnt.length;
  bucketCnt.fill(0);

  // 1. 量化每格颜色 → 桶键
  if (CH === 1) {
    const f = fields[0];
    for (let i = 0; i < N; i++) {
      let v = f[i]; if (v < 0) v = 0; else if (v > 1) v = 1;
      const k = (v * (PAL_N - 1) + 0.5) | 0;
      bucketKey[i] = k; bucketCnt[k]++;
    }
  } else {
    bucketKey.fill(0);      // 必须清零：否则残留上一帧/单物种的键位（含低位 → 错色）
    for (let c = 0; c < CH; c++) {
      const f = fields[c];
      for (let i = 0; i < N; i++) {
        let v = f[i]; if (v < 0) v = 0; else if (v > 1) v = 1;
        bucketKey[i] |= ((v * 7 + 0.5) | 0) << (6 - 3 * c);
      }
    }
    for (let i = 0; i < N; i++) bucketCnt[bucketKey[i]]++;
  }

  // 2. 前缀和 → 桶起始
  let acc = 0;
  for (let k = 0; k < buckets; k++) { bucketStart[k] = acc; acc += bucketCnt[k]; }
  bucketStart[buckets] = acc;

  // 3. 散射到 order（计数排序）
  if (CH === 1) {
    for (let i = 0; i < N; i++) order[bucketStart[bucketKey[i]]++] = i;
  } else {
    for (let i = 0; i < N; i++) order[bucketStart[bucketKey[i]]++] = i;
  }
  // 还原 bucketStart（下一步按桶遍历需要起点）
  acc = 0;
  for (let k = 0; k < buckets; k++) { bucketStart[k] = acc; acc += bucketCnt[k]; }

  // 4. 按桶批量绘制
  const pal = CH === 1 ? palSingle : paletteRgb;
  const rad = HEX_RAD;
  for (let k = 0; k < buckets; k++) {
    const s0 = bucketStart[k], s1 = s0 + bucketCnt[k];
    if (s0 === s1) continue;
    ctx.fillStyle = pal[k];
    ctx.beginPath();
    for (let p = s0; p < s1; p++) {
      const i = order[p];
      const q = i % W, r = (i / W) | 0;
      let cx = q + r / 2;
      if (cx >= W) cx -= W;               // 矩形环绕（与平滑模式同布局）
      const cy = (SQ3 / 2) * r;
      ctx.moveTo(cx + HEXV[0] * rad, cy + HEXV[1] * rad);
      for (let v = 1; v < 6; v++) ctx.lineTo(cx + HEXV[2 * v] * rad, cy + HEXV[2 * v + 1] * rad);
      ctx.closePath();
    }
    ctx.fill();
  }

  drawLegend();
}

