// 深测三个明星移植物种：Orbium / Scutium / Bug —— 六角上飞吗？形态稳吗？
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
    setR(v){R=v;rebuildKernels(true)},setT(v){T=v},setCore(c){coreType=c;rebuildKernels(true)}};`);
const api = fn(document, window, requestAnimationFrame, performance);
const N = api.N, W = 128, SQ3 = Math.sqrt(3);

// 标本提取 + 解码（与 transplant.js 相同）
const lf = fs.readFileSync(__dirname + "/lenia-reference/Lenia-LifeForms.js", "utf8");
const recRe = /\["([^"]{1,20})",\s*"([^"]{2,60})",\s*"([^"]{0,40})",\s*"(R=[^"]+)"/g;
const specimens = []; let mm;
while ((mm = recRe.exec(lf)) !== null) {
  const rec = mm[4], ci = rec.indexOf(";cells=");
  if (ci < 0) continue;
  specimens.push({ name: mm[2], code: mm[1], rule: rec.slice(0, ci), cells: rec.slice(ci + 7) });
}
const fromZip = c => c === "0" ? 0 : c === "1" ? 100 : c.charCodeAt(0) - 191;
const fromRep = st => st === "" ? 1 : (st.charCodeAt(0) >= 192 ? (st.length === 1 ? fromZip(st) : fromZip(st[0]) * 100 + fromZip(st[1])) : parseInt(st, 10));
function toCells(cellSt) {
  const isZip = cellSt.startsWith("(zip)");
  if (isZip) cellSt = cellSt.substring(5);
  const sep = isZip ? "" : ",";
  let rows = cellSt.split("/"), w = 0;
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
function parseRule(rs) {
  const o = { R: 10, T: 10, m: 0.15, s: 0.016, core: "exp", grow: "gaus" };
  const mR = rs.match(/R=(\d+)/); if (mR) o.R = +mR[1];
  const mk = rs.match(/k=([a-z0-9]+)/);
  if (mk) { const c = mk[1]; o.core = c === "quad4" ? "poly" : (c === "stpz1/4" || c === "stpz" || c === "life") ? "rect" : "exp"; }
  const md = rs.match(/d=([a-z0-9]+)\((-?[\d.eE+-]+),(-?[\d.eE+-]+)\)/);
  if (md) { o.grow = md[1] === "quad4" ? "poly" : md[1] === "stpz" ? "rect" : md[1] === "trap" ? "trap" : "gaus"; o.m = +md[2]; o.s = +md[3]; }
  const mt = rs.match(/\*([\d.]+)\s*$/); if (mt && +mt[1] > 0) o.T = Math.round(1 / +mt[1]);
  return o;
}
const density = () => { let s = 0; const f = api.fields[0]; for (let i = 0; i < N; i++) s += f[i]; return s / N; };
function com(){const f=api.fields[0];let sx=0,sy=0,ax=0,ay=0,n=0;
  for(let r=0;r<W;r++)for(let q=0;q<W;q++){const v=f[q+r*W];if(v<0.01)continue;n++;
    const tx=2*Math.PI*q/W,ty=2*Math.PI*r/W;
    sx+=Math.cos(tx)*v;sy+=Math.sin(tx)*v;ax+=Math.cos(ty)*v;ay+=Math.sin(ty)*v;}
  if(!n)return null;
  return [((Math.atan2(sy,sx)/(2*Math.PI))*W+W)%W,((Math.atan2(ay,ax)/(2*Math.PI))*W+W)%W];}
const wd=(a,b)=>{let d=b-a;if(d>64)d-=128;if(d<-64)d+=128;return d;};
function shapeMatch(A,B){let best=Infinity;
  for(let dy=-14;dy<=14;dy++)for(let dx=-14;dx<=14;dx++){let s=0;
    for(let r=0;r<W;r+=2)for(let q=0;q<W;q+=2)
      s+=Math.abs(A[q+r*W]-B[(((q+dx)%W+W)%W)+(((r+dy)%W+W)%W)*W]);
    const m=s/((W/2)*(W/2));if(m<best)best=m;}
  return best;}
function asciiAt(cx,cy,rad){const f=api.fields[0];let s="";
  for(let r=-rad;r<=rad;r++){for(let q=-rad;q<=rad;q++){
    const v=f[(((cx+q)%W)+W)%W+(((cy+r)%W)+W)%W*W];
    s+=v<0.005?".":v<0.3?"o":v<0.7?"O":"@";}s+="\n";}return s;}

for (const code of ["O2(-)", "S1(a)", "~(bbug)"]) {
  const sp = specimens.find(x => x.code === code);
  if (!sp) { console.log(code + " 未找到"); continue; }
  const seed = toCells(sp.cells), p = parseRule(sp.rule);
  api.applyPreset("solo");
  api.setCore(p.core); api.setR(p.R); api.setT(p.T);
  api.rules[0].m = p.m; api.rules[0].s = p.s;
  api.clearAll();
  const f = api.fields[0];
  const x0 = (W >> 1) - (seed.w >> 1), y0 = (W >> 1) - (seed.h >> 1);
  for (let j = 0; j < seed.h; j++) for (let i = 0; i < seed.w; i++) {
    const v = seed.arr[j][i];
    if (v > 0 && v <= 1) f[((x0+i)%W+W)%W + (((y0+j)%W+W)%W)*W] = v;
  }
  // 600 步：小步累计漂移 + 形态差 + 活性
  let prev = com(), path = 0, S300 = null;
  for (let g = 1; g <= 600; g++) {
    api.step();
    if (g % 50 === 0) { const c = com(); if (prev && c) path += Math.hypot(wd(prev[0],c[0]), wd(prev[1],c[1])); if (c) prev = c; }
    if (g === 300) S300 = Float64Array.from(api.fields[0]);
  }
  const d = density();
  const diff = S300 ? shapeMatch(S300, api.fields[0]) : 9;
  const c = com();
  console.log(`\n【${sp.name}】${code} R=${p.R} μ=${p.m} σ=${p.s}`);
  console.log(`  600步: d=${d.toFixed(4)} 路程=${path.toFixed(0)}格 (${(path/600).toFixed(2)}格/步) 形态差=${diff.toFixed(3)}`);
  if (c) console.log(asciiAt(Math.round(c[0]), Math.round(c[1]), 13).split("\n").map(l=>"  "+l).join("\n"));
}
