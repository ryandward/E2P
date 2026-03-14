# Semantic Layer — Revised Plan

> Original plan proposed `inferModel()` and `slice()` in JavaScript.
> Superseded after discovering GenomeHub already provides DataProfile,
> FilterSpec, and Arrow IPC streaming via DuckDB over Parquet.

## Architecture

```
Parquet (server)
  → DuckDB (GenomeHub)
  → DataProfile (schema, columnStats, cardinality, charLengths, histograms, correlations)
  → Arrow IPC (streaming, zero-copy)
  → E2P adapter (Arrow → DataFrame)
  → PlotSpec (declarative)
  → compile() (pure)
  → PlotFrame (renders)
```

## Phase 1: Wire GenomeHub to E2P

Connect E2P to GenomeHub's query endpoint. Replace hardcoded chapter
data with live queries.

- Arrow IPC → DataFrame adapter (Arrow vectors → Float32Array/string[])
- DataProfile → PlotFrame CSS custom properties:
  - `charLengths.max` → `--plot-label-floor`
  - `columnStats.min/max` → shared domain via `niceDomain()`
- FilterSpec for tab filtering (replaces PivotExplorer's manual JS loop)
- Hardcoded chapters become test fixtures

## Phase 2: PlotFrame widget model

Canopy changes from `ReactNode` to `ControlSpec[]`. Controls are data
objects, not JSX with closures. No state leakage.

- Control types: `RangeControl`, `SelectControl`, `MetricControl`
  (pattern from NurtureBioDemo's HeatmapControl)
- Default controls generated from DataProfile:
  - Dimension with cardinality < 5 → buttons
  - Dimension with cardinality 5–50 → dropdown
  - Dimension with cardinality > 50 → searchable async field
  - Measure → range slider (extent from columnStats)
- Cardinality-based role assignment (lowest → tabs, highest → y-axis)
  lives in E2P — rendering judgment, not a data query

## Phase 3: AI-augmented controls

AI reads DataProfile + domain context, adds scientifically meaningful
controls that heuristics can't generate.

- Computed expressions (log₂FC threshold, significance filters)
- Domain-specific range labels and defaults
- Additive only — AI cannot remove or break default controls
- Auditable — each AI-added control shows its reasoning

## What Vortex changes (when integrated)

Vortex replaces the columnStats.min/max portion of DataProfile and adds:
- `is_sorted` / `is_strict_sorted` — sort order signals
- `run_count` — repetition signal (strong categorical indicator)
- `is_constant` — degenerate dimension detection
- Lazy metadata loading — efficient for wide tables

DataProfile retains ownership of: cardinality, charLengths, histograms,
correlations. These are analytical statistics no file format provides.

## Not in scope

- Multi-measure views (one measure per view for now)
- Aggregation functions (data is pre-aggregated in current datasets)
- PlotFrame as a separate package (extract when API stabilizes)
