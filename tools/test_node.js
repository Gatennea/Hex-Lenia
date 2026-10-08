// Node 桩环境：验证 index.html 启动脚本是否有死循环/异常
const fs = require("fs");
const html = fs.readFileSync(__dirname + "/../index.html", "utf8");
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.log("NO SCRIPT"); process.exit(1); }
const src = m[1];

// ---- DOM 桩 ----
function makeEl() {
  return {
    style: {}, innerHTML: "", textContent: "", value: "0",
    classList: { add(){}, remove(){}, toggle(){} },
    addEventListener(){}, appendChild(){},
    getContext() {
      return new Proxy({}, {
        get(t, p) {
          if (p === "canvas") return { width: 0, height: 0 };
          if (p === "createImageData") return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
          if (t[p] !== undefined) return t[p];
          return () => {};
        },
        set() { return true; }
      });
    },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    width: 0, height: 0
  };
}
const els = {};
const document = {
  getElementById(id) { if (!els[id]) els[id] = makeEl(); return els[id]; },
  createElement() { return makeEl(); },
  addEventListener(){},
  body: { classList: { toggle() {}, add() {}, remove() {} } }
};
const window = {
  devicePixelRatio: 1,
  addEventListener(){},
  requestAnimationFrame(){}
};
let rafCount = 0;
function requestAnimationFrame(cb) { if (++rafCount < 500) setTimeout(()=>cb(rafCount*16), 0); }
const performance = { now: () => Date.now() };

const t0 = Date.now();
const timer = setTimeout(() => { console.log("HANG DETECTED after 10s"); process.exit(2); }, 10000);

try {
  const fn = new Function("document","window","requestAnimationFrame","performance", src + "\n;return {step, selfTest, render, W, H, CH, rules};");
  const api = fn(document, window, requestAnimationFrame, performance);
  console.log("startup OK, W,H,CH =", api.W, api.H, api.CH);
  // 跑 step + selfTest
  const st = api.selfTest();
  console.log("selfTest:", JSON.stringify(st));
  for (let i = 0; i < 50; i++) api.step();
  console.log("50 steps OK, stepMs approx ok");
  api.render && api.render();
  console.log("render OK");
  clearTimeout(timer);
  console.log("ALL PASS in", Date.now() - t0, "ms");
  process.exit(0);
} catch (e) {
  console.log("ERROR:", e.message);
  console.log(e.stack.split("\n").slice(0, 5).join("\n"));
  process.exit(1);
}
