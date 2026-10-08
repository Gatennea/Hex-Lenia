// 水母各向同性测试：六角晶格 C6 对称性 → 按 60° 旋转种子，
// 理论预言：动力学与旋转交换，六方向的速度/行为应基本一致，航向 = 基准 + 60°·k
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
  src + `;return {loadPattern,step,N,get fields(){return fields}};`);
const api = fn(document, window, requestAnimationFrame, performance);
const N = api.N, W = 128;
const SQ3 = Math.sqrt(3);

function rot60(k) {  // 内容绕场心逆时针转 60°×k（晶格自同构，精确）
  const src2 = Float64Array.from(api.fields[0]);
  const dst = new Float64Array(N);
  const cx = W >> 1, cy = W >> 1;
  for (let r = 0; r < W; r++) for (let q = 0; q < W; q++) {
    let dq = q - cx, dr = r - cy;
    for (let t = 0; t < k; t++) { const nq = -dr, nr = dq + dr; dq = nq; dr = nr; }
    const sq = ((dq + cx) % W + W) % W, sr = ((dr + cy) % W + W) % W;
    dst[sq + sr * W] = src2[q + r * W];
  }
  api.fields[0].set(dst);
}
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
const density=()=>{let s=0;const f=api.fields[0];for(let i=0;i<N;i++)s+=f[i];return s/N;};

const rows = [];
for (let k = 0; k < 6; k++) {
  api.loadPattern("jelly");      // 清场+居中+经典参数
  rot60(k);
  // 每 50 步采样质心，分两阶段累加位移向量（小增量避免环绕别名）
  let prev = com();
  let p1 = [0, 0], p2 = [0, 0];   // 阶段1: 200→500, 阶段2: 500→800
  let S500 = null, dEnd = 0, alive = true;
  for (let g = 1; g <= 800; g++) {
    api.step();
    if (g % 50 === 0) {
      const c = com();
      if (prev && c) {
        const dQ = wd(prev[0], c[0]), dR = wd(prev[1], c[1]);
        const dx = dQ + dR / 2, dy = (SQ3 / 2) * dR;   // 轴向增量 → 卡特增量
        if (g > 200 && g <= 500) { p1[0] += dx; p1[1] += dy; }
        else if (g > 500)         { p2[0] += dx; p2[1] += dy; }
      }
      if (c) prev = c;
    }
    if (g === 500) S500 = Float64Array.from(api.fields[0]);
    if (g === 400 && density() < 0.0005) alive = false;
  }
  dEnd = density();
  const diff = S500 ? shapeMatch(S500, api.fields[0]) : 9;
  const stat = v => ({
    heading: (Math.atan2(v[1], v[0]) * 180 / Math.PI + 360) % 360,
    speed: Math.hypot(v[0], v[1]) / 300
  });
  const a1 = stat(p1), a2 = stat(p2);
  rows.push({ k, alive, dEnd: +dEnd.toFixed(4), h1: a1.heading, h2: a2.heading, s1: +a1.speed.toFixed(3), s2: +a2.speed.toFixed(3), diff: +diff.toFixed(3) });
  console.log(`rot=${k * 60}° 存活=${alive ? "是" : "否"} 密度=${dEnd.toFixed(4)} | 阶段1(200-500): 航向${a1.heading.toFixed(1)}° 速${a1.speed.toFixed(3)} | 阶段2(500-800): 航向${a2.heading.toFixed(1)}° 速${a2.speed.toFixed(3)} | 形态差=${diff.toFixed(3)}`);
}
// 汇总：1) 同向稳定性（阶段1 vs 阶段2）2) 旋转一致性（相对基准）
const alive = rows.filter(r => r.alive);
if (alive.length) {
  let turnMax = 0;
  for (const r of alive) { let d = Math.abs(r.h1 - r.h2); if (d > 180) d = 360 - d; if (d > turnMax) turnMax = d; }
  const base = alive[0].h1;
  let devMax = 0;
  for (const r of alive) {
    const expect = (base + 60 * r.k + 360) % 360;
    let d = Math.abs(r.h1 - expect); if (d > 180) d = 360 - d;
    if (d > devMax) devMax = d;
  }
  const sp = alive.flatMap(r => [r.s1, r.s2]);
  const sMin = Math.min(...sp), sMax = Math.max(...sp);
  console.log(`\n阶段内航向漂移(转向量): 最大 ${turnMax.toFixed(1)}°`);
  console.log(`速度范围: ${sMin.toFixed(3)} ~ ${sMax.toFixed(3)} 格/步 (比值 ${(sMax / sMin).toFixed(2)}x)`);
  console.log(`航向 vs 期望(基准+60k°): 最大偏差 ${devMax.toFixed(1)}°`);
  const pass = alive.length === 6 && sMax / sMin < 1.4 && devMax < 25;
  console.log(pass ? "✓ 各向同性基本 PASS（六方向一致，允许生物自然转向）" : "✗ 各向同性 FAIL");
}
