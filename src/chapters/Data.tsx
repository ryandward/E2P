import { useCallback, useMemo, useState } from "react";
import { FadeTransition, StableCounter } from "stablekit.ts";
import { mulberry32 } from "../lib/canvas";
import { GridPlot, type HoverEvent } from "../components/plot/GridPlot";
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
  "Unknon1234567", "BRCA1", "MYC", "EGFR", "KRAS",
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

/**
 * Expand a row×col matrix into tidy DataFrame columns.
 *
 * For a 32×10 expression matrix this produces 320 rows:
 *   gene:   [gene0 ×10, gene1 ×10, ...]
 *   tissue: [tissue0..tissue9, tissue0..tissue9, ...]
 *   value:  [flat expression values]
 */
function buildExpressionSpec(
  expression: number[][],
  threshold: number,
  ramp: ColorRamp,
): PlotSpec {
  const rows = GENES.length;
  const cols = TISSUES.length;
  const count = rows * cols;

  // Tidy columns.
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
    width: cols * STEP,
    height: rows * STEP,
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
      // Map -1..1 → 0..1 for the diverging scale.
      value[i] = (correlation[r][c] + 1) / 2;
    }
  }

  return {
    data: { columns: { tissueX, tissueY, value }, length: count },
    aes: { x: "tissueX", y: "tissueY", fill: "value" },
    scales: { fill: { type: "diverging", domain: [0, 1] } },
    layers: [{ geom: "tile" }],
    width: n * STEP,
    height: n * STEP,
  };
}

// ── Tooltip ──

interface TooltipProps {
  hover: HoverEvent;
  expression: number[][];
  threshold: number;
}

function ExpressionTooltip({ hover, expression, threshold }: TooltipProps) {
  const { hit, canvasX, canvasY } = hover;
  const tissue = hit.dataX as string;
  const gene = hit.dataY as string;
  const geneIdx = GENES.indexOf(gene);
  const tissueIdx = TISSUES.indexOf(tissue);

  // Guard against stale hits during transitions.
  if (geneIdx === -1 || tissueIdx === -1) return null;
  // dataX is tissue (x-axis), dataY is gene (y-axis) — swap for lookup.
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

interface CorrTooltipProps {
  hover: HoverEvent;
  correlation: number[][];
}

function CorrelationTooltip({ hover, correlation }: CorrTooltipProps) {
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

// ── Component ──

type Tab = "expression" | "correlation";

// Longest row label across both tabs for stable column sizing.
const LONGEST_ROW_LABEL = [...GENES, ...TISSUES].reduce((a, b) =>
  a.length > b.length ? a : b,
);

export default function Data() {
  const [threshold, setThreshold] = useState(0.3);
  const [ramp, setRamp] = useState<ColorRamp>("sequential");
  const [seed, setSeed] = useState(42);
  const [tab, setTab] = useState<Tab>("expression");
  const [exprHover, setExprHover] = useState<HoverEvent | null>(null);
  const [corrHover, setCorrHover] = useState<HoverEvent | null>(null);

  const [snapTrigger, setSnapTrigger] = useState(0);
  const requestSnap = useCallback(() => setSnapTrigger((n) => n + 1), []);

  const expression = useMemo(
    () => generateExpression(GENES.length, TISSUES.length, seed),
    [seed],
  );
  const correlation = useMemo(
    () => generateCorrelation(TISSUES.length, seed + 1),
    [seed],
  );

  // ── PlotSpec construction ──

  const exprSpec = useMemo(
    () => buildExpressionSpec(expression, threshold, ramp),
    [expression, threshold, ramp],
  );

  const corrSpec = useMemo(
    () => buildCorrelationSpec(correlation),
    [correlation],
  );

  const activeSpec = tab === "expression" ? exprSpec : corrSpec;
  const activeHover = tab === "expression" ? exprHover : corrHover;
  const setActiveHover = tab === "expression" ? setExprHover : setCorrHover;

  // Compile the active spec to extract axes and fill scale.
  const activeGraph = useMemo(() => compile(activeSpec), [activeSpec]);
  const fillScale = activeGraph.scales.fill;

  return (
    <article className="region center flow">
      <h1>Data</h1>
      <p>Raw datasets, sample metadata, and quality metrics.</p>

      <div className="canvas-frame viz-frame">
        <div className="sidebar">
          <GridPlot
            spec={activeSpec}
            graph={activeGraph}
            onHover={setActiveHover}
            longestRowLabel={LONGEST_ROW_LABEL}
            snapKey={tab + "|" + snapTrigger}
            header={<>
              <button
                className="tab"
                role="tab"
                aria-selected={tab === "expression"}
                onClick={() => setTab("expression")}
              >
                Expression
              </button>
              <button
                className="tab"
                role="tab"
                aria-selected={tab === "correlation"}
                onClick={() => setTab("correlation")}
              >
                Correlation
              </button>
            </>}
          >
            {tab === "expression" && exprHover && (
              <ExpressionTooltip
                hover={exprHover}
                expression={expression}
                threshold={threshold}
              />
            )}
            {tab === "correlation" && corrHover && (
              <CorrelationTooltip
                hover={corrHover}
                correlation={correlation}
              />
            )}
          </GridPlot>

          {/* ── Right column: canopy ── */}
          <div className="sticky-panel canopy stack">
            <ContinuousLegend
              scale={fillScale}
              low={tab === "correlation" ? "-1" : undefined}
              high={tab === "correlation" ? "+1" : undefined}
            />

            <div className="stack">
              <div className="text-label color-muted">Threshold</div>
              <div className="slider-group">
                <input
                  className="slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  onPointerUp={requestSnap}
                />
                <StableCounter
                  className="gauge"
                  value={threshold.toFixed(2)}
                  reserve="0.00"
                />
              </div>
            </div>

            <div className="stack">
              <div className="text-label color-muted">Color Scale</div>
              <div className="dropdown">
                <select
                  value={ramp}
                  onChange={(e) => { setRamp(e.target.value as ColorRamp); requestSnap(); }}
                >
                  <option value="sequential">Sequential</option>
                  <option value="viridis">Viridis</option>
                </select>
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            <div className="stack">
              <div className="text-label color-muted">Seed</div>
              <div className="slider-group">
                <input
                  className="slider"
                  type="range"
                  min={1}
                  max={999}
                  step={1}
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value))}
                  onPointerUp={requestSnap}
                />
                <StableCounter
                  className="gauge"
                  value={String(seed)}
                  reserve="999"
                />
              </div>
            </div>

            <div className="stack">
              <div className="text-label color-muted">Genes</div>
              <StableCounter className="gauge" value={String(GENES.length)} reserve="99" />
            </div>

            <div className="stack">
              <div className="text-label color-muted">Tissues</div>
              <StableCounter className="gauge" value={String(TISSUES.length)} reserve="99" />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
