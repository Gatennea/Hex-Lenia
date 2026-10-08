// 生成 lifecreatures.js：按“幸存者键”(name+code+R+m+s) 从 LifeForms 提取完整记录
const fs = require("fs");
const KEYS = [
["Orbium unicaudatus ignis","O2(-)",13,0.119,0.0148],
["Scutium solidus","S1(a)",13,0.29,0.043],
["Scutium valvatus","S1(c)",13,0.292,0.0486],
["Discutium serratus","2S2",10,0.35,0.061],
["Discutium serratus","2S2",13,0.272,0.0375],
["Triscutium serratus valvatus laterale","2S3",10,0.35,0.059],
["Tetrascutium solidus","S4(a)",13,0.422,0.0878],
["Tetrascutium valvatus","S4(c)",13,0.396,0.0764],
["Pentascutium solidus","S5(a)",13,0.422,0.0858],
["Pentascutium valvatus","S5(b)",13,0.407,0.0806],
["Pentascutium gravidus","S5(c)",13,0.48,0.1106],
["Hexascutium","S6",13,0.46,0.1],
["Heptascutium","S7",13,0.49,0.112],
["Gyropteron serratus velox","2PG1",10,0.24,0.037],
["Synptera serratus cavus saliens","2P3",10,0.25,0.038],
["Pyroscutium ambiguus serratus","2PS3",13,0.304,0.046],
["Paraptera arcus saliens","P4(c)",13,0.33,0.0565],
["Paraptera arcus pedes","P4(e)",13,0.362,0.0665],
["Paraptera cavus pedes","P4(a)",13,0.301,0.0454],
["Paraptera cavus furiosus","P4(-)",13,0.297,0.0405],
["Paraptera serratus arcus saliens","2P4",10,0.34,0.059],
["Pentapteryx arcus labens","P5(a)",13,0.373,0.0645],
["Pentapteryx arcus saliens","P5(b)",13,0.348,0.0631],
["Pentapteryx cavus labens","P5(a)",13,0.34,0.05],
["Pentapteryx cavus saliens","P5(f)",13,0.298,0.0469],
["Pentapteryx cavus pedes","P5(d)",13,0.322,0.0531],
["Pentapteryx cavus furiosus","P5(c)",13,0.285,0.0408],
["Pentapteryx arcus valvatus","P5(g)",13,0.383,0.0695],
["Pentapteryx serratus cavus labens","2P5",10,0.34,0.056],
["Hexapteryx arcus labens","P6",13,0.38,0.07],
["Hexapteryx serratus cavus labens","2P6",10,0.36,0.062],
["Heptapteryx arcus labens","P7",13,0.38,0.07],
["Heptapteryx cavus labens","P7",13,0.34,0.05],
["Heptapteryx cavus labens cunctans","P7",13,0.333,0.048],
["Heptapteryx serratus cavus labens","2P7",10,0.36,0.061],
["Heptapteryx serratus liquefaciens","2P7",10,0.34,0.051],
["Octapteryx arcus labens","P8",13,0.38,0.07],
["Octapteryx cavus labens","P8",13,0.34,0.05],
["Octapteryx serratus cavus labens","2P8",10,0.38,0.065],
["Nonapteryx cavus labens","P9",13,0.34,0.053],
["Nonapteryx serratus sinus labens","2P9",10,0.38,0.064],
["Decapteryx cavus labens","P10",13,0.34,0.053],
["Hexacaudopteryx","P6,4",13,0.35,0.048],
["Helicium arcus saliens ignis","H3(-)",13,0.323,0.0577],
["Helicium serratus ocellus","2H3",10,0.31,0.048],
["Heptahelicium solidus","H7",13,0.38,0.055],
["Nonahelicium ignis","H9",13,0.372,0.0496],
["Octahelicium","H8",13,0.38,0.055],
["Circium ventilans tenuis","~C0",13,0.146,0.0199],
["Circium rupturus","C0",13,0.079,0.0107],
["Aerogeminium volitans","2G",18,0.32,0.051],
["Hydrogeminium natans","3G",18,0.26,0.036],
["Gyrogeminium tardus","3GG",18,0.27,0.038],
["Ferrokronium valvatus laterale","K6(3,3)",18,0.24,0.036],
["Crucium crux ventilans","3R4(3,3,3)",27,0.19,0.029],
["Decadentium rotans trioculi","2D10",18,0.28,0.035],
["Bug(bigger)","~(bbug)",26,0.31,0.05],
];
const lf = fs.readFileSync(__dirname + "/../lenia-reference/Lenia-LifeForms.js", "utf8");
const recRe = /\["([^"]{1,20})",\s*"([^"]{2,60})",\s*"([^"]{0,40})",\s*"(R=[^"]+)"/g;
const recs = []; let mm;
while ((mm = recRe.exec(lf)) !== null) recs.push({ name: mm[2], code: mm[1], rec: mm[4] });
function parseRS(rs) {
  const o = { R: 0, m: 0, s: 0 };
  const mR = rs.match(/R=(\d+)/); if (mR) o.R = +mR[1];
  const md = rs.match(/d=[a-z0-9]+\((-?[\d.eE+-]+),(-?[\d.eE+-]+)\)/);
  if (md) { o.m = +md[1]; o.s = +md[2]; }
  return o;
}
const out = [], missing = [];
const used = new Set();
for (const [name, code, R, m, s] of KEYS) {
  let found = null;
  for (let i = 0; i < recs.length; i++) {
    if (used.has(i)) continue;
    const r = recs[i];
    if (r.code !== code || r.name !== name) continue;
    if (!r.rec.includes(";cells=")) continue;
    const p = parseRS(r.rec.slice(0, r.rec.indexOf(";cells=")));
    if (p.R === R && Math.abs(p.m - m) < 1e-9 && Math.abs(p.s - s) < 1e-9) { found = { i, r }; break; }
  }
  if (found) { used.add(found.i); out.push({ name: found.r.name, code: found.r.code, rec: found.r.rec }); }
  else missing.push(`${name} [${code}] R=${R} m=${m} s=${s}`);
}
console.log(`匹配 ${out.length}/${KEYS.length}`);
if (missing.length) { console.log("缺失:"); missing.forEach(x => console.log("  " + x)); }
const body = "window.LENIA_LIFEFORMS = [\n" + out.map(o =>
  `  {name:${JSON.stringify(o.name)}, code:${JSON.stringify(o.code)}, rec:${JSON.stringify(o.rec)}}`).join(",\n") + "\n];\n";
fs.writeFileSync(__dirname + "/../data/lifecreatures.js",
  `// 生成文件：原版 Lenia 生物库中移植幸存者（${out.length} 种）\n// 由 build_gallery.js 从 lenia-reference/Lenia-LifeForms.js 提取（键: name+code+R+μ+σ）\n` + body);
console.log(`lifecreatures.js 写入 ${out.length} 条，${(body.length / 1024).toFixed(0)}KB`);
