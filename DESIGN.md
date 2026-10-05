# 六角 Lenia 重做设计文档

> 基于原版 Lenia 源码（`lenia-reference/`，github.com/Chakazul/Lenia）的分析，
> 重新设计六边形版本。本文档取代旧 PLAN.md 的方案。

---

## 一、原版 Lenia 源码分析

### 已下载参考文件

| 文件 | 大小 | 说明 |
|------|------|------|
| `lenia-reference/Lenia.html` | 156 KB | **原版 JS 实现**（单文件，FFT 卷积，153 个函数） |
| `lenia-reference/LeniaNDKC.py` | 165 KB | **Python 多核多通道版 v3.5**（最先进：多物种/多核） |
| `lenia-reference/LeniaNDK.py` | 136 KB | Python 多核版 v3.4 |
| `lenia-reference/README.md` | 3.7 KB | 官方说明 |

> 注：仓库 LICENSE 文件未找到（GitHub 页面标注 MIT，按 MIT 使用）。

### 1.1 核心算法（从源码提炼）

**标准 Lenia 更新规则**（`Lenia.html` → `NextGen()`，行 1416）：

```
U = K ⊛ A                     # 卷积（归一化：ΣK = 1）→ U ∈ [0,1]
d = Δ(U)                      # 增长函数，范围 [-1, +1]
A_new = clip(A + d·dt, 0, 1)   # dt = 1/T
```

**核函数**（`CoreFunc` 行 658 / Python `kernel_core` 行 339）：

| 名称 | 公式 | 备注 |
|------|------|------|
| `bump4` | exp(α − α/(4ρ(1−ρ))), ρ=d/R∈(0,1) | 高斯凸包，原版默认 |
| `quad4` | (4ρ(1−ρ))^α | 多项式 |
| `stpz1/4` | 1 若 ρ∈[¼,¾] | SmoothLife 台阶 |
| `life` | 1/2 若 ρ<¼, 1 若 ρ∈[¼,¾] | Conway Life |
| **`ring`（论文）** | exp(−(d−R)²/2σK²) | Lenia 论文经典形式，峰值在半径 R |

支持**多层环**（`KernelFunc` 行 590）：把 [0,1] 分成 B 段，每段乘不同峰高 β₁..β_B。
MVP 先做单环，多环（bimodal 等）为 P2。

**增长/Δ 函数**（`DeltaFunc` 行 520 / Python `growth_func` 行 345）：

| 名称 | 公式 |
|------|------|
| `gaus`（默认） | G(n) = 2·exp(−(n−m)²/(2s²)) − 1 |
| `quad4` | max(0, 1−(n−m)²/(9s²))⁴·2 − 1 |
| `stpz` | \|n−m\| ≤ s ? +1 : −1 |
| `trap` | 梯形 |

**参数映射**（`Lenia.html` 行 837-845）：

| 变量 | 含义 | 默认 |
|------|------|------|
| `NS` (R) | 核半径（格距单位） | 13 |
| `TS` (T) | 时间分辨率，dt = 1/T | 10 |
| `delta_c` (m/μ) | 激活中心 | 0.14 |
| `delta_w` (s/σ) | 激活宽度 | 0.015 |
| `kernel_A` (α) | 核核心函数指数 | 4 |

### 1.2 多物种的正确结构（Python `calc_once` 行 431）

原版多通道**不是**随意的"交叉矩阵"，而是**规则列表**：

```python
# 每条规则 k：{src=c0, dst=c1, R, m, s, h(权重), 核函数, 增长函数}
for k in kernels:
    U_k   = conv(K_k, A[c0_k])            # 从源通道卷积
    G_k   = growth(U_k, m_k, s_k)
    D[c1] += dt · h_k · G_k                # 累加到目标通道
A_new[c] = clip(A[c] + D[c] / Σ h_k, 0, 1) # 归一化权重
```

- 每个通道 c 可以被**多条规则**写入，按权重 h 归一化
- 没有规则写入的通道保持不变
- 这就是捕食者-猎物等生态行为的正规表达方式

### 1.3 卷积实现对比

| | 原版 JS/Python | 旧六角版（已废弃） |
|--|----------------|---------------------|
| 网格 | 正方形，FFT 加速 | 六角，邻居列表直接求和 |
| 拓扑 | 环面（FFT 天然环面） | 环面 ✓ |
| 性能 | FFT O(N log N) | O(N·K)，K=核 taps 数 |
| 问题 | — | 慢 + 邻居表 + 字符串色 + 每帧 innerHTML → 1~7 FPS |

---

## 二、六角版本设计

### 2.1 关键洞察：六角网格上的卷积

六角轴向坐标 (q, r) 放进 W×H 矩形数组、双向取模环绕 —— **卷积结构与正方形完全相同**，
六角几何只体现在**核权重的计算**上：

```
offset (dq, dr) 的笛卡尔距离：
  dx = dq + dr/2
  dy = (√3/2)·dr
  d  = √(dx² + dy²)          # 单位 = 相邻格距
```

6 个邻居 (±1,0), (0,±1), (±1,∓1) 距离全部 = 1 ✓，环形核在此度量下各向同性采样。

### 2.2 卷积性能方案

**MVP 采用直接卷积 + 每轴环绕表**（不用 FFT，避免复杂度和 bug 面）：

```js
// 构核时预计算：
taps = [{dqi, dri, w}, ...]        // dqi = dq+R 等，只保留 d ≤ R+3σK
qTab = Int32Array(W * (2R+1))      // qTab[q*(2R+1)+dqi] → 环绕后 q
rTab = Int32Array(H * (2R+1))      // 同理
Σw = 1                             // 归一化（与原版一致）

// 每步：
for 每格 i (q, r):
  U = Σ_taps w · A[qTab[...] + rTab[...]*W]     // 纯 gather，无除法/取模
```

复杂度估算（128×128 = 16384 格）：

| R | taps K | 总乘加 | 预计耗时 |
|---|--------|--------|----------|
| 6 | ~150 | 2.5 M | ~2-4 ms ✓ |
| 10 | ~380 | 6.2 M | ~6-12 ms |
| 13 | ~640 | 10.5 M | ~12-25 ms（30fps 可接受） |

typed array + JIT 下足够快；若后续不够，可无缝换 FFT（环面结构兼容）。

**数据结构**：一维 `Float32Array(W*H)` 每通道，`idx = q + r*W`。
双缓冲 `A` / `A_next`，杜绝旧版 2D 嵌套数组的开销。

### 2.3 渲染方案（旧版 1~7 FPS 的根因）

旧版问题：14400 个六角逐个 `beginPath+fill`（14400 次 fillStyle 字符串状态切换）+ 每帧 innerHTML。

新方案：**调色板分桶批绘**：

```
1. 每格颜色量化到 64 档调色板 → Uint8Array paletteIdx[N]
2. 每档一次 fill：ctx.fillStyle = color; ctx.beginPath();
   for 该档所有格: path 加六角顶点; ctx.fill()
3. 六角顶点坐标预计算（Flat Float32Array，一次生成）
→ 每帧仅 64 次 fill 状态切换 + 16384×7 个 moveTo/lineTo
```

预计单帧 2-5 ms → 稳定 60 FPS。

### 2.4 几何布局（沿用验证过的公式）

```
pointy-top 六角：
  中心: x = s·(q + r/2),  y = s·(√3/2)·r
  顶点角: 60°·i + 30° (i=0..5)
  画笔半径: 0.55s（格间微缝）
  环面边界: 绘制时不跨缝裁剪（MVP 接受边缘截断，或居中平移）
```

### 2.5 多物种（对齐原版正规结构）

```js
rules = [
  {src:0, dst:0, R, m, s, h, kn:'ring', gn:'gaus'},   // 自我
  {src:0, dst:1, R, m, s, h, ...},                     // 猎物→捕食者
  {src:1, dst:0, R, m, s, h, ...},                     // 捕食者→猎物
]
// step:
D[dst] += dt · h · G(conv(K, A[src]))
A'[c] = clip(A[c] + D[c] / Σh_c, 0, 1)
```

- 1 通道 = 经典单物种 Lenia（规则列表退化为一条）
- 2-3 通道 = 生态系统，规则表可在 UI 中增删（P1 先做预设组合）

### 2.6 参数（对齐原版默认）

| 参数 | 默认 | 范围 | 说明 |
|------|------|------|------|
| 网格 W×H | 128 | 64/96/128/192/256 | 环面 |
| R | 10 | 2–16 | 核半径（格距） |
| σK | R/4 | 0.5–6 | 核宽度 |
| m (μ) | 0.15 | 0–1 | 激活中心 |
| s (σ) | 0.02 | 0.002–0.3 | 激活宽度 |
| T | 10 | 1–40 | dt = 1/T |
| 核函数 | ring / bump4 / quad4 / stpz | | |
| 增长函数 | gaus / quad4 / stpz / trap | | |

### 2.7 交互（MVP 范围）

- ▶/⏸/单步、速度（步/秒）
- 笔刷绘制/擦除（左键/Alt）、笔刷半径
- 滚轮缩放、拖拽平移
- 随机初始化 + 初始化密度
- **📷 截图导出**（3× 高清 + 信息栏，旧版已验证，保留）
- FPS / 代数 / 密度统计（每秒更新一次，不做每帧 innerHTML）
- 预设：随机 / 圆斑 / 环 / 条纹 + 多物种预设（捕食者-猎物等）

### 2.8 实施顺序

```
M1  单物种核心：核构建 + 直接卷积 + gaus 增长 + 双缓冲
    验收：随机初始化后出现 Lenia 动态（斑点/游走/振荡）
M2  渲染 + 交互：调色板批绘、缩放平移、笔刷、截图
M3  UI 完整：参数滑块、函数选择、预设、统计
M4  多物种：规则列表 + 2/3 通道 + 生态预设
M5  文档：README/PLAN 重写
```

### 2.9 与旧版的差异总结

| | 旧版（废弃） | 新版 |
|--|-------------|------|
| 数据 | 2D 嵌套数组 ×3 | Float32Array 扁平数组 |
| 卷积 | 每格遍历邻居对象数组 | 预计算 taps + 环绕表，纯 gather |
| 渲染 | 每格一次 fill（14400 次状态切换） | 64 档调色板分桶批绘 |
| 统计 | 每帧 innerHTML | 每秒一次 |
| 多物种 | 自造 cross 矩阵 | 原版规则列表结构（src/dst/h） |
| 函数 | 只有 gaus + 单核 | ring/bump4/quad4/stpz × gaus/quad4/stpz/trap |
| 帧率 | 1–7 FPS | 目标 60 FPS |

---

## 三、参考来源

- 原版仓库：https://github.com/Chakazul/Lenia （MIT）
- 论文：Chan, B. Y. — "Lenia - Biology of Artificial Life" (2019),
  Complex Systems 28(3)；"Lenia and Expanded Universe" (ALIFE 2020)
- 网页版：https://chakazul.github.io/Lenia/JavaScript/Lenia.html
