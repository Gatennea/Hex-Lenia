#!/usr/bin/env node
// 零依赖静态检查（项目红线：不引第三方包，lint 也自研）
// 检查项：
//   [E] 语法：tools/*.js、data/*.js、index.html 内联脚本 —— vm.Script 编译不执行
//   [E] 禁用 ** 运算符（一元负号优先级坑，全项目禁令）
//   [E] index.html 的 <script src>/<link href> 本地目标必须存在（防重构后断链）
//   [W] 死代码候选：文件内声明且出现 ≤1 次的 function/const/let（人工复核，不阻断）
// 退出码：有 E 级问题 = 1；仅 W 级 = 0
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const errors = [], warns = [];

function read(p) { return fs.readFileSync(p, "utf8"); }

// ── 1. 语法检查 ──
function checkSyntax(file, src, label) {
  try { new vm.Script(src, { filename: label }); }
  catch (e) { errors.push(`[E] 语法 ${label}: ${e.message}`); }
}
for (const dir of ["tools", "data", "js"]) {
  const d = path.join(ROOT, dir);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) {
    if (f.endsWith(".js")) checkSyntax(null, read(path.join(d, f)), `${dir}/${f}`);
  }
}

// index.html 内联脚本逐块检查
const htmlPath = path.join(ROOT, "index.html");
const html = fs.existsSync(htmlPath) ? read(htmlPath) : "";
const inlineRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m, block = 0;
while ((m = inlineRe.exec(html)) !== null) {
  if (m[1].trim()) checkSyntax(null, m[1], `index.html#script[${block}]`);
  block++;
}

// ── 2. 禁用 ** （代码文件；跳过注释行与数据文件）──
function banDoubleStar(label, src) {
  src.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
    // 命中：操作数后跟 ** （如 x ** 2、(a) ** 2、a **=）；排除注释尾缀
    const code = line.split("//")[0];
    if (/[\w)\]]\s*\*\*=|[\w)\]]\s*\*\*[^*/]/.test(code))
      errors.push(`[E] 禁用** ${label}:${i + 1}: ${t.slice(0, 80)}`);
  });
}
banDoubleStar("index.html", html);
for (const f of fs.readdirSync(path.join(ROOT, "tools")).filter(f => f.endsWith(".js")))
  banDoubleStar(`tools/${f}`, read(path.join(ROOT, "tools", f)));

// ── 3. index.html 本地资源引用存在性 ──
{
  const refRe = /(?:src|href)="([^"]+)"/g;
  while ((m = refRe.exec(html)) !== null) {
    const u = m[1];
    if (/^(https?:|data:|#|mailto:)/.test(u)) continue;
    if (!fs.existsSync(path.join(ROOT, u.split("?")[0])))
      errors.push(`[E] 断链 index.html → "${u}"（文件不存在）`);
  }
}

// ── 4. 死代码候选（警告级，人工复核）：文件内出现 ≤1 次的声明
//    注：不做 count==2 “未接线”启发式——函数声明+单次正常调用即 2 次，误报率 99%（实测 226 条）
// 外部 API 白名单：被 tools 脚本按名提取源码调用（fn() 模式），文件内看似未引用
const EXTERNAL_API = new Set(["loadPattern"]);
// 死代码扫描跳过：test_unit.js 的 UI 桩定义在模板字符串里，非真实声明
const DEAD_SKIP = new Set(["test_unit.js"]);
function deadScan(label, src) {
  const decl = /\b(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
  const names = new Set();
  let d;
  while ((d = decl.exec(src)) !== null) names.add(d[1]);
  for (const n of names) {
    if (/[\W_]+$/.test(n)) continue;            // 纯符号名（$、_）\b 边界失效，跳过
    if (EXTERNAL_API.has(n)) continue;
    const re = new RegExp(`\\b${n.replace(/\$/g, "\\$")}\\b`, "g");
    const cnt = (src.match(re) || []).length;
    if (cnt <= 1) warns.push(`[W] 死代码候选 ${label}: "${n}"（仅出现 ${cnt} 次）`);
  }
}
deadScan("index.html", html);
for (const f of fs.readdirSync(path.join(ROOT, "tools")).filter(f => f.endsWith(".js") && !DEAD_SKIP.has(f)))
  deadScan(`tools/${f}`, read(path.join(ROOT, "tools", f)));

// ── 报告 ──
const jsFiles = ["index.html(内联)", "tools/*.js", "data/*.js"].join("、");
console.log(`lint 扫描：${jsFiles}`);
for (const w of warns) console.log("  " + w);
for (const e of errors) console.log("  " + e);
console.log(errors.length
  ? `✗ ${errors.length} 错误 / ${warns.length} 警告`
  : `✓ 语法与禁令通过（${warns.length} 条死代码候选待人工复核）`);
process.exit(errors.length ? 1 : 0);
