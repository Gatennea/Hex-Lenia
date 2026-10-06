// 主动转向实验：水母按任意角度旋转后放置，观察动力学响应
// 问题：非 60° 角 → 生物会死？会转向吗？航向是跟随输入角还是吸附到晶格轴？
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
  src + `;return {applyPreset,placePattern,step,N,set ang(v){stampAngle=v},
    get fields(){return fields}};`);
const api = fn(document, window, requestAnimationFrame, performance);
const N = api.N, W = 128;
const SQ3 = Math.sqrt(3);

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
// 轴角比较（无向身体轴，mod 180）
const axisDev = (h, target) => { // h, target 都是度
  let d = Math.abs(((h - target) % 180 + 180) % 180);
  return d > 90 ? 180 - d : d;
};
const latticeDev = h => Math.min(axisDev(h, 0), axisDev(h, 60), axisDev(h, 120));

function trial(theta) {
  api.applyPreset("solo");
  const f = api.fields[0];
  for (let i = 0; i < N; i++) f[i] = 0;
  api.ang = theta % 360;
  api.placePattern("jelly", 64, 64);
  api.ang = 0;
  // 每 50 步采样：分两阶段累计位移
  let prev = com(), pE = [0,0], pL = [0,0], S300 = null;
  for (let g = 1; g <= 600; g++) {
    api.step();
    if (g % 50 === 0) {
      const c = com();
      if (prev && c) {
        const dQ = wd(prev[0], c[0]), dR = wd(prev[1], c[1]);
        const dx = dQ + dR / 2, dy = (SQ3 / 2) * dR;
        if (g > 50 && g <= 300) { pE[0] += dx; pE[1] += dy; }
        else if (g > 300)       { pL[0] += dx; pL[1] += dy; }
      }
      if (c) prev = c;
    }
    if (g === 300) S300 = Float64Array.from(api.fields[0]);
  }
  const dEnd = density();
  const diff = S300 ? shapeMatch(S300, api.fields[0]) : 9;
  const stat = v => ({
    h: (Math.atan2(v[1], v[0]) * 180 / Math.PI + 360) % 360,
    s: Math.hypot(v[0], v[1]) / 250
  });
  const e = stat(pE), l = stat(pL);
  if (dEnd < 0.0005) { console.log(`θ=${String(theta).padStart(3)}° → 灭绝`); return {theta, alive:false}; }
  const devIn = axisDev(e.h, theta), devLat = latticeDev(e.h);
  const turn = axisDev(e.h, l.h);
  console.log(`θ=${String(theta).padStart(3)}° 存活 密度=${dEnd.toFixed(4)} | 早期: 航向${e.h.toFixed(1)}° 速${e.s.toFixed(2)} | 后期: 航向${l.h.toFixed(1)}° 速${l.s.toFixed(2)} | 转向=${turn.toFixed(1)}° | 偏离输入轴=${devIn.toFixed(1)}° | 偏离晶格轴=${devLat.toFixed(1)}° | 形态差=${diff.toFixed(3)}`);
  return {theta, alive:true, eh:e.h, lh:l.h, devIn, devLat, turn, diff};
}

console.log("=== 控制组（应精确 +60k 关系）===");
trial(0);
trial(60);
trial(180);
console.log("=== 离格角度 ===");
trial(15);
trial(30);
trial(45);
trial(90);
