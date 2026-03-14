# Grammar of Graphics — Serious Defects

Discovered 2026-03-13 during the BarPlot/PivotExplorer build-out.
These must be resolved before the engine can be called a true GoG.

---

## 1. No declarative width resolution

Width is a hardcoded pixel constant per template (`BAR_W = 480`, `cols * STEP`
in Data.tsx). Height is data-driven (row count × step), but width has no
equivalent pipeline. A true GoG resolves all dimensions from a declarative spec.

**The problem:** There is no principled place to derive width from available
space without violating layer separation. Putting a ResizeObserver in the page
leaks infrastructure into the domain layer. Putting it in the template couples
an aesthetic decision to a React lifecycle. Putting it in the layout wrapper
makes the spec impure (the wrapper mutates it).

**What a GoG needs:** A resolution step *before* the spec reaches `compile()`.
The spec should express intent (`width: { step: 40 }` for data-driven,
`width: "fill"` for container-aware) and a resolver turns that into pixels.
The resolver can live at the template layer and use measurement, but the spec
type must support the declarative form so the template isn't hardcoding magic
numbers.

---

## 2. Ad-hoc domain computation outside the grammar

PivotExplorer manually computes `globalMax * 1.05` and injects it as a scale
domain. This is the grammar's job. A GoG should support:

- `domain: "nice"` — auto-extend to nice round numbers
- `domain: "data"` — tight to data extent
- `domain: [0, explicit]` — manual override

The compiler already has `niceStep` (Heckbert). It should also own domain
padding/extension so templates never manually inflate a max.

---

## 3. No shared axis constraint across facets/tabs

When PivotExplorer switches tabs, each tab's bars must share the same x-axis
scale for visual comparability. Currently the template manually computes a
global max across all tabs and forces every per-tab spec to use it.

A GoG handles this with **shared scales** — you declare that a set of panels
share a scale, and the compiler resolves domains across the full dataset before
splitting into per-panel geometries. Without this, every template that shows
comparable subsets must re-implement the global-max pattern.

---

## 4. Format functions are not part of the spec

`formatTickLabel` in the compiler hardcodes `k`/`M` abbreviations. The spec
has no way to declare tick formatting. A genomics user needs `1,234,567 bp`,
a finance user needs `$1.2M`, an expression user needs `log₂FC`.

The spec should accept an optional `format` on scale or axis definitions,
with the compiler's current formatter as the default.

