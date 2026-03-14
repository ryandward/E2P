# Grammar of Graphics — Defect Tracker

Discovered 2026-03-13 during the BarPlot/PivotExplorer build-out.

---

## 1. No declarative width resolution — RESOLVED

`DimensionSpec` supports `{ step: number }` for band-scale dimensions and
explicit pixels for continuous axes. The compiler resolves step-based
dimensions from domain cardinality at compile time.

---

## 2. Ad-hoc domain computation outside the grammar — RESOLVED

`ScaleSpec.domain` accepts `"nice"` (Heckbert-extended boundaries) or
`"data"` (tight to extent) alongside explicit `[min, max]`. The compiler
owns domain padding. `niceDomain()` is exported for cross-tab shared
domain coordination.

---

## 3. No shared axis constraint across facets/tabs — RESOLVED BY DESIGN

Tabs mean comparable subsets — they always share scales. PivotExplorer
computes a shared domain via `niceDomain()` across the full dataset and
injects it into per-tab specs. This is template-local coordination, not
a missing grammar primitive. Expression's two plots (heatmap, correlation)
are independent views, not facets — they don't share scales and don't
use tabs.

---

## 4. Format functions are not part of the spec — RESOLVED

`ScaleSpec.format` accepts an optional `(value: number) => string`
formatter. The compiler's `formatTickLabel` (k/M abbreviation) is the
default. Templates can declare domain-specific formatters like
`(v) => \`${v} bp\`` for genomics or `(v) => \`$${v}\`` for finance.
