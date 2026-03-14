# E2P

Interactive exploration tool for complex biological datasets. Scientists drop in data and explore it — pivotable bar charts, heatmaps, correlation matrices — without writing visualization code.

Built on a custom grammar-of-graphics engine that compiles declarative specs into GPU-composited canvas output with spring-animated transitions.

## Grammar of Graphics Engine

`src/lib/plot/` — Zero dependencies. No D3, no Observable Plot, no Vega.

### Pipeline

```
PlotSpec → compile() → SceneGraph → usePlot() → rAF loop → canvas
```

**PlotSpec** declares what you want: data, aesthetic mappings, scales, layers, dimensions. Pure data, no rendering concerns.

**compile()** is a pure function. No React, no DOM, no Canvas. It resolves scales, infers domains, emits geometry into struct-of-arrays buffers (Float32Array / Uint8Array) with pre-packed RGBA colors. Called once per data change.

**SceneGraph** is frozen output: typed arrays, resolved scales, axis ticks. The animation loop never calls compile() again — it interpolates between scene graphs via spring physics.

### What it supports

| Capability | Status |
|---|---|
| Geoms: tile, bar | Implemented |
| Scales: linear, band, sequential, diverging, viridis, ordinal | Implemented |
| Declarative domains: `"nice"`, `"data"`, explicit `[min, max]` | Implemented |
| Declarative dimensions: `{ step: 34 }`, explicit pixels | Implemented |
| Custom tick formatters: `format: (v) => \`${v} bp\`` | Implemented |
| Domain extension: `niceDomain()` for Heckbert nice boundaries | Implemented |
| Spring-animated transitions between scene graphs | Implemented |
| Canvas hit testing with data-space coordinate inversion | Implemented |
| Stats: bin, density, correlation | Not yet |
| Geoms: point, line, area, segment | Not yet |
| Faceting | By design — tabs are facets, owned by templates |
| Shared scales across views | By design — `niceDomain()` + template coordination |

### Files

| File | Purpose |
|---|---|
| `types.ts` | PlotSpec, ScaleSpec, DimensionSpec, SceneGraph, buffer types |
| `compiler.ts` | PlotSpec → SceneGraph. Scale resolution, domain inference, geom emission |
| `scales.ts` | Scale factories: linear, band, color, ordinal. Pure math, no DOM |
| `springs.ts` | TweenBuffer interpolation, spring physics for animated transitions |
| `painters.ts` | Canvas 2D painters dispatched by geom kind |
| `hitTest.ts` | Point-in-rect hit testing with data-space coordinate inversion |

## PlotFrame

`src/components/plot/PlotFrame.tsx` — Unified layout wrapper. Handles any combination of band/continuous axes.

Renders DOM axis labels alongside a canvas. Sticky header with optional tabs (facet navigation) and x-axis context labels (rotated column names for band scales, rotated tick marks for continuous scales). Row labels pinned to the left.

### Emergent measurements

PlotFrame bridges CSS and data-driven layout through CSS custom properties measured from the DOM:

| Property | What it measures | Why |
|---|---|---|
| `--col-label-h` | Rotated column label height (trigonometry) | Sizes the column label container |
| `--col-label-overhang` | Last label's horizontal extent past the data column | Prevents clipping |
| `--tabs-h` | Tab bar height | Co-pins column labels below tabs |
| `--label-col-w` | Row label column width | Published for cross-frame alignment |

CSS renders labels with tokens (font, color, dark mode). JS measures what CSS produced. Measurements flow back as custom properties. CSS compositions consume them for layout. This is render-measure-update — the same cycle every browser layout engine does internally, made explicit because CSS Grid can't measure its own children and feed the result into track sizing.

## CUBE CSS

Six-layer cascade: `reset → tokens → compositions → blocks → utilities → exceptions`.

All visual properties reference intent aliases from `tokens.css`. No raw hex, pixel, or numeric literals in compositions, blocks, utilities, or exceptions. The GoG engine's canvas painting operates outside the cascade entirely — color ramps and scale math are pure computation, never CSS.

## Stack

Vite + React 19 + TypeScript + React Router v7. No component library. No charting library.
