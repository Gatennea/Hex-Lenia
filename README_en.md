# Hexagonal Lenia Cellular Automaton

A **hexagonal-grid**, continuous-state cellular automaton based on
[Lenia](https://github.com/Chakazul/Lenia) (MIT license, original author Bert Chan).
Single HTML file, zero dependencies, ready to use out of the box.

## Running

Open `index.html` directly in a browser, or:

```bash
python3 -m http.server 8080
# visit http://localhost:8080/index.html
```

## Core Formulas (aligned with the original paper and source code)

```
K(x) = Kc(|x|/R), support |x| < R, normalized ΣK = 1     ← ring kernel sampled at hexagonal distances
Kc(r) = exp(α − α/(4r(1−r))), α=4                        ← exponential convex-hull kernel core (paper §2.1)
G(u) = 2·exp(−(u−μ)²/(2σ²)) − 1                          ← Gaussian growth, ∈[−1,+1]
A' = clip(A + dt·G(K⊛A), 0, 1), dt = 1/T                 ← state update
```

**Hexagonal geometry**: axial coordinates (q, r) are stored in a rectangular array with
bidirectional toroidal wrapping — the convolution structure is identical to a square
grid; the hexagonality lives in the distance metric used for the kernel weights:

```
dx = dq + dr/2, dy = (√3/2)·dr, d = √(dx² + dy²)   ← unit = adjacent cell spacing
```

**Convolution implementation**: an **FFT scheme** isomorphic to the original (iterative
radix-2, two-pass row/column 2D transform), with a frequency-domain kernel cache;
performance is independent of kernel radius R. The page has a built-in `selfTest()`
that compares FFT convolution against direct convolution, with error ~1e-16
(machine precision).

## Multi-species (rule-list structure of the original LeniaNDKC)

Each rule `{src, dst, m, s, h, g}`: convolve from the `src` channel → growth function →
accumulate into the `dst` channel weighted by `h`, normalized by `Σh`:

```
D[dst] += h · G(conv(K, A[src]))
A'[c] = clip(A[c] + dt · D[c] / Σh_c, 0, 1)
```

| Preset | Channels | Notes |
|--------|----------|-------|
| Single-species Lenia | 1 | Classic Lenia (rule list degenerates to a single rule) |
| Predator–prey | 2 | Two-way coupling; parameters tuned via an 800-step sweep for coexistence |
| Three-species competition | 3 | Self-sustaining + mutual suppression (6 suppression rules) |

> Tuning notes (hard-won lessons): predators must be **sparsely seeded** (`initMul`),
> otherwise their high initial density keeps the suppression rule at −1 and the prey
> cannot establish a population; suppression rules should be **wide and weak**
> (σ=0.15, h=0.35) — a narrow σ makes prey stripes erode at the edges and collapse.

## Features

- **Kernel functions**: exponential convex-hull / polynomial / step (the three kernel cores from the paper)
- **Growth functions**: Gaussian / polynomial / step / trapezoid (applied to the current rule)
- **Parameters**: real-time sliders for R, μ, σ, T, α; speed, density, brush; grids 64²/128²/256²
- **Interaction**: left-click draw · Alt erase · right/middle-drag pan · wheel zoom · space pause
- **Rule editing**: in multi-species mode, click a rule chip — sliders and the growth function apply to that rule
- **Paint species**: in multi-species mode, "Paint A/B" switches the brush channel
- **Patterns**: disk / ring / stripes + random initialization
- **📷 Screenshot**: 3× high-resolution PNG export (including the info bar)
- **💾 Export / 📂 Import**: full-scene JSON archive (parameters + rules + field, 128² two-species ≈ 43KB), fully restorable and shareable
- **🪼 Jellyfish · Flying creatures**: one-click loading of player-discovered hexagonal gliders (auto-switches to classic parameters and centers them);
  verified to survive 2000+ steps at 0.325 cells/step with shape preserved
- **Parameter presets**: classic worm / high activity / wide band / low-density spots (stable-band navigation from measured parameter sweeps)
- **Statistics**: generation / FPS / step time / average activity / species & rule count / zoom (refreshed every second)

## Performance

| Metric | Value (128² grid) |
|--------|-------------------|
| Single 2D FFT transform | ~2.3 ms (Node V8) |
| step() per step | ~6 ms (single species; see note below about the browser test environment) |
| Rendering | palette-bucketed batch drawing, ≤64/512 fills per frame |

> Note: the Tabbit browser environment used for this project's automated tests shows
> abnormal performance (8–25× slower than Node on identical code, with intermittent
> screenshot/evaluation timeouts), so measured step times should follow the Node
> benchmark. A normal desktop browser runs the same V8 as Node and is expected to
> reach ~6 ms/step — 15–60 steps/s without difficulty.

## Directory

```
hexlifegame/
├── index.html            # thin shell: DOM + script load order (~200 lines)
├── css/style.css         # all styles (incl. .light theme)
├── js/                   # one-way deps: ui → render → core
│   ├── constants.js      # centralized state & magic-number constants
│   ├── core.js           # pure engine: FFT/kernel/step/presets/rules (zero DOM at load)
│   ├── render.js         # texture / palette / drawing / plots
│   └── ui.js             # controls / events / stamps / save-load / gallery / boot
├── data/
│   ├── lifecreatures.js  # original creature library (57 survivors)
│   ├── longrun_2000.txt  # 2000-step survival verdict 35/57
│   ├── compare_results.txt # 57 species × dual grids raw output
│   └── exp_result.txt    # Orbium square-grid control data
├── docs/                 # three-way: todo/ records/ guides/
├── tools/                # 18 scripts (see tools/README.md): lint, test_node, test_unit, src…
├── .github/workflows/ci.yml  # CI: lint + regression + unit tests
├── package.json  .npmrc  .gitignore  LICENSE
├── README_en.md          # this document (README.md = Chinese)
└── lenia-reference/      # original reference source (MIT; local only, not committed)
```

## Verification

- `node tools/test_node.js` — FFT vs direct convolution maxErr ≈ 7.8e-16; boot / 50-step / render all pass
- Three-preset survival regression: `solo 0.211 ✓ | predator 0.215/0.341 ✓ | compete three-species ✓`
- Render bucketing logic: `bucketCnt=512, no out-of-range keys, bucket total = 16384 ✓`
- Browser screenshots: single-species Lenia worm/sheet structures emerge correctly; UI/statistics normal

## References

- Original repo: https://github.com/Chakazul/Lenia (MIT)
- Paper: Chan, "Lenia - Biology of Artificial Life", Complex Systems 28(3), 2019 (arXiv:1812.05433)
- Extended work: Chan, "Lenia and Expanded Universe", ALIFE 2020 (arXiv:2005.03742)
- Web version: https://chakazul.github.io/Lenia/JavaScript/Lenia.html
