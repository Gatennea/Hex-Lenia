// ── 本文件由 tools/split_p2.js 自 index.html 一次性拆出（P2-⑤）──
// ════════════════════════════════════════════════════════════════
//  六角 Lenia — 基于原版 Lenia (github.com/Chakazul/Lenia, MIT) 移植
//  公式（论文 1812.05433 §2.1 与原版源码一致）：
//    K(x) = Kc(|x|/R),  支撑 |x| < R,  归一化 ΣK = 1
//    Kc(r) = exp(α − α/(4r(1−r)))            [指数凸包, α=4]
//    G(u)  = 2·exp(−(u−μ)²/(2σ²)) − 1        [高斯增长, ∈[−1,1]]
//    A'    = clip(A + dt·G(K⊛A), 0, 1),  dt = 1/T
//  多通道（原版 LeniaNDKC 规则列表结构）：
//    D[dst] += h·G(conv(K, A[src]));  A' = clip(A + dt·D/Σh, 0, 1)
// ════════════════════════════════════════════════════════════════

const SQ3 = Math.sqrt(3);
const LETTERS = ["A", "B", "C"];
const CHANNEL_COLORS = ["#37e6d0", "#ff5fa2", "#ffd23e"];

// ---------- 全局状态 ----------
let W = 128, H = 128, N = W * H;
let CH = 1;                    // 物种/通道数
let fields = [], nexts = [];   // Float64Array(N) × CH（双缓冲）
let D = [];                    // 每通道增量累加器
let Dn = [];                   // 每通道 Σh
let chFft = [];                // 每通道频域缓存 {re, im}
let rules = [];                // [{src,dst,m,s,h,g}]
let curRule = 0;               // 当前编辑的规则
let srcChannels = [0];         // 预计算：被作为源的通道（避免每步 new Set）
let initMul = null;            // 预设的每通道初始密度倍率
let paintCh = 0;               // 绘制通道
let gen = 0, running = true;
let coreType = "exp";          // 核核心函数（全局）
let alpha = 4;                 // 核指数
let R = 10;                    // 核半径（格距）
let T = 10;                    // 时间分辨率 dt = 1/T
let speed = 15;                // 步/秒
let dens = 0.5;                // 随机初始化密度
let brushR = 2;                // 笔刷半径
let stepMs = 0;
let viewMode = "smooth";       // 显示：smooth=平滑插值（原版风格）| pixel=离散六角格
let needRender = true;
let texImg = null, texScale = 1, texDirty = true;

// ── 集中常量（问题#7：魔法数字带注释入册）──
const CANVAS_W = 940, CANVAS_H = 640;   // 画布逻辑尺寸（CSS 像素）
const HEX_RAD = 0.54;                   // 六角顶点微调系数（视觉）
const PAL_N = 64;                       // 像素模式调色板分桶数
const KERNEL_BOUND_RATIO = 1.6;         // 核支撑域系数：采样到 ⌈k·R⌉+1
const VIEW_FIT_MARGIN = 0.94;           // 视口适配留边（1=紧贴）
const TEX_GPU_MARGIN = 1.45;            // 纹理倍率安全线（GPU 双线性放大上限）

// ── 多环核（5f）：第二环带参数，ringB=0 时与单环完全等价 ──
let ringB = 0;                          // 第二环带权重 β（0=关，0~0.9）
let ringC = 0.62;                       // 环带中心位置（相对核半径 R）
const RING_W = 0.18;                    // 环带半宽（相对 R，固定）
