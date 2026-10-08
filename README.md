# 六角 Lenia 元胞自动机

基于 [Lenia](https://github.com/Chakazul/Lenia)（MIT 协议，原作者 Bert Chan）的
**六边形网格**连续状态元胞自动机，单 HTML 文件、零依赖、开箱即用。

## 运行

浏览器直接打开 `index.html`，或：

```bash
python3 -m http.server 8080
# 访问 http://localhost:8080/index.html
```

## 核心公式（对齐原版论文与源码）

```
K(x) = Kc(|x|/R)，支撑 |x| < R，归一化 ΣK = 1     ← 六角距离采样的环形核
Kc(r) = exp(α − α/(4r(1−r)))，α=4                 ← 指数凸包核核心（论文 §2.1）
G(u) = 2·exp(−(u−μ)²/(2σ²)) − 1                   ← 高斯增长，∈[−1,+1]
A' = clip(A + dt·G(K⊛A), 0, 1)，dt = 1/T           ← 状态更新
```

**六角几何**：轴向坐标 (q, r) 放入矩形数组、双向环面取模 —— 卷积结构与正方形
网格完全相同，六角性体现在核权重的距离度量上：

```
dx = dq + dr/2，dy = (√3/2)·dr，d = √(dx² + dy²)   ← 单位 = 相邻格距
```

**卷积实现**：与原版同构的 **FFT 方案**（迭代 radix-2，行/列两遍 2D 变换），
频域核缓存，性能与核半径 R 无关。页面内置 `selfTest()` 对比 FFT 卷积与
直接卷积，误差 ~1e-16（机器精度）。

## 多物种（原版 LeniaNDKC 规则列表结构）

每条规则 `{src, dst, m, s, h, g}`：从 `src` 通道卷积 → 增长函数 → 按权重
`h` 累加到 `dst` 通道，按 `Σh` 归一化：

```
D[dst] += h · G(conv(K, A[src]))
A'[c] = clip(A[c] + dt · D[c] / Σh_c, 0, 1)
```

| 预设 | 通道 | 说明 |
|------|------|------|
| 单物种 Lenia | 1 | 经典 Lenia（规则退化为一条） |
| 捕食者-猎物 | 2 | 双向耦合，参数经 800 步扫描调优共存 |
| 三物种竞争 | 3 | 自持 + 相互压制（6 条压制规则） |

> 调优要点（实测教训）：捕食者必须**稀疏播种**（`initMul`），否则初始高密度
> 使压制规则恒为 −1，猎物无法建立种群；压制规则要**宽而弱**（σ=0.15, h=0.35），
> 窄 σ 会让猎物斑纹边侵蚀边崩塌。

## 功能

- **核函数**：指数凸包 / 多项式 / 台阶（论文三种核核心）
- **增长函数**：高斯 / 多项式 / 台阶 / 梯形（作用于当前规则）
- **参数**：R、μ、σ、T、α 实时滑块；速度、密度、笔刷；网格 64²/128²/256²
- **交互**：左键绘制 · Alt 擦除 · 右键/中键拖拽平移 · 滚轮缩放 · 空格暂停
- **规则编辑**：多物种时点击规则 chip，滑块与增长函数作用于该规则
- **绘制物种**：多物种时「绘制 A/B」切换笔刷通道
- **图案**：圆盘 / 圆环 / 条纹 + 随机初始化
- **📷 截图**：3× 高清 PNG 导出（含信息栏）
- **💾 导出 / 📂 导入**：整场景 JSON 存档（参数+规则+场，128² 双物种≈43KB），完全还原可分享
- **🪼 水母·飞行生物**：玩家发现的六角滑行生物一键加载（自动切经典参数并居中）；
  实测 2000+ 步不死、0.325 格/步、形态保持
- **参数预设**：经典蠕虫 / 高活性 / 宽波带 / 低密度斑（扫参实测的稳定带导航）
- **统计**：代数 / FPS / 步进耗时 / 平均活性 / 物种·规则数 / 缩放（每秒刷新）

## 性能

| 指标 | 数值（128² 网格） |
|------|--------------------|
| FFT 单次 2D 变换 | ~2.3 ms（Node V8） |
| step() 单步 | ~6 ms（单物种；浏览器测试环境见下注） |
| 渲染 | 调色板分桶批绘，每帧 ≤64/512 次 fill |

> 注：本项目自动化测试用的 Tabbit 浏览器环境性能异常（同代码比 Node 慢 8-25 倍，
> 且截图/评估间歇性超时），实测步进耗时以 Node 基准为准；正常桌面浏览器
> 与 Node 同为 V8，预期接近 6ms/步，15-60 步/秒无压力。

## 目录

```
hexlifegame/
├── index.html            # 薄壳：DOM + 加载顺序（P2 拆分后 ~200 行）
├── css/
│   └── style.css         # 全部样式（含 .light 主题）
├── js/                   # 单向依赖：ui → render → core
│   ├── constants.js      # 集中状态与常量（含共享渲染状态）
│   ├── core.js           # 纯引擎：FFT/核/步进/预设/规则解析（加载期零 DOM）
│   ├── render.js         # 纹理/调色板/绘图/曲线图
│   └── ui.js             # 控件/事件/印章/存档/画廊/诊断/启动
├── data/
│   ├── lifecreatures.js  # 原版生物库（57 种）
│   ├── longrun_2000.txt  # 2000 步长跑定稿 35/57（含统计头）
│   └── longrun_p*.txt    # 长跑分批原始输出
├── docs/                 # 文档三分：todo/ 待办、records/ 记录、guides/ 说明
├── tools/                # 18 个脚本（详见 tools/README.md）
│   ├── lint.js           # 静态四查（语法/禁**/断链/死代码）
│   ├── test_node.js      # 回归：FFT 自检 + 启动 + 50 步 + 渲染
│   ├── test_unit.js      # 单测 16 项（core 零 DOM 独立加载）
│   ├── src.js            # 统一源码入口（兼容旧工具的 script 提取）
│   ├── compare_grids.js  # 方格/六角双核对照（支持 [步数][hex]）
│   └── …                 # 其余实验脚本
├── .github/workflows/ci.yml  # CI：lint + 回归 + 单测
├── package.json  .npmrc  .gitignore  LICENSE  README.md  README_en.md
├── exp_result.txt / compare_results.txt   # 实验数据（P3 计划迁 data/）
└── lenia-reference/      # 原版参考源码（MIT；本地保留，不入库）
```

## 验证记录

- `node tools/test_node.js` — FFT vs 直接卷积 maxErr ≈ 7.8e-16，启动/50步/渲染通过
- `node tools/test_unit.js` — 16 项单测全过（增长/核/ΣK=1/FFT往返/解析/种子/core-only 存活）
- `npm test` = lint + 回归 + 单测 三连（CI 同套）
- 三预设存活回归：`solo 0.211 ✓ | predator 0.215/0.341 ✓ | compete 三物种 ✓`
- 渲染分桶逻辑：`bucketCnt=512、无越界键、桶总和=16384 ✓`
- 浏览器截图：单物种 Lenia 蠕虫/片状结构正常涌现，UI/统计正常

## 参考

- 原版仓库：https://github.com/Chakazul/Lenia （MIT）
- 论文：Chan, "Lenia - Biology of Artificial Life", Complex Systems 28(3), 2019（arXiv:1812.05433）
- 扩展：Chan, "Lenia and Expanded Universe", ALIFE 2020（arXiv:2005.03742）
- 网页版：https://chakazul.github.io/Lenia/JavaScript/Lenia.html
