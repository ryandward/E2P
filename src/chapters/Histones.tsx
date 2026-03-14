import { PivotExplorer } from "../components/templates/PivotExplorer";
import type { DataFrame } from "../lib/plot/types";

// ── Histone Domain Data ──

const TISSUES = [
  { code: "CL", name: "Cerebellum" },
  { code: "CR", name: "Cortex" },
  { code: "CO", name: "Colon" },
  { code: "KI", name: "Kidney" },
  { code: "LI", name: "Liver" },
  { code: "LU", name: "Lung" },
  { code: "MG", name: "Mammary Gland" },
  { code: "OV", name: "Ovary" },
  { code: "PA", name: "Pancreas" },
  { code: "SP", name: "Spleen" },
  { code: "ST", name: "Stomach" },
] as const;

const MARKS = [
  "H3K4me3", "H3K4me1", "H3K27ac", "H3K27me3", "H3K36me3",
] as const;

const PEAK_DATA: Record<string, Record<string, number>> = {
  CL: { H3K4me3: 189234, H3K4me1:  94521, H3K27ac: 152387, H3K27me3:  42156, H3K36me3:  68903 },
  CR: { H3K4me3: 176892, H3K4me1: 108743, H3K27ac: 163201, H3K27me3:  38974, H3K36me3:  72415 },
  CO: { H3K4me3: 142567, H3K4me1: 127891, H3K27ac: 198432, H3K27me3:  51203, H3K36me3:  83216 },
  KI: { H3K4me3: 168345, H3K4me1: 115678, H3K27ac: 185694, H3K27me3:  45891, H3K36me3:  76543 },
  LI: { H3K4me3: 195678, H3K4me1:  89234, H3K27ac: 139876, H3K27me3:  53412, H3K36me3:  91234 },
  LU: { H3K4me3: 153890, H3K4me1: 134567, H3K27ac: 215432, H3K27me3:  47823, H3K36me3:  79654 },
  MG: { H3K4me3: 131245, H3K4me1: 142356, H3K27ac: 239795, H3K27me3:  36789, H3K36me3:  64321 },
  OV: { H3K4me3: 147890, H3K4me1: 119876, H3K27ac: 178543, H3K27me3:  41234, H3K36me3:  71890 },
  PA: { H3K4me3: 162345, H3K4me1: 103456, H3K27ac: 156789, H3K27me3:  49876, H3K36me3:  85432 },
  SP: { H3K4me3: 184567, H3K4me1:  97654, H3K27ac: 145678, H3K27me3:  55432, H3K36me3:  93210 },
  ST: { H3K4me3: 138976, H3K4me1: 131234, H3K27ac: 201345, H3K27me3:  43567, H3K36me3:  77654 },
};

// ── Tidy DataFrame (static, computed once at module scope) ──

const COUNT = TISSUES.length * MARKS.length;
const tissue: string[] = new Array(COUNT);
const mark: string[] = new Array(COUNT);
const peak_count = new Float32Array(COUNT);

let _idx = 0;
for (const t of TISSUES) {
  for (const m of MARKS) {
    tissue[_idx] = t.name;
    mark[_idx] = m;
    peak_count[_idx] = PEAK_DATA[t.code][m];
    _idx++;
  }
}

const HISTONE_DATA: DataFrame = {
  columns: { tissue, mark, peak_count },
  length: COUNT,
};

// ── Component ──

export default function Histones() {
  return (
    <article className="region center flow">
      <h1>Histones</h1>
      <p>Histone modification peak counts across 11 tissues and 5 chromatin marks, rendered as a pivotable bar chart. This page is a thin domain layer — it supplies a flat DataFrame and two dimension names. The <strong>PivotExplorer</strong> template handles grouping, tab navigation, and threshold filtering with no domain knowledge.</p>
      <p>The GoG compiler turns a declarative <code>PlotSpec</code> into scaled bar geometry on a single canvas. The <strong>BarPlot</strong> layout wrapper arranges DOM axis labels alongside the canvas using CUBE compositions: <code>.bar-plot</code> (grid sizing), <code>.plot-labels</code> (row-label column), and <code>.tab-scroll</code> (single-row overflow with chevron steppers). A <code>.bar-plot-frame</code> wrapper constrains the header to the grid width so tabs overflow correctly. All visual treatment lives in blocks and utilities.</p>

      <div className="canvas-frame viz-frame">
        <PivotExplorer
          data={HISTONE_DATA}
          dimensions={["tissue", "mark"]}
          metric="peak_count"
        />
      </div>
    </article>
  );
}
