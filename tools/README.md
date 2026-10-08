# tools/ 实验与测试手册

从**仓库根目录**运行：`node tools/<脚本> [参数]`（脚本用 `__dirname` 定位游戏文件，与工作目录无关；
但少数脚本把产物写到 CWD，见各条目）。

## 质量门（每次 push 由 CI 自动执行）

| 脚本 | 用途 | 用法 |
|---|---|---|
| `lint.js` | 静态检查四查：语法 / 禁 `**` / index.html 断链 / 死代码候选 | `node tools/lint.js`（或 `npm run check`） |
| `test_node.js` | 回归：FFT 自检(≤1e-15) + 启动 + 50 步 + 渲染 | `node tools/test_node.js`（或 `npm test` 两者连跑） |

## 实验脚本

| 脚本 | 用途 | 用法 / 产物 |
|---|---|---|
| `compare_grids.js` | 方格核 vs 六角核单变量对照（存活/速度/直线度/晶格偏差/形变） | `node tools/compare_grids.js A B [步数=300] [hex]`；`hex`=只跑六角端；产物→ stdout 重定向 |
| `transplant.js` | 原版 330 标本移植扫描（200 步筛选） | `node tools/transplant.js A B` 或 `probe`（只解码不跑） |
| `verify_survivors.js` | 明星物种 600 步深测 | `node tools/verify_survivors.js`（无参） |
| `sweep2.js` | R×μ×σ 参数网格扫描（画稳定带） | `node tools/sweep2.js '[配置JSON]'`，缺省内置批 |
| `hunt_creatures.js` | 生物猎手：自动分类 DEAD/FIELD/★FLYER/★OSC/STABLE/MORPH | `node tools/hunt_creatures.js '[配置JSON]'` |
| `find_creatures.js` | 发现器三模式 `batch`/`islands`/`walk`（渐变突变行走） | `node tools/find_creatures.js <mode> '[配置JSON]'` → `discoveries.json`（CWD） |
| `mutate_jelly.js` | 水母 μ/σ 突变走廊扫描 | `node tools/mutate_jelly.js '[配置JSON]'` |
| `test_isotropy.js` | C6 各向同性（60°×6 旋转 × 800 步） | `node tools/test_isotropy.js` |
| `test_rotate.js` | 任意角旋转放置实验（7 角度 × 600 步） | `node tools/test_rotate.js` |
| `reproduce_jelly.js` | 水母复现尝试（笔画种子矩阵） | `node tools/reproduce_jelly.js` |
| `experiment_orbium.js` | Orbium 方格对照引擎实验 | `node tools/experiment_orbium.js` → `exp_result.txt` |
| `build_gallery.js` | 从原版 LifeForms 重建 `lifecreatures.js`（57 种键匹配） | **唯一依赖 `lenia-reference/`（不入库）**，本地有该目录才能跑 |
| `diag_cells.js` | 生物库数据诊断（解码/规则解析抽查） | `node tools/diag_cells.js` |

## ⚠️ 环境约束（踩过坑的）

- **CLI 单命令 120s 上限** → 批量长任务必须后台脱离会话，**本环境实测有效的唯一方式**：
  ```powershell
  # Windows PowerShell Start-Process：完全独立进程，不被会话/timeout 连坐杀（已验证 5 批长跑）
  powershell -NoProfile -Command "Start-Process -WindowStyle Hidden node -ArgumentList 'tools/compare_grids.js','0','13','2000','hex' -RedirectStandardOutput 'data\longrun_p0.txt'"
  # 轮询完成度：grep -l DONE data/longrun_p*.txt | wc -l
  ```
  ⚠️ 三种已踩坑的失败方式：内联 `nohup … &` 链被执行层截断；`timeout N bash x.sh` 会把
  后台子进程一并 TERM（连坐）；`setsid` 本环境不存在。
- **性能以 Node 基准为准**：浏览器自动化环境比 Node 慢 8-25×，间歇超时
- **npm 本地可能挂起**（联网检查撞网络限制）→ 仓库已带 `.npmrc` 禁网；本环境直接 `node tools/...` 最稳
- 实验产物统一写入 **`data/`**（stdout 重定向），日志类（`*.log`、中间批次）走 `.gitignore`

## 产物一览

| 文件 | 内容 |
|---|---|
| `data/compare_results.txt` | 57 种 × 方格/六角 × 300 步 全量原始数据（9 批） |
| `data/longrun_p*.txt` → `longrun_2000.txt` | 57 种 × 2000 步长跑复核（定稿幸存名单） |
| `exp_result.txt` | Orbium 方格对照（根目录，待随重构迁 data/） |
