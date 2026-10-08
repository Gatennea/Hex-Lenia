// 生物发现器
//   node find_creatures.js batch '[{name,m,s,seed}...]'   — 种子×参数矩阵
//   node find_creatures.js islands                        — 从蠕虫场提取孤立结构并测试独立存活
// 分类：DEAD / FIELD / ★FLYER / ★OSC / STABLE / MORPH / 水母克隆
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
  src + `;return {applyPreset,placePattern,stampBitmap,patternBitmap,step,N,clearAll,
    get fields(){return fields},get rules(){return rules},
    setR(v){R=v;rebuildKernels(true)},setT(v){T=v}};`);
const api = fn(document, window, requestAnimationFrame, performance);
const N = api.N, W = 128;
const SQ3 = Math.sqrt(3);

// ── 测量 ──
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
function asciiAt(cx, cy, rad) {
  const f = api.fields[0];
  let s = "";
  for (let r = -rad; r <= rad; r++) {
    for (let q = -rad; q <= rad; q++) {
      const v = f[(((cx+q)%W)+W)%W + (((cy+r)%W)+W)%W * W];
      s += v < 0.005 ? "." : v < 0.3 ? "o" : v < 0.7 ? "O" : "@";
    }
    s += "\n";
  }
  return s;
}

// ── 种子库 ──
function clearField(){ api.clearAll(); }
function seg(q1,r1,q2,r2,thick){ // 画线段（六角圆盘笔触）
  const f=api.fields[0];
  const steps=Math.max(Math.abs(q2-q1),Math.abs(r2-r1),Math.abs((q2+r2)-(q1+r1)))*3+1;
  for(let t=0;t<=steps;t++){
    const q=q1+(q2-q1)*t/steps, r=r1+(r2-r1)*t/steps;
    for(let dr=-thick;dr<=thick;dr++)for(let dq=-thick;dq<=thick;dq++){
      const dx=dq+dr/2,dy=(SQ3/2)*dr;
      if(dx*dx+dy*dy>thick*thick+0.01)continue;
      const qq=Math.round(q)+dq, rr=Math.round(r)+dr;
      if(qq>=0&&qq<W&&rr>=0&&rr<W) f[qq+rr*W]=1;
    }
  }
}
const SEEDS = {
  jelly: () => api.placePattern("jelly", 64, 64),
  // ─ 水母突变（论文 2.3.4 手工突变）──
  flipH: () => { const bm=api.patternBitmap("jelly"); const out={w:bm.w,h:bm.h,data:new Float64Array(bm.w*bm.h)};
    // 视觉水平镜像: q' = (w-1) - q - r + 平移修正(保持范围)
    for(let r=0;r<bm.h;r++)for(let q=0;q<bm.w;q++){
      let q2=bm.w-1-q-r; while(q2<0)q2+=bm.w; while(q2>=bm.w)q2-=bm.w;
      out.data[q2+r*bm.w]=bm.data[q+r*bm.w];
    } api.stampBitmap(out,64,64); },
  flipV: () => { const bm=api.patternBitmap("jelly"); const out={w:bm.w,h:bm.h,data:new Float64Array(bm.w*bm.h)};
    // 视觉垂直镜像: (q,r) → (q+r, -r) + 平移
    for(let r=0;r<bm.h;r++)for(let q=0;q<bm.w;q++){
      let r2=bm.h-1-r, q2=q+r-(bm.h-1)/2; q2=Math.round(q2);
      while(q2<0)q2+=bm.w; while(q2>=bm.w)q2-=bm.w;
      out.data[q2+r2*bm.w]=bm.data[q+r*bm.w];
    } api.stampBitmap(out,64,64); },
  amputateL: () => { const bm=api.patternBitmap("jelly"); const out={w:bm.w,h:bm.h,data:new Float64Array(bm.w*bm.h)};
    const mid=(bm.w-1)/2;
    for(let r=0;r<bm.h;r++)for(let q=0;q<bm.w;q++) if(q>=mid) out.data[q+r*bm.w]=bm.data[q+r*bm.w];
    api.stampBitmap(out,64,64); },
  amputateR: () => { const bm=api.patternBitmap("jelly"); const out={w:bm.w,h:bm.h,data:new Float64Array(bm.w*bm.h)};
    const mid=(bm.w-1)/2;
    for(let r=0;r<bm.h;r++)for(let q=0;q<bm.w;q++) if(q<=mid) out.data[q+r*bm.w]=bm.data[q+r*bm.w];
    api.stampBitmap(out,64,64); },
  // ─ 新型种子 ──
  chevron: () => { seg(64-6,64, 64,64-5,2); seg(64,64-5, 64+6,64,2); },
  Lshape:  () => { seg(64-5,64+5, 64,64+5,2); seg(64,64+5, 64,64-5,2); },
  arc:     () => { const f=api.fields[0]; const r0=8;
    for(let r=0;r<W;r++)for(let q=0;q<W;q++){
      const dx=q-64+(r-64)/2, dy=(SQ3/2)*(r-64);
      const d=Math.sqrt(dx*dx+dy*dy), ang=Math.atan2(dy,dx)*180/Math.PI;
      if(Math.abs(d-r0)<1.8 && ang>-30 && ang<150) f[q+r*W]=1;
    }},
  tri:     () => { seg(64-7,64, 64,64-7,1); seg(64,64-7, 64+7,64,1); seg(64+7,64, 64-7,64,1); },
  blob5:   () => { const f=api.fields[0];
    for(let r=61;r<=67;r++)for(let q=61;q<=67;q++) f[q+r*W]=Math.random()<0.6?1:0; },
  ringHalf:() => { const f=api.fields[0];
    for(let r=0;r<W;r++)for(let q=0;q<W;q++){
      const dx=q-64+(r-64)/2, dy=(SQ3/2)*(r-64);
      const d=Math.sqrt(dx*dx+dy*dy), ang=Math.atan2(dy,dx)*180/Math.PI;
      if(Math.abs(d-7)<2 && ang>60 && ang<300) f[q+r*W]=Math.random();
    }},
  nd8:  () => noiseDisk(8),
  nd10: () => noiseDisk(10),
  nd12: () => noiseDisk(12),
  nd15: () => noiseDisk(15),
  nd18: () => noiseDisk(18),
  nd20: () => noiseDisk(20),
};
// 均匀噪声斑（U(0,1)，临界质量候选）：全场噪声能活，斑呢？
function noiseDisk(rad) {
  const f=api.fields[0];
  for(let r=0;r<W;r++)for(let q=0;q<W;q++){
    const dx=q-64+(r-64)/2, dy=(SQ3/2)*(r-64);
    if(dx*dx+dy*dy < rad*rad) f[q+r*W]=Math.random();
  }
}

// ── 软化：硬边种子 → 软梯度（模糊2遍 + 重归一化）──
// 关键发现：硬边（值1）同步崩落必死；水母靠软梯度值域存活
const NB6 = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
function soften(passes) {
  const f = api.fields[0];
  for (let p = 0; p < passes; p++) {
    const src = Float64Array.from(f);
    for (let r = 0; r < W; r++) for (let q = 0; q < W; q++) {
      let s = src[q + r * W] * 2, cnt = 2;   // 自重2
      for (const [dq, dr] of NB6)
        s += src[(((q+dq)%W)+W)%W + (((r+dr)%W+W)%W)*W];
      f[q + r * W] = s / (cnt + 6);
    }
  }
  let mx = 0;
  for (let i = 0; i < N; i++) if (f[i] > mx) mx = f[i];
  if (mx > 0) for (let i = 0; i < N; i++) f[i] /= mx;   // 重归一化核心回 1
}
const SOFT_SEEDS = new Set(["chevron","Lshape","arc","tri","blob5","ringHalf"]);

// ── 批次4种子：临界质量 / 不对称性 / 水母缩放变体 ──
function scaleJelly(k) {
  const bm = api.patternBitmap("jelly");
  const w = Math.max(3, Math.round(bm.w * k)), h = Math.max(3, Math.round(bm.h * k));
  const data = new Float64Array(w * h);
  const cx0 = (bm.w - 1) / 2, cy0 = (bm.h - 1) / 2, cx1 = (w - 1) / 2, cy1 = (h - 1) / 2;
  const src = (i, j) => (i < 0 || i >= bm.w || j < 0 || j >= bm.h) ? 0 : bm.data[i + j * bm.w];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = (x - cx1) / k + cx0, sy = (y - cy1) / k + cy0;
    const i1 = Math.floor(sx), j1 = Math.floor(sy);
    const fx = sx - i1, fy = sy - j1;
    const v = src(i1,j1)*(1-fx)*(1-fy) + src(i1+1,j1)*fx*(1-fy)
            + src(i1,j1+1)*(1-fx)*fy + src(i1+1,j1+1)*fx*fy;
    if (v > 0.004) data[x + y * w] = v;
  }
  api.stampBitmap({ w, h, data }, 64, 64);
}
Object.assign(SEEDS, {
  jellyS08: () => scaleJelly(0.8),
  jellyS13: () => scaleJelly(1.3),
  bigCone: () => { const f=api.fields[0], rad=11;
    for(let r=0;r<W;r++)for(let q=0;q<W;q++){
      const dx=q-64+(r-64)/2, dy=(SQ3/2)*(r-64), d=Math.sqrt(dx*dx+dy*dy);
      if(d<rad) f[q+r*W]=Math.max(0, 1 - 0.85*d/rad);
    }},
  bigConeSkew: () => { const f=api.fields[0], rad=11;
    for(let r=0;r<W;r++)for(let q=0;q<W;q++){
      const dx=q-64+(r-64)/2, dy=(SQ3/2)*(r-64), d=Math.sqrt(dx*dx+dy*dy);
      if(d<rad) f[q+r*W]=Math.max(0, Math.min(1, 1.15 - 0.9*d/rad + 0.35*(dx/rad)));
    }},
});

const OSC_LAGS=[2,3,4,5,6,8,10,12,15,20,24,30,40,50];
function trial(T) {
  api.applyPreset("solo");
  api.rules[0].m = T.m; api.rules[0].s = T.s;
  api.setR(T.R || 10); api.setT(10);
  clearField();
  (SEEDS[T.seed] || SEEDS.jelly)();
  if (SOFT_SEEDS.has(T.seed)) soften(2);
  const hist=[]; let osc=-1, S250=null, c250=null, prev=null, path=0;
  for (let g=1; g<=500; g++) {
    api.step();
    hist.push(Float64Array.from(api.fields[0]));
    if (hist.length>60) hist.shift();
    if (g%5===0 && hist.length>=51 && osc<0) {
      const cur=hist[hist.length-1];
      for (const P of OSC_LAGS) {
        if (P>=hist.length) continue;
        const ref=hist[hist.length-1-P];
        let s=0;
        for (let i=0;i<N;i++){const dd=Math.abs(cur[i]-ref[i]);s+=dd;if(s>0.05)break;}
        if (s<=0.05){osc=P;break;}
      }
    }
    if (g%50===0) {
      const c=com();
      if(prev&&c&&g>100) path+=Math.hypot(wd(prev[0],c[0]),wd(prev[1],c[1]));
      if(c) prev=c;
    }
    if (g===250) { S250=Float64Array.from(api.fields[0]); c250=com(); }
  }
  const d=density();
  const S500=Float64Array.from(api.fields[0]);
  const c500=com();
  const speed=path/400;
  let cls="?", detail="";
  if (d<0.0003) cls="DEAD";
  else if (d>0.06) cls="FIELD";
  else {
    const diff=S250?shapeMatch(S250,S500):9;
    const move=(c250&&c500)?Math.hypot(wd(c250[0],c500[0]),wd(c250[1],c500[1])):0;
    // 水母克隆检测
    const jClone=diff<0.05 && Math.abs(d-0.0031)<0.0015 && speed>0.3 && seedIsJellyFamily(T.seed);
    if (osc>0) { cls="★OSC"; detail=`周期=${osc}`; }
    else if (jClone) { cls="水母克隆"; }
    else if (diff<0.10 && move>=8) { cls="★FLYER"; detail=`位移=${move.toFixed(0)} 速度=${speed.toFixed(2)}`; }
    else if (diff<0.10) { cls="STABLE"; detail=`形态差=${diff.toFixed(3)}`; }
    else { cls="MORPH"; detail=`形态差=${diff.toFixed(3)} 密度=${d.toFixed(4)}`; }
    if (cls!=="DEAD" && cls!=="FIELD" && cls!=="水母克隆") {
      console.log(`  └ 形态(t=500, 质心±14):`);
      console.log(asciiAt(Math.round(c500?c500[0]:64), Math.round(c500?c500[1]:64), 14).split("\n").map(l=>"    "+l).join("\n"));
    }
  }
  console.log(`${(T.seed+"×m"+T.m+"s"+T.s).padEnd(28)} d=${d.toFixed(4)} 速度=${speed.toFixed(2)} ${cls} ${detail}`);
}
function seedIsJellyFamily(seed){ return ["jelly","flipH","flipV"].includes(seed); }

const mode = process.argv[2];
if (mode === "islands") {
  // ── 路线③：蠕虫场捞孤岛 ──
  api.applyPreset("solo");
  api.rules[0].m=0.15; api.rules[0].s=0.016; api.setR(10); api.setT(10);
  clearField();
  for(let i=0;i<N;i++) api.fields[0][i]=Math.random()<0.5?Math.random():0;
  for(let g=0;g<400;g++) api.step();
  // 提取 v>0.2 的连通分量（六角6邻接）
  const f=api.fields[0];
  const label=new Int32Array(N).fill(-1);
  const comps=[];
  const nb=[[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
  for(let i=0;i<N;i++){
    if(f[i]<0.2||label[i]>=0) continue;
    const id=comps.length; const stack=[i]; const cells=[];
    label[i]=id;
    while(stack.length){
      const c=stack.pop(); cells.push(c);
      const q=c%W, r=(c/W)|0;
      for(const [dq,dr] of nb){
        const qq=(((q+dq)%W)+W)%W;
        const n2=qq+(((r+dr)%W+W)%W)*W;
        if(f[n2]>=0.2&&label[n2]<0){label[n2]=id;stack.push(n2);}
      }
    }
    comps.push(cells);
  }
  // 孤岛 = 分量与其它分量的六角距离 ≥3
  const iso=[];
  for(const cells of comps){
    if(cells.length<15||cells.length>800) continue;
    let minQ=999,maxQ=-1,minR=999,maxR=-1;
    for(const c of cells){const q=c%W,r=(c/W)|0;if(q<minQ)minQ=q;if(q>maxQ)maxQ=q;if(r<minR)minR=r;if(r>maxR)maxR=r;}
    // 检查 bbox 外扩3格内没有别的分量细胞
    let isolated=true;
    for(const c of cells){
      const q=c%W,r=(c/W)|0;
      for(let dr=-3;dr<=3&&isolated;dr++)for(let dq=-3;dq<=3;dq++){
        const qq=(((q+dq)%W)+W)%W, rr=(((r+dr)%W)+W)%W;
        const n2=qq+rr*W;
        if(label[n2]>=0 && label[n2]!==label[c]) { isolated=false; break; }
      }
      if(!isolated) break;
    }
    if(isolated) iso.push({cells, size:cells.length, cx:Math.round((minQ+maxQ)/2), cy:Math.round((minR+maxR)/2)});
  }
  console.log(`场中分量=${comps.length} 孤岛=${iso.length}`);
  // 测每个孤岛：提取 → 放入空场 → 跑400 → 分类
  for(const isl of iso.slice(0,6)){
    // 整块提取：bbox + 边距2，拷贝全部值（含软体，不只硬核）
    let minQ=999,maxQ=-1,minR=999,maxR=-1;
    for(const c of isl.cells){const q=c%W,r=(c/W)|0;if(q<minQ)minQ=q;if(q>maxQ)maxQ=q;if(r<minR)minR=r;if(r>maxR)maxR=r;}
    minQ-=4;maxQ+=4;minR-=4;maxR+=4;
    const vals=[];
    clearField();
    for(let r=minR;r<=maxR;r++)for(let q=minQ;q<=maxQ;q++){
      const srcV=f[(((q)%W)+W)%W + (((r)%W)+W)%W*W];
      vals.push([q-minQ, r-minR, srcV]);
    }
    const cx0=64-((maxQ-minQ)>>1), cy0=64-((maxR-minR)>>1);
    for(const [dq,dr,v] of vals){
      const nq=(((dq+cx0)%W)+W)%W, nr=(((dr+cy0)%W)+W)%W;
      api.fields[0][nq+nr*W]=v;
    }
    // 跑
    let prev=com(), path=0, S200=null;
    for(let g=1;g<=400;g++){
      api.step();
      if(g%50===0){const c=com();if(prev&&c&&g>50)path+=Math.hypot(wd(prev[0],c[0]),wd(prev[1],c[1]));if(c)prev=c;}
      if(g===200) S200=Float64Array.from(api.fields[0]);
    }
    const d=density();
    const S400=Float64Array.from(api.fields[0]);
    let cls = d<0.0003?"DEAD":d>0.06?"FIELD(与场同化)":(S200&&shapeMatch(S200,S400)<0.10?(path>8?"★FLYER":"STABLE"):"MORPH");
    console.log(`孤岛 size=${isl.size} → 独立测试: d=${d.toFixed(4)} 路程=${path.toFixed(0)} → ${cls}`);
    if(cls!=="DEAD"&&cls!=="FIELD(与场同化)"){
      console.log(asciiAt(64,64,14).split("\n").map(l=>"    "+l).join("\n"));
    }
  }
} else if (mode === "walk") {
  // ═══ 渐变突变行走（论文 2.3.2/2.3.4 自动化）══=
  // 从水母出发，每轮小扰动（种子噪声 或 参数微调），存活接受/死亡回滚，
  // 沿可行域边缘漫步 → 形态显著偏离基线时记录为“发现”
  const t0 = Date.now();
  api.applyPreset("solo");
  api.rules[0].m = 0.15; api.rules[0].s = 0.016; api.setR(10); api.setT(10);
  clearField(); SEEDS.jelly();
  const baseline = Float64Array.from(api.fields[0]);
  let m = 0.15, s = 0.016, iter = 0, accepted = 0, discoveries = 0;
  let snap = Float64Array.from(api.fields[0]);
  let pending = null, lastRoll = 0;   // 结算期：大突变后静置再测形态
  const log = [];
  while (Date.now() - t0 < 85000 && iter < 500) {
    iter++;
    const oldM = m, oldS = s;
    // 三档突变：小噪声（可修复）/ 大噪声 / 结构破坏（随机撚灭 25% 细胞）
    const roll = lastRoll = Math.random();
    const f = api.fields[0];
    if (pending) { /* 结算期：不突变，只推进模拟 */ }
    else if (roll < 0.55) {
      const eps = 0.07;
      for (let i = 0; i < N; i++) if (f[i] > 0) {
        let v = f[i] + (Math.random() - 0.5) * eps;
        if (v < 0) v = 0; if (v > 1) v = 1;
        f[i] = v;
      }
    } else if (roll < 0.82) {
      const eps = 0.35;
      for (let i = 0; i < N; i++) if (f[i] > 0) {
        let v = f[i] + (Math.random() - 0.5) * eps;
        if (v < 0) v = 0; if (v > 1) v = 1;
        f[i] = v;
      }
    } else {
      for (let i = 0; i < N; i++) if (f[i] > 0 && Math.random() < 0.25) f[i] = 0;
    }
    // 50% 概率附带参数微调（结算期跳过）
    if (!pending && Math.random() < 0.5) {
      if (Math.random() < 0.5) m = Math.min(0.17, Math.max(0.13, m + (Math.random() - 0.5) * 0.004));
      else s = Math.min(0.020, Math.max(0.012, s + (Math.random() - 0.5) * 0.002));
      api.rules[0].m = m; api.rules[0].s = s;
    }
    for (let g = 0; g < 50; g++) api.step();
    const d = density();
    if (d < 0.0005 || d > 0.06) {           // 死亡/爆场 → 回滚
      api.fields[0].set(snap);
      m = oldM; s = oldS; api.rules[0].m = m; api.rules[0].s = s;
    } else {
      accepted++;
      snap = Float64Array.from(api.fields[0]);
      if (lastRoll >= 0.55 && !pending) pending = { at: iter + 3 };   // 大突变存活 → 3 轮后结算
      if (accepted % 25 === 0) {
        const diff = shapeMatch(baseline, api.fields[0]);
        log.push(`acc=${accepted} m=${m.toFixed(3)} s=${s.toFixed(4)} d=${d.toFixed(4)} 形态差=${diff.toFixed(3)}`);
        if (diff > 0.18 && discoveries < 6) {
          discoveries++;
          const c = com();
          console.log(`\n🔔 发现#${discoveries} (acc=${accepted} iter=${iter}) m=${m.toFixed(3)} s=${s.toFixed(4)} d=${d.toFixed(4)} 形态差=${diff.toFixed(3)}`);
          if (c) console.log(asciiAt(Math.round(c[0]), Math.round(c[1]), 15).split("\n").map(l => "    " + l).join("\n"));
          // 完整存档到 discoveries.json
          try {
            const u8 = new Uint8Array(N);
            for (let i = 0; i < N; i++) { let v = Math.round(api.fields[0][i] * 100); u8[i] = v < 0 ? 0 : v > 100 ? 100 : v; }
            let bin = "";
            for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
            const rec = { iter, accepted, m, s, R: 10, T: 10, density: d, shapeDiff: diff, cells: Buffer.from(bin, "binary").toString("base64"), grid: 128, found: new Date().toISOString() };
            const list = fs.existsSync("discoveries.json") ? JSON.parse(fs.readFileSync("discoveries.json", "utf8")) : [];
            list.push(rec);
            fs.writeFileSync("discoveries.json", JSON.stringify(list, null, 1));
          } catch (e) { console.log("  (存档失败: " + e.message + ")"); }
        }
      }
    }
    // 结算期：大突变静置后测形态（区分噪声瞬态与真正稳定的新形态）
    if (pending && iter >= pending.at) {
      const diff = shapeMatch(baseline, api.fields[0]);
      const dd = density();
      if (dd >= 0.0005 && dd <= 0.06 && diff > 0.15) {
        discoveries++;
        const c = com();
        console.log(`\n🔔 结算发现#${discoveries} (iter=${iter}) m=${m.toFixed(3)} s=${s.toFixed(4)} d=${dd.toFixed(4)} 形态差=${diff.toFixed(3)}`);
        if (c) console.log(asciiAt(Math.round(c[0]), Math.round(c[1]), 15).split("\n").map(l => "    " + l).join("\n"));
        try {
          const u8 = new Uint8Array(N);
          for (let i = 0; i < N; i++) { let v = Math.round(api.fields[0][i] * 100); u8[i] = v < 0 ? 0 : v > 100 ? 100 : v; }
          let bin = "";
          for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
          const rec = { iter, accepted, m, s, R: 10, T: 10, density: dd, shapeDiff: diff, cells: Buffer.from(bin, "binary").toString("base64"), grid: 128, settled: true, found: new Date().toISOString() };
          const list = fs.existsSync("discoveries.json") ? JSON.parse(fs.readFileSync("discoveries.json", "utf8")) : [];
          list.push(rec);
          fs.writeFileSync("discoveries.json", JSON.stringify(list, null, 1));
        } catch (e) { console.log("  (存档失败: " + e.message + ")"); }
      } else if (diff > 0.08) {
        console.log(`   (结算: 形态差 ${diff.toFixed(3)}，回归水母形态)`);
      }
      pending = null;
    }
  }
  console.log(`\n══ walk 结束: 迭代=${iter} 接受=${accepted} 回滚=${iter - accepted} 发现=${discoveries} 用时=${((Date.now() - t0) / 1000).toFixed(0)}s 终点 m=${m.toFixed(3)} σ=${s.toFixed(4)}`);
  console.log("轨迹尾部:\n" + log.slice(-6).join("\n"));
} else {
  const BATCH = JSON.parse(process.argv[3] || "[]");
  for (const t of BATCH) trial(t);
}
