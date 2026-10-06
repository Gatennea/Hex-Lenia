// 参数空间扫描：寻找“稳定且紧凑且有动态”的六角 Lenia 参数（问题3：大多是爆满/速死）
// 判定：DEAD(<0.03) | BLOWN(>0.55) | STATIC(活性≈0) | OK | JEWEL(紧凑+动态+稳定)
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
  src + `;return {applyPreset,step,N,get fields(){return fields},get rules(){return rules},
    clearAll,setR(v){R=v;rebuildKernels(true)},setT(v){T=v},
    get R(){return R}};`);
const api = fn(document, window, requestAnimationFrame, performance);
const N = api.N;

function setup(cfg) {
  api.applyPreset("solo");
  api.rules[0].m = cfg.m; api.rules[0].s = cfg.s;
  api.rules[0].g = cfg.g || "gaus";
  api.setR(cfg.R); api.setT(cfg.T || 10);
  api.clearAll();
  const f = api.fields[0], W = 128;
  if (cfg.init === "disk") {
    const cx = 64, cy = 64, rad = cfg.R * 1.2;
    for (let r = 0; r < W; r++) for (let q = 0; q < W; q++) {
      const dx = q - cx + (r - cy) / 2, dy = (Math.sqrt(3) / 2) * (r - cy);
      if (dx * dx + dy * dy < rad * rad) f[q + r * W] = Math.random();
    }
  } else {
    for (let i = 0; i < N; i++) f[i] = Math.random() < 0.5 ? Math.random() : 0;
  }
}
function density() { let s = 0; const f = api.fields[0]; for (let i = 0; i < N; i++) s += f[i]; return s / N; }
function fill() { let n = 0; const f = api.fields[0]; for (let i = 0; i < N; i++) if (f[i] > 0.1) n++; return n / N; }
function activity() {
  const snap = Float64Array.from(api.fields[0]);
  api.step();
  const f = api.fields[0];
  let s = 0; for (let i = 0; i < N; i++) s += Math.abs(f[i] - snap[i]);
  return s / N;
}
function comDrift() {  // 圆均值质心（环面）
  const f = api.fields[0], W = 128;
  let sx = 0, sy = 0, ax = 0, ay = 0;
  for (let r = 0; r < W; r++) for (let q = 0; q < W; q++) {
    const v = f[q + r * W]; if (v < 0.01) continue;
    const tx = 2 * Math.PI * q / W, ty = 2 * Math.PI * r / W;
    sx += Math.cos(tx) * v; sy += Math.sin(tx) * v;
    ax += Math.cos(ty) * v; ay += Math.sin(ty) * v;
  }
  return [((Math.atan2(sy, sx) / (2 * Math.PI)) * W + W) % W, ((Math.atan2(ay, ax) / (2 * Math.PI)) * W + W) % W];
}
const wrapD = (a, b) => { let d = b - a; if (d > 64) d -= 128; if (d < -64) d += 128; return d; };

const BATCH = JSON.parse(process.argv[2] || "[]");
const results = [];
for (const cfg of BATCH) {
  setup(cfg);
  let d300 = 0, drift = 0, prevCom = null;
  for (let g = 0; g < 400; g++) {
    api.step();
    if (g === 299) d300 = density();
    if (cfg.init === "disk") {
      const c = comDrift();
      if (prevCom) drift += Math.hypot(wrapD(prevCom[0], c[0]), wrapD(prevCom[1], c[1]));
      prevCom = c;
    }
  }
  const d = density(), fl = fill(), act = activity();
  let cls;
  if (d < 0.03) cls = "DEAD";
  else if (d > 0.55) cls = "BLOWN";
  else if (act < 1e-5) cls = "STATIC";
  else if (d <= 0.35 && fl <= 0.5 && Math.abs(d - d300) < 0.06) cls = (d <= 0.25 && fl <= 0.4) ? "JEWEL" : "OK";
  else cls = "UNSTABLE";
  const row = { ...cfg, d: +d.toFixed(3), fill: +fl.toFixed(3), act: +act.toExponential(1), drift: +drift.toFixed(1), cls };
  results.push(row);
  console.log(JSON.stringify(row));
}
const good = results.filter(r => r.cls === "JEWEL" || r.cls === "OK");
console.log("SUMMARY good=" + good.length + "/" + results.length + " " + good.map(g => `R${g.R}m${g.m}s${g.s}${g.init === "disk" ? "D" : ""}=${g.cls}`).join(" "));
