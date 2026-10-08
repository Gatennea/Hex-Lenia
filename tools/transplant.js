// 原版生物移植：Lenia-LifeForms.js 的规则+种子 → 六角网格，测存活
// 用法：node transplant.js <start> <end>   （对第 start..end 份标本试验）
const fs = require("fs");
const html = require("./src").html();
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function makeEl(){return{style:{},innerHTML:'',textContent:'',value:'0',classList:{add(){},remove(){},toggle(){}},addEventListener(){},appendChild(){},getContext(){return new Proxy({},{get(t,p){if(p==='canvas')return{width:0,height:0};if(p==='createImageData')return(w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h});return t[p]!==undefined?t[p]:()=>{}},set(){return true}})},getBoundingClientRect(){return{left:0,top:0}},width:0,height:0}}
const els={};
const document={getElementById(id){if(!els[id])els[id]=makeEl();return els[id]},createElement(){return makeEl()},addEventListener(){},body:{classList:{toggle(){},add(){},remove(){}}}};
const window={devicePixelRatio:1,addEventListener(){},requestAnimationFrame(){}};
function requestAnimationFrame(){}
const performance={now:()=>Number(process.hrtime.bigint()/1000n)/1000};
const fn=new Function("document","window","requestAnimationFrame","performance",
  src + `;return {applyPreset,step,N,clearAll,get fields(){return fields},get rules(){return rules},
    setR(v){R=v;rebuildKernels(true)},setT(v){T=v},setCore(c){coreType=c;rebuildKernels(true)}};`);
const api = fn(document, window, requestAnimationFrame, performance);
const N = api.N, W = 128;

// ── 提取所有 "R=..." 规则+种子标本 ──
const lf = fs.readFileSync(__dirname + "/../lenia-reference/Lenia-LifeForms.js", "utf8");
const specimens = [];
const recRe = /\["([^"]{1,20})",\s*"([^"]{2,60})",\s*"([^"]{0,40})",\s*"(R=[^"]+)"/g;
let mm;
while ((mm = recRe.exec(lf)) !== null) {
  const rec = mm[4];
  const ci = rec.indexOf(";cells=");
  if (ci < 0) continue;
  specimens.push({ name: mm[2], code: mm[1], rule: rec.slice(0, ci), cells: rec.slice(ci + 7) });
}
if (process.argv[2] === "probe") {
  console.log("标本数=" + specimens.length);
  const bands = specimens.filter(s => /\(.*[,/].*\)/.test(s.rule.split(";k=")[1] || "")).length;
  console.log("带多环核=" + specimens.length ? "样例: " + JSON.stringify(specimens[0]).slice(0, 300) : "");
  process.exit(0);
}

// ── 解码（原版 ToCellArray 移植）──
const fromZip = c => c === "0" ? 0 : c === "1" ? 100 : c.charCodeAt(0) - 191;
const fromRep = st => st === "" ? 1 : (st.charCodeAt(0) >= 192 ? (st.length === 1 ? fromZip(st) : fromZip(st[0]) * 100 + fromZip(st[1])) : parseInt(st, 10));
function toCells(cellSt) {
  const isZip = cellSt.startsWith("(zip)");
  if (isZip) cellSt = cellSt.substring(5);
  const sep = isZip ? "" : ",";
  let rows = cellSt.split("/");
  let w = 0;
  for (let i = 0; i < rows.length; i++) {
    let row = rows[i].trim();
    if (isZip) {
      const segs = row.split("-"); row = "";
      for (const seg of segs) {
        const p = seg.split(".");
        if (p.length === 1) row += seg;
        else row += "0".repeat(fromRep(p[0])) + (p[1] || "");
      }
    }
    rows[i] = row = row.split(sep);
    w = Math.max(w, row.length);
    if (isZip) for (let j = 0; j < row.length; j++) { const v = fromZip(row[j]) / 100; row[j] = v < 0 ? 0 : v; }
    else for (let j = 0; j < row.length; j++) row[j] = parseFloat(row[j]) || 0;
  }
  return { arr: rows, w, h: rows.length };
}
// ── 规则串解析 ──
function parseRule(rs) {
  const o = { R: 10, T: 10, m: 0.15, s: 0.016, core: "exp", grow: "gaus", bands: false };
  const mR = rs.match(/R=(\d+)/); if (mR) o.R = +mR[1];
  const mk = rs.match(/k=([a-z0-9]+)(\([^)]*\))?(\([^)]*\))?/);
  if (mk) {
    o.bands = !!(mk[2] || mk[3]);
    const c = mk[1];
    o.core = c === "quad4" ? "poly" : (c === "stpz1/4" || c === "stpz") ? "rect" : c === "life" ? "rect" : "exp";
  }
  const md = rs.match(/d=([a-z0-9]+)\((-?[\d.eE+-]+),(-?[\d.eE+-]+)\)/);
  if (md) {
    o.grow = md[1] === "quad4" ? "poly" : md[1] === "stpz" ? "rect" : md[1] === "trap" ? "trap" : "gaus";
    o.m = +md[2]; o.s = +md[3];
  }
  const mt = rs.match(/\*([\d.]+)\s*$/);
  if (mt && +mt[1] > 0) o.T = Math.round(1 / +mt[1]);
  return o;
}
const density = () => { let s = 0; const f = api.fields[0]; for (let i = 0; i < N; i++) s += f[i]; return s / N; };
function activity() { const snap = Float64Array.from(api.fields[0]); api.step(); const f = api.fields[0]; let s = 0; for (let i = 0; i < N; i++) s += Math.abs(f[i] - snap[i]); return s / N; }

const a = +process.argv[2], b = +process.argv[3];
const slice = specimens.slice(a, b);
let alive = 0, field = 0, dead = 0, skipped = 0;
const lines = [];
for (const sp of slice) {
  let seed;
  try { seed = toCells(sp.cells); } catch (e) { skipped++; continue; }
  if (!seed.w || seed.w > 100 || seed.h > 100) { skipped++; continue; }
  const p = parseRule(sp.rule);
  api.applyPreset("solo");
  api.setCore(p.core); api.setR(p.R); api.setT(p.T);
  api.rules[0].m = p.m; api.rules[0].s = p.s;
  if (p.R < 4 || p.R > 40 || p.s <= 0 || p.s > 0.3) { skipped++; continue; }
  api.clearAll();
  const f = api.fields[0];
  const x0 = (W >> 1) - (seed.w >> 1), y0 = (W >> 1) - (seed.h >> 1);
  let placed = 0;
  for (let j = 0; j < seed.h; j++) for (let i = 0; i < seed.w; i++) {
    const v = seed.arr[j][i];
    if (v > 0 && v <= 1) {
      const q = ((x0 + i) % W + W) % W, r = ((y0 + j) % W + W) % W;
      f[q + r * W] = v; placed++;
    }
  }
  if (!placed) { skipped++; continue; }
  for (let g = 0; g < 200; g++) api.step();
  const d = density();
  if (d < 0.0005) { dead++; continue; }
  if (d > 0.12) { field++; continue; }
  alive++;
  const act = activity();
  lines.push(`✓ ${sp.name} [${sp.code}] R=${p.R} μ=${p.m} σ=${p.s} ${p.core}/${p.grow}${p.bands ? " 多环核!" : ""} d=${d.toFixed(4)} act=${act.toExponential(1)}`);
}
for (const l of lines) console.log(l);
console.log(`── 批次 ${a}-${b - 1}: 存活=${alive} 爆场=${field} 死亡=${dead} 跳过=${skipped} 共${slice.length}`);
