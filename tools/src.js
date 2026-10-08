// 统一游戏源码入口（P2 拆分后）：
// 旧工具普遍是 `const html = fs.readFileSync(index.html); html.match(/<script>…/)`，
// 本模块返回带 <script> 包裹的拼接源码，使旧的 match 模式零改动继续工作。
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");

function html() {
  const parts = ["constants", "core", "render", "ui"]
    .map(n => fs.readFileSync(path.join(ROOT, "js", n + ".js"), "utf8"));
  return "<script>\n" + parts.join("\n") + "\n</script>";
}
// 只要引擎（constants+core，零 DOM）——单元测试用
function coreOnly() {
  return ["constants", "core"]
    .map(n => fs.readFileSync(path.join(ROOT, "js", n + ".js"), "utf8")).join("\n");
}
module.exports = { html, coreOnly, ROOT };
