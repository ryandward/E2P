import { useCallback, useMemo, useState } from "react";
import { FadeTransition } from "stablekit.ts";
import { mulberry32 } from "../lib/canvas";
import { PlotFrame, type HoverEvent, type ControlSpec, type ControlValues } from "../components/plot/PlotFrame";
import { initControlValues } from "../components/plot/controls";
import { ContinuousLegend } from "../components/plot/ContinuousLegend";
import { compile } from "../lib/plot/compiler";
import type { PlotSpec } from "../lib/plot/types";
import type { ColorRamp } from "../lib/plot/scales";

// ── Data ──

const TISSUES = [
  "Brain", "Heart", "Liver", "Kidney", "Lung",
  "Spleen", "Thymus", "Colon", "Skin", "Cortex",
];

const GENES = [
  "87M42S16M1I23M2D45M3I12M1D67M4I8M2D34M1I56M3D21M", "BRCA1", "MYC", "EGFR", "KRAS",
  "PTEN", "RB1", "APC", "VHL", "BRAF",
  "PIK3CA", "CDKN2A", "FOXP3", "STAT3", "JAK2",
  "NOTCH1", "WNT5A", "SMAD4", "CDH1", "MLH1",
  "MSH2", "ATM", "CHEK2", "PALB2", "RAD51",
  "FGFR2", "ALK", "RET", "MET", "NF1",
  "TSC1", "IDH1",
];

const CELL = 32;
const GAP = 2;
const STEP = CELL + GAP;

function generateExpression(rows: number, cols: number, seed: number): number[][] {
  const rng = mulberry32(seed);
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => rng()),
  );
}

function generateCorrelation(cols: number, seed: number): number[][] {
  const rng = mulberry32(seed);
  const mat: number[][] = Array.from({ length: cols }, () => new Array(cols).fill(0));
  for (let i = 0; i < cols; i++) {
    mat[i][i] = 1;
    for (let j = i + 1; j < cols; j++) {
      const r = (rng() - 0.5) * 2;
      mat[i][j] = r;
      mat[j][i] = r;
    }
  }
  return mat;
}

// ── DataFrame builders ──

function buildExpressionSpec(
  expression: number[][],
  threshold: number,
  ramp: ColorRamp,
): PlotSpec {
  const rows = GENES.length;
  const cols = TISSUES.length;
  const count = rows * cols;

  const gene: string[] = new Array(count);
  const tissue: string[] = new Array(count);
  const value = new Float32Array(count);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      gene[i] = GENES[r];
      tissue[i] = TISSUES[c];
      const v = expression[r][c];
      value[i] = v >= threshold ? v : 0;
    }
  }

  return {
    data: { columns: { tissue, gene, value }, length: count },
    aes: { x: "tissue", y: "gene", fill: "value" },
    scales: { fill: { type: ramp, domain: [0, 1] } },
    layers: [{ geom: "tile" }],
    width: { step: STEP },
    height: { step: STEP },
  };
}

function buildCorrelationSpec(correlation: number[][]): PlotSpec {
  const n = TISSUES.length;
  const count = n * n;

  const tissueX: string[] = new Array(count);
  const tissueY: string[] = new Array(count);
  const value = new Float32Array(count);

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      tissueY[i] = TISSUES[r];
      tissueX[i] = TISSUES[c];
      value[i] = (correlation[r][c] + 1) / 2;
    }
  }

  return {
    data: { columns: { tissueX, tissueY, value }, length: count },
    aes: { x: "tissueX", y: "tissueY", fill: "value" },
    scales: { fill: { type: "diverging", domain: [0, 1] } },
    layers: [{ geom: "tile" }],
    width: { step: STEP },
    height: { step: STEP },
  };
}

// ── Tooltips ──

function ExpressionTooltip({ hover, expression, threshold }: {
  hover: HoverEvent;
  expression: number[][];
  threshold: number;
}) {
  const { hit, canvasX, canvasY } = hover;
  const tissue = hit.dataX as string;
  const gene = hit.dataY as string;
  const geneIdx = GENES.indexOf(gene);
  const tissueIdx = TISSUES.indexOf(tissue);

  if (geneIdx === -1 || tissueIdx === -1) return null;
  const raw = expression[geneIdx]?.[tissueIdx];
  if (raw === undefined) return null;

  const filtered = raw < threshold;

  return (
    <FadeTransition
      show
      className="data-tooltip heatmap-tooltip"
      style={{ left: canvasX + 12, top: canvasY - 8 }}
    >
      <div className="weight-semibold">{gene} — {tissue}</div>
      <div>Expression: <strong>{raw.toFixed(3)}</strong></div>
      <div>Threshold: <strong>{filtered ? "filtered" : "pass"}</strong></div>
    </FadeTransition>
  );
}

function CorrelationTooltip({ hover, correlation }: {
  hover: HoverEvent;
  correlation: number[][];
}) {
  const { hit, canvasX, canvasY } = hover;
  const tissueX = hit.dataX as string;
  const tissueY = hit.dataY as string;
  const xIdx = TISSUES.indexOf(tissueX);
  const yIdx = TISSUES.indexOf(tissueY);

  if (xIdx === -1 || yIdx === -1) return null;
  const r = correlation[yIdx]?.[xIdx];
  if (r === undefined) return null;

  return (
    <FadeTransition
      show
      className="data-tooltip heatmap-tooltip"
      style={{ left: canvasX + 12, top: canvasY - 8 }}
    >
      <div className="weight-semibold">{tissueY} × {tissueX}</div>
      <div>r: <strong>{r >= 0 ? "+" : ""}{r.toFixed(3)}</strong></div>
      {yIdx === xIdx && <div className="color-muted">self-correlation</div>}
    </FadeTransition>
  );
}

// ── Control Specs ──

const EXPR_CONTROLS: ControlSpec[] = [
  {
    type: "range",
    id: "threshold",
    label: "Threshold",
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: 0.3,
    display: (v) => v.toFixed(2),
    reserve: "0.00",
  },
  {
    type: "select",
    id: "ramp",
    label: "Color Scale",
    options: [
      { value: "sequential", label: "Sequential" },
      { value: "viridis", label: "Viridis" },
    ],
    defaultValue: "sequential",
  },
  {
    type: "range",
    id: "seed",
    label: "Seed",
    min: 1,
    max: 999,
    step: 1,
    defaultValue: 42,
    display: (v) => String(v),
    reserve: "999",
  },
  {
    type: "metric",
    id: "genes",
    label: "Genes",
    value: String(GENES.length),
    reserve: "99",
  },
  {
    type: "metric",
    id: "tissues",
    label: "Tissues",
    value: String(TISSUES.length),
    reserve: "99",
  },
];

// ── Component ──

export default function Expression() {
  // Expression plot — owns its control values via PlotFrame.
  const [exprValues, setExprValues] = useState<ControlValues>(
    () => initControlValues(EXPR_CONTROLS),
  );
  const [exprHover, setExprHover] = useState<HoverEvent | null>(null);
  const [corrHover, setCorrHover] = useState<HoverEvent | null>(null);

  const handleExprChange = useCallback((v: ControlValues) => setExprValues(v), []);

  // Read current values.
  const threshold = exprValues.threshold as number;
  const ramp = exprValues.ramp as ColorRamp;
  const seed = exprValues.seed as number;

  const expression = useMemo(
    () => generateExpression(GENES.length, TISSUES.length, seed),
    [seed],
  );
  const correlation = useMemo(
    () => generateCorrelation(TISSUES.length, seed + 1),
    [seed],
  );

  const exprSpec = useMemo(
    () => buildExpressionSpec(expression, threshold, ramp),
    [expression, threshold, ramp],
  );

  const corrSpec = useMemo(
    () => buildCorrelationSpec(correlation),
    [correlation],
  );

  const exprGraph = useMemo(
    () => compile(exprSpec),
    [exprSpec],
  );
  const corrGraph = useMemo(
    () => compile(corrSpec),
    [corrSpec],
  );

  const exprFillScale = exprGraph.scales.fill;
  const corrFillScale = corrGraph.scales.fill;

  return (
    <article className="region center flow">
      <h1>Expression</h1>
      <p>Synthetic gene expression heatmap (32 genes × 10 tissues) with a tissue-tissue correlation matrix below. Note: changing the seed regenerates both plots because the correlation is derived from the expression data.</p>

      <div className="canvas-frame viz-frame">
        <PlotFrame
          spec={exprSpec}
          graph={exprGraph}
          onHover={setExprHover}

          controls={EXPR_CONTROLS}
          onControlChange={handleExprChange}
          canopy={
            exprFillScale && exprFillScale.kind === "color"
              ? <ContinuousLegend scale={exprFillScale} />
              : undefined
          }
        >
          {exprHover && (
            <ExpressionTooltip
              hover={exprHover}
              expression={expression}
              threshold={threshold}
            />
          )}
        </PlotFrame>
      </div>

      <h2>Correlation</h2>
      <p>Tissue-tissue correlation derived from the expression matrix above.</p>

      <div className="canvas-frame viz-frame">
        <PlotFrame
          spec={corrSpec}
          graph={corrGraph}
          onHover={setCorrHover}

          canopy={
            corrFillScale && corrFillScale.kind === "color"
              ? <ContinuousLegend scale={corrFillScale} low="-1" high="+1" />
              : undefined
          }
        >
          {corrHover && (
            <CorrelationTooltip
              hover={corrHover}
              correlation={correlation}
            />
          )}
        </PlotFrame>
      </div>
    </article>
  );
}
