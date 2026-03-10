/**
 * Data visualization color palettes.
 *
 * Interpolation functions and categorical color maps
 * for canvas-rendered scientific data.
 */


/** Linear interpolation between two HSL colors. */
function lerpHSL(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): string {
  const h = a[0] + (b[0] - a[0]) * t;
  const s = a[1] + (b[1] - a[1]) * t;
  const l = a[2] + (b[2] - a[2]) * t;
  return `hsl(${h}, ${s}%, ${l}%)`;
}


// ── Sequential: z-score heatmap ──

const SEQ_LOW: [number, number, number] = [220, 20, 95];
const SEQ_MID: [number, number, number] = [228, 47, 55];
const SEQ_HIGH: [number, number, number] = [235, 75, 30];

/** Sequential ramp: t ∈ [0, 1] → pale steel → saturated blue → deep navy. */
export function sequentialColor(t: number): string {
  if (t <= 0.5) return lerpHSL(SEQ_LOW, SEQ_MID, t * 2);
  return lerpHSL(SEQ_MID, SEQ_HIGH, (t - 0.5) * 2);
}


// ── Diverging: correlation matrix ──

const DIV_NEG: [number, number, number] = [230, 100, 50];
const DIV_ZERO: [number, number, number] = [0, 0, 100];
const DIV_POS: [number, number, number] = [0, 100, 50];

/** Diverging ramp: t ∈ [0, 1] → blue → white → red. */
export function divergingColor(t: number): string {
  if (t <= 0.5) return lerpHSL(DIV_NEG, DIV_ZERO, t * 2);
  return lerpHSL(DIV_ZERO, DIV_POS, (t - 0.5) * 2);
}


// ── ChromHMM chromatin states (discrete) ──

const CHROMHMM: readonly string[] = [
  "hsl(0, 80%, 50%)",      /*  1 — Active TSS */
  "hsl(15, 75%, 55%)",     /*  2 — Flanking TSS */
  "hsl(45, 85%, 50%)",     /*  3 — Strong Enhancer */
  "hsl(50, 60%, 65%)",     /*  4 — Weak Enhancer */
  "hsl(80, 55%, 50%)",     /*  5 — Enhancer/Gene */
  "hsl(140, 65%, 40%)",    /*  6 — Txn Elongation */
  "hsl(140, 35%, 60%)",    /*  7 — Weak Txn */
  "hsl(195, 70%, 50%)",    /*  8 — Insulator */
  "hsl(270, 35%, 45%)",    /*  9 — Heterochromatin */
  "hsl(330, 55%, 55%)",    /* 10 — Bivalent TSS */
  "hsl(340, 40%, 65%)",    /* 11 — Bivalent Enhancer */
  "hsl(260, 50%, 40%)",    /* 12 — Polycomb Repressed */
  "hsl(40, 8%, 88%)",      /* 13 — Quiescent */
  "hsl(200, 25%, 50%)",    /* 14 — ZNF/Repeats */
  "hsl(40, 10%, 82%)",     /* 15 — Low Signal */
];

/** ChromHMM state color: state ∈ [1, 15]. */
export function chromHMMColor(state: number): string {
  return CHROMHMM[state - 1] ?? CHROMHMM[12]; // fallback to Quiescent
}
