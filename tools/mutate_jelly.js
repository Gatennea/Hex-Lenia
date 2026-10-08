// 水母突变扫描（论文 2.3.2 参数微调的自动化版）：
// 从水母种子 + 经典参数出发，扫 μ/σ 邻域 → 分类变种
// node mutate_jelly.js '[{name,m,s,R}...]'
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
  src + `;return {applyPreset,placePattern,step,N,get fields(){return fields},get rules(){return rules},
    setR(v){R=v;rebuildKernels(true)},setT(v){T=v}};`);
const api = fn(document, window, requestAnimationFrame, performance);
const N = api.N, W = 128;

const density=()=>{let s=0;const f=api.fields[0];for(let i=0;i<N;i++)s+=f[i];return s/N;};
function com(){const f=api.fields[0];let sx=0,sy=0,ax=0,ay=0,n=0;
  for(let r=0;r<W;r++)for(let q=0;q<W;q++){const v=f[q+r*W];if(v<0.01)continue;n++;
    const tx=2*Math.PI*q/W,ty=2*Math.PI*r/W;
    sx+=Math.cos(tx)*v;sy+=Math.sin(tx)*v;ax+=Math.cos(ty)*v;ay+=Math.sin(ty)*v;}
  if(!n)return null;
  return [((Math.atan2(sy,sx)/(2*Math.PI))*W+W)%W,((Math.atan2(ay,ax)/(2*Math.PI))*W+W)%W];}
const wd=(a,b)=>{let d=b-a;if(d>64)d-=128;if(d<-64)d+=128;return d;};
function shapeMatch(A,B){
  let best=Infinity;
  for(let dy=-14;dy<=14;dy++)for(let dx=-14;dx<=14;dx++){
    let s=0;
    for(let r=0;r<W;r+=2)for(let q=0;q<W;q+=2)
      s+=Math.abs(A[q+r*W]-B[(((q+dx)%W+W)%W)+(((r+dy)%W+W)%W)*W]);
    const m=s/((W/2)*(W/2));
    if(m<best)best=m;
  }
  return best;
}

function trial(T) {
  api.applyPreset("solo");
  // 先清场放置水母，再改参数（placePattern 会锁定经典参数，必须后改）
  const f = api.fields[0];
  for (let i = 0; i < N; i++) f[i] = 0;
  api.placePattern("jelly", 64, 64);
  api.rules[0].m = T.m; api.rules[0].s = T.s;
  api.setR(T.R || 10); api.setT(10);
  let prev = com(), path = 0, S300 = null, c300 = null;
  for (let g = 1; g <= 600; g++) {
    api.step();
    if (g % 50 === 0) {
      const c = com();
      if (prev && c && g > 100) path += Math.hypot(wd(prev[0],c[0]), wd(prev[1],c[1]));
      if (c) prev = c;
    }
    if (g === 300) { S300 = Float64Array.from(api.fields[0]); c300 = com(); }
  }
  const d = density();
  const diff = S300 ? shapeMatch(S300, api.fields[0]) : 9;
  const speed = path / 500;   // t=100→600
  let cls;
  if (d < 0.0005) cls = "灭绝";
  else if (d > 0.05) cls = "膨胀成场";
  else if (diff < 0.08 && speed >= 0.15) cls = "★仍飞行";
  else if (diff < 0.08) cls = "稳定停留";
  else cls = "变形存活";
  console.log(`${(T.name||"").padEnd(14)} m=${T.m.toFixed(3)} σ=${T.s.toFixed(3)} 密度=${d.toFixed(4)} 速度=${speed.toFixed(3)} 形态差=${diff.toFixed(3)} → ${cls}`);
}
const BATCH = JSON.parse(process.argv[2] || "[]");
for (const t of BATCH) trial(t);
