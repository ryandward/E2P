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

**compile()** is a pure function. No React, no DOM, no Canvas. It resolves scales, infers domains, emits geometry into struct-of-arrays buffers (Float32Array / Uint8Array) with pre-packed RGBA colors. NaN values produce transparent geometry — the scientist sees a gap, not a lie. Called once per data commit (not per slider drag).

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
| NaN handling: transparent cells, safe scale propagation | Implemented |
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
| `compiler.ts` | PlotSpec → SceneGraph. Scale resolution, domain inference, geom emission, NaN handling |
| `scales.ts` | Scale factories: linear, band, color, ordinal. Pure math, NaN-safe |
| `springs.ts` | TweenBuffer interpolation, spring physics for animated transitions |
| `painters.ts` | Canvas 2D painters dispatched by geom kind |
| `hitTest.ts` | Point-in-rect hit testing with data-space coordinate inversion |

## PlotFrame

`src/components/plot/PlotFrame.tsx` — Unified layout wrapper. Batteries included.

Renders DOM axis labels alongside a canvas. Sticky header with optional tabs (facet navigation) and x-axis context labels (rotated column names for band scales, rotated tick marks for continuous scales). Row labels pinned to the left with ellipsis truncation and native title tooltips.

PlotFrame derives everything from the graph — no caller configuration for labels, dimensions, or scroll behavior.

### Control State Machine

Controls are declared as data (`ControlSpec[]`), not JSX. PlotFrame owns the state via a reducer that separates visual state from committed state:

```
idle ──DRAG_START──► dragging ──DRAG_END──► idle (commit + recompile)
idle ──SELECT──► idle (immediate commit)
```

During drag, only the gauge display updates — no recompile. The compile fires once on drop. This prevents the 60x/sec recompile that would occur with naive `onChange` handling.

Future phases are documented in `controlState.ts` for GenomeHub async query integration:
- `dropped → QUERY_START → querying → SETTLE → idle` (async queries)
- `dropped → VOID_SKIP → idle` (histogram-based empty delta detection)

### Error Boundary

`PlotErrorBoundary` wraps PlotFrame internally. If `compile()` throws on bad data, the scientist sees "This dataset could not be visualized" instead of a white page. Every PlotFrame gets this automatically.

### CSS Custom Properties

PlotFrame bridges CSS and data-driven layout through measured CSS custom properties:

| Property | Source | Purpose |
|---|---|---|
| `--plot-data-w` | graph | Data column pixel width |
| `--plot-col-h` | measurement | Rotated column label height |
| `--plot-col-overhang` | measurement | Last label's horizontal extent |
| `--plot-row-h` | graph | Row label height (band scale step) |
| `--plot-label-w` | measurement | Label column track width |
| `--plot-label-floor` | template cascade | Stable label column minimum (via `ch` units) |
| `--plot-tabs-h` | measurement | Tab bar height for co-pinning |

CSS renders labels with tokens (font, color, dark mode). JS measures what CSS produced. Measurements flow back as custom properties. CSS compositions consume them for layout.

### Scroll Snap

PlotFrame snaps to top when `graph.height` changes (row count changed). No caller configuration. Catches all edge cases: tab switch that changes rows, threshold that removes rows, groupBy that restructures the view.

### Label Truncation

Row and column labels truncate at `--label-max-w` (18ch token) with CSS `text-overflow: ellipsis`. Native `title` attribute provides the full text on hover. A 200-character gene name or misplaced CIGAR string cannot break the layout contract.

## CUBE CSS

Six-layer cascade: `reset → tokens → compositions → blocks → utilities → exceptions`.

All visual properties reference intent aliases from `tokens.css`. No raw hex, pixel, or numeric literals in compositions, blocks, utilities, or exceptions. The GoG engine's canvas painting operates outside the cascade entirely — color ramps and scale math are pure computation, never CSS.

### Paradigmatic Incompatibility

CUBE CSS assumes every visual decision maps to a named intent. A GoG engine generates visual decisions from data — a heatmap cell's color is a continuous function of a numeric value, not a token. The label column width is whatever "Mammary Gland" measures at the current font size, not `--space-sidebar`. These are values that emerge from data at runtime. They have no named intent because their meaning is "whatever the data requires."

The CSS custom properties (`--plot-*`) are the bridge: CSS owns styling (font, color, dark mode), JS measures the result, measurements flow back as custom properties, CSS compositions consume them. Three categories coexist: design tokens, data bindings, and emergent measurements.

## Integration

E2P is the frontend visualization engine. [GenomeHub](../GenomeHub) is the backend — DuckDB over Parquet, streaming Arrow IPC, `DataProfile` with column statistics, cardinality, string lengths, histograms, and correlations.

The semantic layer lives in GenomeHub, not E2P. Column roles come from Parquet schema metadata, not runtime inference. Queries are `FilterSpec` / `SortSpec` resolved by DuckDB, not JavaScript loops. See `docs/semantic-layer-plan.md` for the integration roadmap.

## Testing

59 tests via Vitest covering the pure engine (compiler, scales, hit testing, NaN handling) and the control state machine (drag/commit lifecycle). 245ms total runtime.

## Stack

Vite + React 19 + TypeScript + React Router v7 + Vitest. No component library. No charting library.
