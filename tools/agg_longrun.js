// 汇总 5 批长跑 → data/longrun_2000.txt（统计头 + 原始数据）
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), DATA = path.join(ROOT, "data");
const parts = [];
for (let p = 0; p < 5; p++) parts.push(fs.readFileSync(path.join(DATA, `longrun_p${p}.txt`), "utf8"));
const alive = [], dead = []; const jelly = [];
let prev = "";
for (const t of parts) for (const line of t.split(/\r?\n/)) {
  if (line && !line.startsWith("   ") && !line.startsWith("批次")) prev = line;
  if (!line.includes("act=")) continue;
  const isDead = line.includes("死");
  if (prev.includes("水母")) jelly.push(isDead ? "死" : "活");
  else (isDead ? dead : alive).push(prev.replace(/\s*\(\d+².*$/, ""));
}
const hdr = [
  "# 57 种原版生物 × 2000 步 长跑复核（六角核 · compare_grids hex 模式）",
  `# 存活: ${alive.length}/57   死亡: ${dead.length}/57   水母对照(5批): ${jelly.join(" ")}`,
  `# 死亡名单: ${dead.join("、") || "（无）"}`,
  "# 生成: node tools/agg_longrun.js   ← data/longrun_p0..4.txt",
  ""
];
fs.writeFileSync(path.join(DATA, "longrun_2000.txt"), hdr.join("\n") + parts.join(""));
console.log(hdr[1]);
console.log(hdr[2]);
