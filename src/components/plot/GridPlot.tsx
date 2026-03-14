/**
 * GridPlot — tab-grid layout wrapper for the Plot engine.
 *
 * Renders band-scale axes as DOM elements alongside a <Plot> canvas:
 *   - Sticky header with caller-provided content (tabs) + rotated column labels
 *   - Row labels pinned to the left via CSS Grid
 *   - Column label height measured via useLayoutEffect trigonometry
 *
 * Requires the y-axis to be a BandScale (for row labels). The x-axis
 * can be either BandScale (heatmap columns) or ContinuousScale (bar charts).
 * Column labels are rendered only when x is a BandScale.
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useScrollSnap } from "../../hooks/useScrollSnap";
import { Plot, type HoverEvent } from "./Plot";
import type { HitResult } from "../../lib/plot/hitTest";
import type { PlotSpec, SceneGraph, BandScale } from "../../lib/plot/types";

export type { HoverEvent };

/** Scene graph where both axes are band scales (heatmaps, tile grids). */
export type BandSceneGraph = SceneGraph & {
  scales: { x: BandScale; y: BandScale };
};

export interface GridPlotProps {
  spec: PlotSpec;
  graph: BandSceneGraph;
  onHover?: (event: HoverEvent | null) => void;
  onClick?: (hit: HitResult) => void;
  /** Longest possible row label (for stable column sizing across views). */
  longestRowLabel: string;
  /** Content rendered inside the sticky header (tab bar). */
  header?: ReactNode;
  /**
   * Scroll-snap trigger. When this value changes, the grid snaps
   * back to its pinned position if it has scrolled past it.
   * Typically `tab + "|" + snapCounter`.
   */
  snapKey?: string | number;
  /** Overlay children passed through to Plot (tooltips). */
  children?: ReactNode;
}

export function GridPlot({
  spec,
  graph,
  onHover,
  onClick,
  longestRowLabel,
  header,
  snapKey,
  children,
}: GridPlotProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const colsContainerRef = useRef<HTMLDivElement>(null);
  const [colLabelHeight, setColLabelHeight] = useState(0);
  const [colOverhang, setColOverhang] = useState(0);

  const debugRef = useRef<HTMLPreElement>(null);
  useScrollSnap(gridRef, snapKey);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || !debugRef.current) return;
    const header = grid.querySelector('.tab-grid__header') as HTMLElement;
    const tabScroll = grid.querySelector('.tab-scroll') as HTMLElement;
    const track = grid.querySelector('.tab-scroll__track') as HTMLElement;
    const labels = grid.querySelector('.plot-labels') as HTMLElement;
    debugRef.current.textContent = [
      `grid: ${grid.offsetWidth}`,
      `header: ${header?.offsetWidth}`,
      `tabScroll: ${tabScroll?.offsetWidth}`,
      `track: ${track?.offsetWidth} (scrollW: ${track?.scrollWidth})`,
      `labels: ${labels?.offsetWidth}`,
      `spec.width: ${spec.width}`,
      `grid computed width: ${getComputedStyle(grid).width}`,
      `grid parent width: ${(grid.parentElement as HTMLElement)?.offsetWidth}`,
    ].join('\n');
  });

  const xScaleRaw = graph.scales.x;
  const yScale = graph.scales.y;
  const xBand = xScaleRaw.kind === "band" ? xScaleRaw : null;
  const xTicks = graph.axes.x.ticks;
  const yTicks = graph.axes.y.ticks;
  const yStep = Math.round(yScale.step);

  // Measure column label geometry from the DOM.
  // offsetWidth gives unrotated text width (CSS transform doesn't affect it).
  // Height and overhang are derived from exact text width + angle from CSS.
  useLayoutEffect(() => {
    if (!xBand) return;
    const container = colsContainerRef.current;
    if (!container) return;
    const labels = container.querySelectorAll<HTMLSpanElement>(".axis-label--col");
    if (!labels.length) return;

    const sample = labels[0];
    const style = getComputedStyle(sample);
    const angleDeg = parseFloat(style.getPropertyValue("--col-angle")) || 60;
    const rad = (angleDeg * Math.PI) / 180;
    const sinA = Math.sin(rad);
    const cosA = Math.cos(rad);
    const lh = parseFloat(style.lineHeight) || parseFloat(style.fontSize);

    let maxH = 0;
    labels.forEach((el) => {
      const h = el.offsetWidth * sinA + lh * cosA;
      if (h > maxH) maxH = h;
    });

    const lastWidth = labels[labels.length - 1].offsetWidth;
    setColLabelHeight(Math.ceil(maxH));
    setColOverhang(Math.max(0, Math.ceil(lastWidth * cosA - xBand.bandwidth / 2 - xBand.gap)));
  }, [xTicks, xBand]);

  return (
    <div
      ref={gridRef}
      className="tab-grid"
      style={{
        "--tab-grid-data-col": `${spec.width}px`,
        "--col-label-overhang": `${colOverhang}px`,
      } as React.CSSProperties}
    >
      {/* Sticky header: tab bar + column labels */}
      <div className="tab-grid__header surface-raised shadow-md radius-sm">
        {header}
        {/* Column labels — only rendered when x is a band scale */}
        {xBand && (
          <div ref={colsContainerRef} className="tab-grid__columns" style={{ height: colLabelHeight }}>
            {xTicks.map((tick) => (
              <div
                key={tick.label}
                className="anchor"
                style={{
                  width: xBand.step,
                  "--col-center": `${xBand.bandwidth / 2}px`,
                } as React.CSSProperties}
              >
                <span className="axis-label axis-label--col">
                  {tick.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Row labels (col 1) */}
      <div className="plot-labels tab-grid__labels surface-raised shadow-md radius-sm promote-layer">
        {/* Reserve: identical rendering path as real labels — zero box-model mismatch */}
        <div className="axis-label axis-label--row tab-reserve" aria-hidden="true">
          {longestRowLabel}
        </div>
        {yTicks.map((tick) => (
          <div
            key={tick.label}
            className="axis-label axis-label--row"
            style={{ height: yStep }}
          >
            {tick.label}
          </div>
        ))}
      </div>

      {/* Plot canvas (col 2) */}
      <Plot spec={spec} onHover={onHover} onClick={onClick}>
        {children}
      </Plot>
      <pre ref={debugRef} style={{ fontSize: 10, color: "lime", background: "black", padding: 8, gridColumn: "1 / -1" }} />
    </div>
  );
}
