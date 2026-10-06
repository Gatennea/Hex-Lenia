// 单趟版：一次 1000 步内完成 密度/形态/漂移 测量；矩阵 = 直线笔刷 × 参数预设
const fs = require("fs");
const html = fs.readFileSync(__dirname + "/index.html", "utf8");
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

const PARAMS = {
  classic: { m:0.15, s:0.016, R:10 },
  active:  { m:0.17, s:0.014, R:10 },
  wide:    { m:0.17, s:0.050, R:10 },
  sparse:  { m:0.13, s:0.014, R:10 },
};

function density(){let s=0;const f=api.fields[0];for(let i=0;i<N;i++)s+=f[i];return s/N;}
function com(){const f=api.fields[0];let sx=0,sy=0,ax=0,ay=0;
  for(let r=0;r<W;r++)for(let q=0;q<W;q++){const v=f[q+r*W];if(v<0.01)continue;
    const tx=2*Math.PI*q/W,ty=2*Math.PI*r/W;
    sx+=Math.cos(tx)*v;sy+=Math.sin(tx)*v;ax+=Math.cos(ty)*v;ay+=Math.sin(ty)*v;}
  return [((Math.atan2(sy,sx)/(2*Math.PI))*W+W)%W, ((Math.atan2(ay,ax)/(2*Math.PI))*W+W)%W];}
const wd=(a,b)=>{let d=b-a;if(d>64)d-=128;if(d<-64)d+=128;return d;};

function drawLine(cx, cy, len, angDeg, thick) {
  api.clearAll();
  const f = api.fields[0];
  const a = angDeg * Math.PI / 180;
  for (let t = 0; t <= len; t++) {
    const qx = cx + Math.cos(a) * t, ry = cy + Math.sin(a) * t;
    for (let dr = -thick; dr <= thick; dr++) for (let dq = -thick; dq <= thick; dq++) {
      const dx = dq + dr/2, dy = (SQ3/2)*dr;
      if (dx*dx + dy*dy > thick*thick + 0.01) continue;
      const q = Math.round(qx) + dq, r = Math.round(ry) + dr;
      if (q>=0 && q<W && r>=0 && r<W) f[q + r*W] = 1;
    }
  }
}
function shapeMatch(A, B) {   // 每隔2格采样，找最佳平移的平均绝对差
  let best = Infinity, bs = [0,0];
  for (let dy = -12; dy <= 12; dy++) for (let dx = -12; dx <= 12; dx++) {
    let s = 0;
    for (let r = 0; r < W; r += 2) for (let q = 0; q < W; q += 2)
      s += Math.abs(A[q + r*W] - B[(((q+dx)%W+W)%W) + (((r+dy)%W+W)%W)*W]);
    const m = s / ((W/2)*(W/2));
    if (m < best) { best = m; bs = [dx,dy]; }
  }
  return { diff: best, shift: bs };
}

function trial(name, pname, cfg) {
  const p = PARAMS[pname];
  api.applyPreset("solo");
  api.rules[0].m = p.m; api.rules[0].s = p.s;
  api.setR(p.R); api.setT(10);
  drawLine(cfg.cx, cfg.cy, cfg.len, cfg.ang, cfg.thick);
  let d400 = 0, S1 = null, c1 = null, d1000 = 0;
  for (let g = 0; g < 1000; g++) {
    api.step();
    if (g === 399) { d400 = density(); S1 = Float64Array.from(api.fields[0]); c1 = com(); }
  }
  d1000 = density();
  const S2 = Float64Array.from(api.fields[0]);       // t=1000 vs t=400（跨600步，形态长期保持检验）
  const c2 = com();
  const m = shapeMatch(S1, S2);
  const drift = d400 > 0.0003 ? Math.hypot(wd(c1[0],c2[0]), wd(c1[1],c2[1])) : 0;
  let cls;
  if (d400 < 0.0003 || d1000 < 0.0003) cls = "DEAD";
  else if (d1000 > 0.08) cls = "FIELD";
  else if (m.diff < 0.10 && drift >= 3) cls = "★FLYER";
  else if (m.diff < 0.10) cls = "STABLE";
  else cls = "MORPH";
  console.log(`${name.padEnd(12)} ${pname.padEnd(8)} d400=${d400.toFixed(4)} d1000=${d1000.toFixed(4)} 漂移=${drift.toFixed(1)} 形态差=${m.diff.toFixed(3)} 平移=${JSON.stringify(m.shift)} → ${cls}`);
}

const LINES = [
  ["L6-th2",  {cx:60, cy:64, len:6,  ang:0, thick:2}],
  ["L10-th2", {cx:56, cy:64, len:10, ang:0, thick:2}],
  ["L14-th2", {cx:52, cy:64, len:14, ang:0, thick:2}],
  ["L8-th1",  {cx:58, cy:64, len:8,  ang:0, thick:1}],
];
for (const pname of ["classic", "wide"]) {
  for (const [ln, cfg] of LINES) trial(ln, pname, cfg);
}
