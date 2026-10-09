// P2-⑥ 单元测试：只加载 constants+core（零 DOM），验证纯函数与引擎独立性
// 用法: node tools/test_unit.js
const src = require("./src").coreOnly();

// core 在 applyPreset/setGrid 等路径会回调 UI 侧函数——单元环境注入空实现
const prelude = [
  "function allocBucketBuffers(){}",
  "function syncRuleUI(){}",
  "function fitView(){}",
  "function updateTexScale(){}",
  "function drawPlots(){}",
  "function showToast(m){ if(!globalThis.__toast) globalThis.__toast=[]; globalThis.__toast.push(m); }",
  "function dbg(){}",
].join("\n");

const api = new Function(prelude + "\n" + src + `;
return {
  GROWTHS, CORES, buildKernel, fft2d, lifeRuleParse, lifeToCells,
  applyPreset, randomInit, clearAll, step,
  get W(){return W}, get N(){return N}, get R(){return R}, get T(){return T},
  get rules(){return rules}, get fields(){return fields}, get coreType(){return coreType},
  setRings: (b, c) => { ringB = b; ringC = c; },
};`)();

let pass = 0, fail = 0;
const T = (name, cond, detail) => {
  if (cond) { pass++; console.log("  PASS " + name); }
  else { fail++; console.log("  FAIL " + name + (detail ? "  → " + detail : "")); }
};

// 1. 增长函数
const g = api.GROWTHS;
T("gaus 峰值在 μ 处 =1", Math.abs(g.gaus(0.15, 0.15, 0.016) - 1) < 1e-12);
T("gaus 远离 μ 衰减 → 0", g.gaus(0.5, 0.15, 0.016) < 1e-10);
T("rect 带内 1 / 带外 -1", g.rect(0.3, 0.3, 0.05) === 1 && g.rect(0.6, 0.3, 0.05) === -1);
T("poly/trap 存在且有限", isFinite(g.poly(0.2, 0.2, 0.1)) && isFinite(g.trap(0.2, 0.2, 0.1)));

// 2. 核函数（原版 exp = 平滑 bump：κ=exp(a−a/(4r(1−r)))，峰值在 r=0.5，边界为 0）
const k = api.CORES;
T("exp 核 r=0.5 峰值 =1", Math.abs(k.exp(0.5, 4) - 1) < 1e-12);
T("exp 核边界 r=0/r=1 为 0", k.exp(0, 4) === 0 && k.exp(1, 4) === 0);
T("exp 核单峰（升→峰→降）", k.exp(0.2, 4) < k.exp(0.5, 4) && k.exp(0.8, 4) < k.exp(0.5, 4));
T("rect 核带外为 0", k.rect(0.1) === 0 && k.rect(0.5) === 1);

// 3. buildKernel 归一化
const kf = api.buildKernel(10);
let sum = 0; for (const v of kf.sp) sum += v;
T("空间核 ΣK=1", Math.abs(sum - 1) < 1e-12, "Σ=" + sum);
T("频域核长度 = N", kf.re.length === api.N);
T("taps 与空间核同步归一", Math.abs(kf.taps.reduce((a, _, i, arr) => i % 3 === 2 ? a + arr[i] : a, 0) - 1) < 1e-9);

// 4. FFT 往返
{
  const W = api.W, N = api.N;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = Math.sin(i * 0.7) + Math.cos(i * 0.13);
  const orig = Float64Array.from(re);
  api.fft2d(re, im, W, W, -1);
  api.fft2d(re, im, W, W, 1);
  let err = 0; for (let i = 0; i < N; i++) err = Math.max(err, Math.abs(re[i] - orig[i]));
  T("FFT 往返误差 < 1e-12", err < 1e-12, "err=" + err);
}

// 5. 规则解析
{
  const p = api.lifeRuleParse("R=13;k=bump4;d=gaus(0.29,0.043)*0.1");
  T("lifeRuleParse 参数", p.R === 13 && p.m === 0.29 && p.s === 0.043 && p.grow === "gaus" && p.core === "exp" && p.T === 10, JSON.stringify(p));
  const p2 = api.lifeRuleParse("R=26;k=stpz1/4;d=gaus(0.31,0.05)*1");
  T("lifeRuleParse T=1(*1)", p2.T === 1 && p2.R === 26, JSON.stringify(p2));
  T("stpz1/4 不再被正则截断 → rect 核（=原版 (r∈[.25,.75])?1:0）", p2.core === "rect", "core=" + p2.core);
}

// 6. 种子解码（明文格式）
{
  const s = api.lifeToCells("1,0.5/0,1");
  T("lifeToCells 明文 2×2", s.w === 2 && s.h === 2 && s.arr[0][0] === 1 && s.arr[0][1] === 0.5 && s.arr[1][1] === 1, JSON.stringify(s));
}

// 7.5 多环核（5f）
{
  const k1 = api.buildKernel(10);              // 基线：单环
  const in1 = k1.sp[2], ring1 = k1.sp[6];      // d=2（内）与 d=6（环位0.62×10）样本
  api.setRings(0.5, 0.62);
  const k2 = api.buildKernel(10);
  let s = 0; for (const v of k2.sp) s += v;
  const in2 = k2.sp[2], ring2 = k2.sp[6];
  T("双环核 ΣK=1", Math.abs(s - 1) < 1e-12, "Σ=" + s);
  T("环带使 ring/inner 比值提升 >1.5×", (ring2 / in2) > 1.5 * (ring1 / in1),
    "单环=" + (ring1 / in1).toFixed(2) + " 双环=" + (ring2 / in2).toFixed(2));
  api.setRings(0, 0.62);
  const k3 = api.buildKernel(10);
  T("β=0 回到单环（与基线逐位一致）", k3.sp[6] === k1.sp[6] && k3.sp[2] === k1.sp[2]);
}

// 7. 引擎独立性：core-only 环境完整跑 100 步存活（solo 预设内含随机初始化）
{
  api.applyPreset("solo");
  let d0 = 0; for (let i = 0; i < api.N; i++) d0 += api.fields[0][i];
  for (let i = 0; i < 100; i++) api.step();
  let d1 = 0; for (let i = 0; i < api.N; i++) d1 += api.fields[0][i];
  T("core-only 随机场 100 步存活", d1 / api.N > 0.01, "d0=" + (d0 / api.N).toFixed(3) + " d100=" + (d1 / api.N).toFixed(3));
}

console.log(fail ? `✗ ${pass} 过 / ${fail} 失败` : `✓ 单元测试 ALL PASS (${pass} 项)`);
process.exit(fail ? 1 : 0);
