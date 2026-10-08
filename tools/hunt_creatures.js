// 生物猎手（配置驱动）：node hunt_creatures.js '[{...trial}...]'
// trial = {name, m,s,R, seed:{t:"stroke"|disk|box|ring, ...}}
// 600 步内分类：DEAD / FIELD / ★FLYER / ★OSC / STABLE / MORPH
const fs = require("fs");
const html = fs.readFileSync(__dirname + "/../index.html", "utf8");
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function makeEl(){return{style:{},innerHTML:'',textContent:'',value:'0',classList:{add(){},remove(){},toggle(){}},addEventListener(){},appendChild(){},getContext(){return new Proxy({},{get(t,p){if(p==='canvas')return{width:0,height:0};if(p==='createImageData')return(w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h});return t[p]!==undefined?t[p]:()=>{}},set(){return true}})},getBoundingClientRect(){return{left:0,top:0}},width:0,height:0}}
const els={};
const document={getElementById(id){if(!els[id])els[id]=makeEl();return els[id]},createElement(){return makeEl()},addEventListener(){},body:{classList:{toggle(){},add(){},remove(){}}}};
const window={devicePixelRatio:1,addEventListener(){},requestAnimationFrame(){}};
function requestAnimationFrame(){}
const performance={now:()=>Number(process.hrtime.bigint()/1000n)/1000};
const fn=new Function("document","window","requestAnimationFrame","performance",
  src + `;return {applyPreset,step,N,clearAll,get fields(){return fields},get rules(){return rules},
    setR(v){R=v;rebuildKernels(true)},setT(v){T=v}};`);
const api = fn(document, window, requestAnimationFrame, performance);
const N = api.N, W = 128;
const SQ3 = Math.sqrt(3);

const density = () => { let s = 0; const f = api.fields[0]; for (let i = 0; i < N; i++) s += f[i]; return s / N; };
function com(){const f=api.fields[0];let sx=0,sy=0,ax=0,ay=0,n=0;
  for(let r=0;r<W;r++)for(let q=0;q<W;q++){const v=f[q+r*W];if(v<0.01)continue;n++;
    const tx=2*Math.PI*q/W,ty=2*Math.PI*r/W;
    sx+=Math.cos(tx)*v;sy+=Math.sin(tx)*v;ax+=Math.cos(ty)*v;ay+=Math.sin(ty)*v;}
  if(!n||Math.abs(sx)+Math.abs(sy)<1e-9) return null;
  return [((Math.atan2(sy,sx)/(2*Math.PI))*W+W)%W, ((Math.atan2(ay,ax)/(2*Math.PI))*W+W)%W];}
const wd=(a,b)=>{let d=b-a;if(d>64)d-=128;if(d<-64)d+=128;return d;};
function shapeMatch(A, B) {
  let best = Infinity, bs = [0,0];
  for (let dy = -14; dy <= 14; dy++) for (let dx = -14; dx <= 14; dx++) {
    let s = 0;
    for (let r = 0; r < W; r += 2) for (let q = 0; q < W; q += 2)
      s += Math.abs(A[q + r*W] - B[(((q+dx)%W+W)%W) + (((r+dy)%W+W)%W)*W]);
    const m = s / ((W/2)*(W/2));
    if (m < best) { best = m; bs = [dx,dy]; }
  }
  return { diff: best, shift: bs };
}
function seedApply(sd) {
  const f = api.fields[0];
  if (sd.t === "stroke") {
    const a = sd.ang * Math.PI / 180;
    for (let t = 0; t <= sd.len; t++) {
      const qx = sd.cx + Math.cos(a)*t, ry = sd.cy + Math.sin(a)*t;
      for (let dr = -sd.thick; dr <= sd.thick; dr++) for (let dq = -sd.thick; dq <= sd.thick; dq++) {
        const dx = dq + dr/2, dy = (SQ3/2)*dr;
        if (dx*dx + dy*dy > sd.thick*sd.thick + 0.01) continue;
        const q = Math.round(qx)+dq, r = Math.round(ry)+dr;
        if (q>=0&&q<W&&r>=0&&r<W) f[q+r*W] = 1;
      }
    }
  } else if (sd.t === "disk" || sd.t === "ring") {
    for (let r = 0; r < W; r++) for (let q = 0; q < W; q++) {
      const dx = q - (sd.cx ?? 64) + (r - (sd.cy ?? 64))/2, dy = (SQ3/2)*(r - (sd.cy ?? 64));
      const dd = Math.sqrt(dx*dx + dy*dy);
      const ok = sd.t === "disk" ? dd < sd.r : (dd > sd.r0 && dd < sd.r1);
      if (ok) f[q+r*W] = Math.random();
    }
  } else if (sd.t === "box") {
    for (let r = sd.cy-sd.h; r <= sd.cy+sd.h; r++) for (let q = sd.cx-sd.h; q <= sd.cx+sd.h; q++)
      if (q>=0&&q<W&&r>=0&&r<W) f[q+r*W] = Math.random() < 0.7 ? 1 : 0;
  }
}
const OSC_LAGS = [2,3,4,5,6,8,10,12,15,20,24,30,40,50];
function trial(T) {
  api.applyPreset("solo");
  api.rules[0].m = T.m; api.rules[0].s = T.s;
  api.setR(T.R || 10); api.setT(10);
  api.clearAll();
  seedApply(T.seed);
  const hist = []; let osc = -1, S250 = null, c250 = null;
  for (let g = 0; g < 600; g++) {
    api.step();
    hist.push(Float64Array.from(api.fields[0]));
    if (hist.length > 60) hist.shift();
    if (g % 5 === 0 && hist.length >= 51 && osc < 0) {
      const cur = hist[hist.length - 1];
      for (const P of OSC_LAGS) {
        if (P >= hist.length) continue;
        const ref = hist[hist.length - 1 - P];
        let s = 0;
        for (let i = 0; i < N; i++) { const d = Math.abs(cur[i]-ref[i]); s += d; if (s > 0.05) break; }
        if (s <= 0.05) { osc = P; break; }
      }
    }
    if (g === 249) { S250 = Float64Array.from(api.fields[0]); c250 = com(); }
  }
  const d = density();
  const S600 = Float64Array.from(api.fields[0]);
  const c600 = com();
  let cls = "MORPH", extra = "";
  if (d < 0.0003) cls = "DEAD";
  else if (d > 0.08) cls = "FIELD";
  else {
    const m = shapeMatch(S250, S600);
    const drift = (c250 && c600) ? Math.hypot(wd(c250[0],c600[0]), wd(c250[1],c600[1])) : 0;
    if (osc > 0) { cls = "★OSC"; extra = `周期=${osc}`; }
    else if (m.diff < 0.10 && drift >= 3) { cls = "★FLYER"; extra = `漂移=${drift.toFixed(0)}`; }
    else if (m.diff < 0.10) { cls = "STABLE"; }
    extra = extra || `形态差=${m.diff.toFixed(3)} 漂移=${drift.toFixed(0)}`;
  }
  console.log(`${(T.name||"").padEnd(14)} m=${T.m} s=${T.s} d=${d.toFixed(4)} ${cls.padEnd(8)} ${extra}`);
}
const BATCH = JSON.parse(process.argv[2] || "[]");
for (const t of BATCH) trial(t);
