// 诊断: lifecreatures.js 的 rec 与原版 LifeForms.js 是否一致 / 解码是否出细胞
const fs = require("fs");
global.window = {};
eval(fs.readFileSync(__dirname + "/../data/lifecreatures.js", "utf8"));
const LIFE = window.LENIA_LIFEFORMS;

// 原版解码(与 transplant.js 相同)
const fromZip = c => c === "0" ? 0 : c === "1" ? 100 : c.charCodeAt(0) - 191;
function decode(st) {
  const isZip = st.startsWith("(zip)");
  if (isZip) st = st.substring(5);
  let rows = st.split("/"), w = 0;
  for (let i = 0; i < rows.length; i++) {
    let row = rows[i].trim();
    if (isZip) {
      const segs = row.split("-"); row = "";
      for (const seg of segs) { const p = seg.split("."); row += p.length === 1 ? seg : "0".repeat(fromZip(p[0])) + (p[1] || ""); }
    }
    rows[i] = row = row.split(isZip ? "" : ",");
    w = Math.max(w, row.length);
    if (isZip) for (let j = 0; j < row.length; j++) { const v = fromZip(row[j]) / 100; row[j] = v < 0 ? 0 : v; }
    else for (let j = 0; j < row.length; j++) row[j] = parseFloat(row[j]) || 0;
  }
  let nz = 0, mx = 0;
  for (const r of rows) for (const v of r) { if (v > 0 && v <= 1) { nz++; if (v > mx) mx = v; } else if (v > 0) nz += 0; }
  return { w, h: rows.length, nz, mx };
}

console.log("lifecreatures.js 条数:", LIFE.length);
for (const idx of [1, 56]) {
  const e = LIFE[idx];
  const ci = e.rec.indexOf(";cells=");
  const cells = e.rec.slice(ci + 7);
  const d = decode(cells);
  console.log(`[${idx}] ${e.name} | cells前60字: ${JSON.stringify(cells.slice(0, 60))}`);
  console.log(`     段长=${cells.length} 解码: ${d.w}x${d.h} 非零=${d.nz} 最大值=${d.mx}`);
}

// 与原版 LifeForms.js 同标本比对
const lf = fs.readFileSync("lenia-reference/Lenia-LifeForms.js", "utf8");
const re = /\["([^"]{1,20})",\s*"([^"]{2,60})",\s*"([^"]{0,40})",\s*"([^"]*R=[^"]*)"/g;
let mm, found = 0;
while ((mm = re.exec(lf)) !== null) {
  if (mm[1] === "Scutium solidus") {
    const orig = mm[4], mine = LIFE[1].rec;
    console.log("原版 rec 长:", orig.length, "| 我们 rec 长:", mine.length, "| 相等:", orig === mine);
    if (orig !== mine) {
      let k = 0; while (k < Math.min(orig.length, mine.length) && orig[k] === mine[k]) k++;
      console.log("首个差异位置", k, "原:", JSON.stringify(orig.slice(k, k + 70)), "我:", JSON.stringify(mine.slice(k, k + 70)));
    }
    found++;
  }
}
console.log("原版匹配到 Scutium solidus:", found);
