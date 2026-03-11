import { useEffect, useMemo, useRef, useState } from "react";
import {
  Heatmap,
  AnimatedGrid,
  CELL,
  CELL_STEP,
  type HeatmapPanel,
  type HeatmapControl,
  type HeatmapTooltipData,
} from "../components/Heatmap";
import { heatmapColor, viridisColor, divergingColor, mulberry32 } from "../lib/canvas";

// ── Dataset cards ──

const datasets = [
  { name: "RNA-seq (ENCODE)", samples: 1248, genes: "58,721", status: "Complete" },
  { name: "ChIP-seq H3K27ac", samples: 642, genes: "31,204", status: "Processing" },
  { name: "ATAC-seq (Roadmap)", samples: 387, genes: "22,109", status: "Complete" },
  { name: "Hi-C Contact Maps", samples: 94, genes: "N/A", status: "Pending" },
  { name: "WGBS Methylation", samples: 521, genes: "28,076", status: "Complete" },
  { name: "STARR-seq Enhancers", samples: 156, genes: "12,843", status: "Processing" },
];

// ── Fake data ──

const TISSUES = [
  "Brain", "Heart", "Liver", "Kidney", "Lung",
  "Spleen", "Thymus", "Colon", "Skin", "Muscle",
];

const GENES = [
  "TP53", "BRCA1", "MYC", "EGFR", "KRAS",
  "PTEN", "RB1", "APC", "VHL", "BRAF",
  "PIK3CA", "CDKN2A",
];

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
      const r = (rng() - 0.5) * 2; // -1..1
      mat[i][j] = r;
      mat[j][i] = r;
    }
  }
  return mat;
}

// ── Component ──

export default function Data() {
  const [selected, setSelected] = useState<string | null>(null);

  // Measure column label height from actual DOM metrics.
  // A hidden probe element with .axis-label--col styling gives us the real
  // rotated height without hardcoding font metrics.
  const [colLabelHeight, setColLabelHeight] = useState(80);
  const probeRef = useRef<HTMLSpanElement>(null);
  const longestCol = TISSUES.reduce((a, b) => (a.length >= b.length ? a : b), "");

  useEffect(() => {
    const el = probeRef.current;
    if (!el) return;
    setColLabelHeight(Math.ceil(el.getBoundingClientRect().height));
  }, []);
  const [threshold, setThreshold] = useState(0.3);
  const [colorScale, setColorScale] = useState<"sequential" | "viridis">("sequential");
  const [seed, setSeed] = useState(42);

  const expression = useMemo(() => generateExpression(GENES.length, TISSUES.length, seed), [seed]);
  const correlation = useMemo(() => generateCorrelation(TISSUES.length, seed + 1), [seed]);

  // ── Correlation grid ──
  const corrGrid = AnimatedGrid({
    maxSlots: TISSUES.length * TISSUES.length,
    cols: TISSUES.length,
    widthPx: TISSUES.length * CELL_STEP,
    colorFn: (t) => divergingColor(t * 2 - 1),
    mask: (row, col) => row <= col,
  });

  // ── Raw expression grid ──
  const rawGrid = AnimatedGrid({
    maxSlots: GENES.length * TISSUES.length,
    cols: TISSUES.length,
    widthPx: TISSUES.length * CELL_STEP,
    colorFn: (t) => {
      const clamped = Math.max(0, Math.min(1, t));
      return colorScale === "sequential" ? heatmapColor(clamped) : viridisColor(clamped);
    },
  });

  // Feed data into grids
  useEffect(() => {
    const flat = correlation.flat().map((v) => (v + 1) / 2);
    corrGrid.setNormalized(flat, TISSUES.length);
  }, [correlation]);

  useEffect(() => {
    const flat = expression.flat().map((v) => (v >= threshold ? v : 0));
    rawGrid.setNormalized(flat, GENES.length);
  }, [expression, threshold]);

  // ── Tooltip formatters ──
  const corrTooltip = (row: number, col: number): HeatmapTooltipData | null => {
    if (row > col) return null;
    const r = correlation[row][col];
    return {
      title: `${TISSUES[row]} × ${TISSUES[col]}`,
      rows: [{ label: "r", value: r.toFixed(3) }],
      secondary: row === col ? "self-correlation" : undefined,
    };
  };

  const rawTooltip = (row: number, col: number): HeatmapTooltipData => ({
    title: `${GENES[row]} — ${TISSUES[col]}`,
    rows: [
      { label: "Expression", value: expression[row][col].toFixed(3) },
      { label: "Threshold", value: expression[row][col] >= threshold ? "pass" : "filtered" },
    ],
  });

  // ── Panels ──
  const panels: HeatmapPanel[] = [
    {
      tab: "correlation",
      canvasRef: corrGrid.canvasRef,
      canvasWidth: TISSUES.length * CELL_STEP,
      canvasHeight: TISSUES.length * CELL_STEP,
      rowLabels: TISSUES.map((t) => ({ key: t, label: t })),
      legend: {
        low: "-1",
        high: "+1",
        caption: "Pearson correlation",
        gradientClass: "heatmap-legend__gradient--div",
      },
      onCellHover: corrTooltip,
      onCellClick: (row, col) => corrGrid.flashCell(row, col),
      mask: (row, col) => row <= col,
      onBecomeActive: () => corrGrid.replay(),
    },
    {
      tab: "raw",
      canvasRef: rawGrid.canvasRef,
      canvasWidth: TISSUES.length * CELL_STEP,
      canvasHeight: GENES.length * CELL_STEP,
      rowLabels: GENES.map((g) => ({ key: g, label: g })),
      legend: {
        low: "0",
        high: "1",
        caption: "Normalized expression",
      },
      onCellHover: rawTooltip,
      onCellClick: (row, col) => rawGrid.flashCell(row, col),
      onBecomeActive: () => rawGrid.replay(),
    },
  ];

  // ── Controls ──
  const controls: HeatmapControl[] = [
    {
      type: "range",
      label: "Threshold",
      min: 0,
      max: 1,
      step: 0.05,
      value: threshold,
      display: threshold.toFixed(2),
      reserve: "0.00",
      onChange: setThreshold,
    },
    {
      type: "select",
      label: "Color Scale",
      options: [
        { value: "sequential", label: "Sequential" },
        { value: "viridis", label: "Viridis" },
      ],
      value: colorScale,
      onChange: (v) => setColorScale(v as "sequential" | "viridis"),
    },
    {
      type: "range",
      label: "Seed",
      min: 1,
      max: 999,
      step: 1,
      value: seed,
      display: String(seed),
      reserve: "999",
      onChange: setSeed,
    },
    {
      type: "metric",
      label: "Genes",
      value: String(GENES.length),
      reserve: "99",
    },
    {
      type: "metric",
      label: "Tissues",
      value: String(TISSUES.length),
      reserve: "99",
    },
  ];

  return (
    <article className="region center flow">
      <h1>Data</h1>
      <p>Raw datasets, sample metadata, and quality metrics.</p>

      <div className="grid">
        {datasets.map((d) => (
          <div
            key={d.name}
            className="card stack engage recede"
            style={{ "--stack-gap": "var(--space-element)" } as React.CSSProperties}
            onClick={() => setSelected(selected === d.name ? null : d.name)}
            {...(selected === d.name ? { "data-selected": "" } : {})}
            {...(selected && selected !== d.name ? { "data-dimmed": "" } : {})}
          >
            <div className="cluster spread">
              <p className="weight-semibold">{d.name}</p>
              <span className="text-label color-muted self-start" style={{ minHeight: "3lh" }}>
                {[
                  ".card",
                  ".engage",
                  ".recede",
                  selected === d.name ? "[data-selected]" : null,
                  selected && selected !== d.name ? "[data-dimmed]" : null,
                ].filter(Boolean).join(" ")}
              </span>
            </div>
            <dl className="stack" style={{ "--stack-gap": "var(--space-1)" } as React.CSSProperties}>
              <div className="cluster spread">
                <dt className="text-caption">Samples</dt>
                <dd>{d.samples.toLocaleString()}</dd>
              </div>
              <div className="cluster spread">
                <dt className="text-caption">Genes</dt>
                <dd>{d.genes}</dd>
              </div>
              <div className="cluster spread">
                <dt className="text-caption">Status</dt>
                <dd
                  className="badge status-tinted radius-control"
                  data-status={d.status.toLowerCase()}
                >{d.status}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      {/* Hidden probe: measures actual rotated label height from CSS */}
      <div style={{ position: "absolute", visibility: "hidden", pointerEvents: "none" }}>
        <div className="axis-label__cell" style={{ width: CELL_STEP, "--col-center": `${CELL / 2}px` } as React.CSSProperties}>
          <span ref={probeRef} className="axis-label axis-label--col">{longestCol}</span>
        </div>
      </div>

      <Heatmap
        header={<span className="weight-semibold">Expression × Tissue</span>}
        columns={TISSUES.map((t) => ({ key: t, label: t }))}
        columnLabelHeight={colLabelHeight}
        longestRowLabel={GENES.reduce((a, b) => (a.length >= b.length ? a : b), "")}
        loading={false}
        panels={panels}
        controls={controls}
        hint="Click a cell to flash it. Drag the threshold slider to filter low-expression values."
      />
    </article>
  );
}
