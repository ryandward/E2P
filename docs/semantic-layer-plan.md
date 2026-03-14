# Semantic Layer — Implementation Plan

## Problem

Every template reimplements data filtering, pivoting, and aggregation.
PivotExplorer manually iterates rows, filters by tab, builds typed arrays,
constructs DataFrames. A second template would duplicate all of this.

## Goal

A scientist hands a DataFrame to a template. The template infers what the
data contains and lets the scientist explore it. Zero configuration for the
common case, optional overrides when the heuristic is wrong.

```tsx
// This is the entire API for the common case
<PivotExplorer data={data} />
```

## Architecture

```
DataFrame → inferModel() → DataModel → slice() → DataFrame → PlotSpec → compile() → canvas
              pure              ↑          pure
                            optional
                           overrides
```

### 1. DataModel — inferred from DataFrame

```ts
interface DataModel {
  data: DataFrame;
  dimensions: Record<string, DimensionDef>;
  measures: Record<string, MeasureDef>;
}

interface DimensionDef {
  column: string;
  cardinality: number;  // unique value count, used for default role assignment
}

interface MeasureDef {
  column: string;
  extent: [number, number];  // [min, max] pre-scanned, used for shared domains
}
```

`inferModel(data: DataFrame): DataModel` — pure function, O(n) single pass:
- `string[]` column → dimension (structural, not heuristic)
- `Float32Array` column → measure (structural, not heuristic)
- Cardinality computed per dimension (unique count)
- Extent computed per measure (min/max scan)

### 2. Default role assignment — statistical heuristics

Given dimensions and measures, assign default roles:
- **groupBy** (tabs): lowest cardinality dimension (fewer tabs)
- **showBy** (y-axis): highest cardinality dimension (more rows per view)
- **measure** (x-axis): first measure, or only measure if there's one
- **fill**: measure for tiles, showBy dimension for bars (categorical color)

These defaults are overridable by the scientist via UI controls (the
"Group by" dropdown already exists in PivotExplorer).

### 3. slice() — pure query resolver

```ts
interface SliceQuery {
  groupBy: string;        // dimension name → produces tabs
  showBy: string;         // dimension name → y-axis categories
  measure: string;        // measure name → x-axis values
  filter?: string;        // groupBy value to filter to (active tab)
  threshold?: number;     // minimum measure value (0-1 fraction of extent)
}

function slice(model: DataModel, query: SliceQuery): DataFrame
```

Pure function. Takes the full dataset, filters by the active tab and
threshold, returns a DataFrame with three columns:
- `name` (NAME_COL): showBy dimension values
- measure column: filtered values
- fill column: categorical color key

This replaces PivotExplorer's 20-line manual filtering loop.

### 4. Shared domain — derived from model

`model.measures[metric].extent` gives the global [min, max] across all
tabs. `niceDomain(extent)` produces the shared x-axis domain. No manual
global max computation needed.

### 5. PivotExplorer simplification

Before:
```ts
interface PivotExplorerProps {
  data: DataFrame;
  dimensions: [string, string];
  metric: string;
}
```

After:
```ts
interface PivotExplorerProps {
  data: DataFrame;
  overrides?: Partial<SliceQuery>;  // optional, for when heuristics are wrong
}
```

PivotExplorer calls `inferModel(data)`, assigns default roles, renders
the PlotFrame. The "Group by" dropdown lets the scientist swap roles
at runtime. The threshold slider queries the model's extent.

### 6. Expression page

Expression uses tile geom (both axes categorical, fill is numeric).
The model inference works the same way:
- Two string columns → two dimensions (x and y axes)
- One float column → one measure (fill)

The tile template doesn't need PivotExplorer's pivoting — it shows all
data at once. A simpler `TileExplorer` template (or PivotExplorer
detecting tile-appropriate data) handles this case.

## File plan

| File | Action |
|---|---|
| `src/lib/plot/model.ts` | New — `DataModel`, `inferModel()`, `slice()` |
| `src/lib/plot/model.test.ts` | New — tests for inference and slicing |
| `src/lib/plot/index.ts` | Export model types and functions |
| `src/components/templates/PivotExplorer.tsx` | Simplify — consume DataModel |
| `src/chapters/Histones.tsx` | Simplify — drop dimensions/metric props |

## Not in scope

- Aggregation (sum, mean, count) — current data is pre-aggregated
- Multi-measure support — one measure per view for now
- Expression page refactor — separate session
- PlotFrame widget model — separate design (canopy state ownership)

## Validation

- `inferModel` produces correct dimensions/measures for Histones data
- `slice` produces same DataFrame as PivotExplorer's current manual filter
- Histones page renders identically with `<PivotExplorer data={data} />`
- 45 existing tests still pass
- New tests for `inferModel` and `slice`
