/**
 * PlotFrame — unified layout wrapper for the Plot engine.
 *
 * Renders any combination of band/continuous axes as DOM elements
 * alongside a <Plot> canvas:
 *   - Sticky header with optional tabs + x-axis context
 *     (rotated column labels for band, tick marks for continuous)
 *   - Row labels pinned to the left via CSS Grid
 *
 * Layout uses four emergent measurements as CSS custom properties:
 *   --col-label-h:       rotated column label height (trigonometry)
 *   --col-label-overhang: last label's horizontal extent past data column
 *   --label-col-w:       grid column 1 track width (measured from computed style)
 *   --tabs-h:            tab bar height for co-pinning (measured from DOM)
 *
 * Replaces GridPlot and BarPlot with a single composable frame.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useScrollSnap } from "../../hooks/useScrollSnap";
import { Plot, type HoverEvent } from "./Plot";
import type { HitResult } from "../../lib/plot/hitTest";
import type {
  PlotSpec,
  SceneGraph,
  BandScale,
  AxisTick,
} from "../../lib/plot/types";

export type { HoverEvent };

export interface PlotFrameProps {
  spec: PlotSpec;
  graph: SceneGraph;
  onHover?: (event: HoverEvent | null) => void;
  onClick?: (hit: HitResult) => void;
  /** Content rendered inside the sticky header (tab bar). */
  header?: ReactNode;
  /** Sidebar controls (legend, sliders) rendered in the canopy. */
  canopy?: ReactNode;
  /** When this value changes, the grid snaps back into view. */
  snapKey?: string | number;
  /** Overlay children passed through to Plot (tooltips). */
  children?: ReactNode;
}

// ── X-Axis Header: band labels or continuous ticks ──

function BandColumnLabels({
  xBand,
  xTicks,
  onMeasure,
}: {
  xBand: BandScale;
  xTicks: AxisTick[];
  onMeasure: (height: number, overhang: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
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
    onMeasure(
      Math.ceil(maxH),
      Math.max(0, Math.ceil(lastWidth * cosA - xBand.bandwidth / 2 - xBand.gap)),
    );
  }, [xTicks, xBand, onMeasure]);

  return (
    <div
      ref={containerRef}
      className="plot-frame__x-labels"
    >
      {xTicks.map((tick) => (
        <div
          key={tick.label}
          className="anchor"
          style={{
            width: xBand.step,
            "--col-center": `${xBand.bandwidth / 2}px`,
          } as React.CSSProperties}
        >
          <span className="axis-label axis-label--col" title={tick.label}>
            {tick.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function ContinuousTickLabels({
  xTicks,
  onMeasure,
}: {
  xTicks: AxisTick[];
  onMeasure: (height: number, overhang: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
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
    onMeasure(Math.ceil(maxH), Math.max(0, Math.ceil(lastWidth * cosA)));
  }, [xTicks, onMeasure]);

  return (
    <div ref={containerRef} className="plot-frame__x-labels">
      {xTicks.map((tick) => (
        <div
          key={tick.label}
          className="anchor"
          style={{
            position: "absolute",
            left: tick.position,
          }}
        >
          <span className="axis-label axis-label--col" title={tick.label}>
            {tick.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── PlotFrame ──

export function PlotFrame({
  spec,
  graph,
  onHover,
  onClick,
  header,
  canopy,
  snapKey,
  children,
}: PlotFrameProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const debugRef = useRef<HTMLPreElement>(null);
  const [colLabelHeight, setColLabelHeight] = useState(0);
  const [colOverhang, setColOverhang] = useState(0);
  const [labelColW, setLabelColW] = useState(0);
  const [tabsH, setTabsH] = useState(0);

  useScrollSnap(gridRef, snapKey);

  const handleMeasure = useCallback((height: number, overhang: number) => {
    setColLabelHeight(height);
    setColOverhang(overhang);
  }, []);

  const handleContinuousMeasure = useCallback((height: number, overhang: number) => {
    setColLabelHeight(height);
    setColOverhang(overhang);
  }, []);

  // Measure label column width and tabs height after render.
  useLayoutEffect(() => {
    if (gridRef.current) {
      const cols = getComputedStyle(gridRef.current).gridTemplateColumns;
      const firstCol = parseFloat(cols);
      if (isFinite(firstCol)) setLabelColW(firstCol);
    }
    if (tabsRef.current) {
      setTabsH(tabsRef.current.offsetHeight);
    } else {
      setTabsH(0);
    }
  }, [graph, header]);

  // Debug panel — dev only.
  useEffect(() => {
    if (import.meta.env.PROD) return;
    const grid = gridRef.current;
    if (!grid || !debugRef.current) return;
    const tabsEl = grid.querySelector('.plot-frame__tabs') as HTMLElement;
    const labels = grid.querySelector('.plot-labels') as HTMLElement;
    const xLabels = grid.querySelector('.plot-frame__x-labels') as HTMLElement;
    const reserveEl = labels?.querySelector('.tab-reserve') as HTMLElement;
    const firstRowLabel = labels?.querySelector('.axis-label--row:not(.tab-reserve)') as HTMLElement;
    const firstColLabel = grid.querySelector('.axis-label--col') as HTMLElement;
    const colnames = grid.querySelector('.plot-frame__colnames') as HTMLElement;
    const canvas = grid.querySelector('.plot-frame__canvas') as HTMLElement;
    const maxWToken = firstRowLabel ? getComputedStyle(firstRowLabel).maxWidth : 'n/a';
    debugRef.current.textContent = [
      `grid: ${grid.offsetWidth} cols: ${getComputedStyle(grid).gridTemplateColumns}`,
      `tabs: ${tabsEl?.offsetWidth} (h: ${tabsEl?.offsetHeight})`,
      `labels: ${labels?.offsetWidth}  xLabels: ${xLabels?.offsetWidth}`,
      `reserve: ${reserveEl?.offsetWidth} (text: "${reserveEl?.textContent?.slice(0, 20)}${(reserveEl?.textContent?.length ?? 0) > 20 ? '...' : ''}")`,
      `firstRowLabel: ${firstRowLabel?.offsetWidth} (scrollW: ${firstRowLabel?.scrollWidth}) maxW: ${maxWToken}`,
      `firstColLabel: ${firstColLabel?.offsetWidth} (scrollW: ${firstColLabel?.scrollWidth})`,
      `colnames: ${colnames?.offsetWidth} (h: ${colnames?.offsetHeight})`,
      `canvas: ${canvas?.offsetWidth} (left: ${canvas?.offsetLeft})`,
      `--plot-frame-data-col: ${graph.width}px  --label-col-w: ${labelColW}px  --tabs-h: ${tabsH}px`,
      `--col-label-h: ${colLabelHeight}  --col-label-overhang: ${colOverhang}`,
      `longestRowLabel: "${longestRowLabel.slice(0, 25)}${longestRowLabel.length > 25 ? '...' : ''}" (${longestRowLabel.length}ch)`,
    ].join('\n');
  });

  const xScale = graph.scales.x;
  const yScale = graph.scales.y;
  const longestRowLabel = yScale.kind === "band"
    ? yScale.domain.reduce((a, b) => a.length > b.length ? a : b, "")
    : "";
  const xBand = xScale.kind === "band" ? xScale : null;
  const xContinuous = xScale.kind === "continuous" ? xScale : null;
  const xTicks = graph.axes.x.ticks;
  const yTicks = graph.axes.y.ticks;
  const yStep = yScale.kind === "band" ? Math.round(yScale.step) : 0;

  return (
    <div className="sidebar">
      <div
        ref={gridRef}
        className="plot-frame"
        style={{
          "--plot-frame-data-col": `${graph.width}px`,
          "--col-label-overhang": `${colOverhang}px`,
          "--col-label-h": `${colLabelHeight}px`,
          "--label-col-w": `${labelColW}px`,
          "--tabs-h": `${tabsH}px`,
        } as React.CSSProperties}
      >
        {/* Tabs: contained grid item, can't inflate columns */}
        {header && (
          <div ref={tabsRef} className="plot-frame__tabs surface-sunken">
            {header}
          </div>
        )}

        {/* X-axis context: aligned via --label-col-w measurement */}
        <div className="plot-frame__colnames surface-sunken">
          {xBand && (
            <BandColumnLabels xBand={xBand} xTicks={xTicks} onMeasure={handleMeasure} />
          )}
          {xContinuous && xTicks.length > 0 && (
            <ContinuousTickLabels xTicks={xTicks} onMeasure={handleContinuousMeasure} />
          )}
        </div>

        {/* Row labels */}
        {yScale.kind === "band" && (
          <div className="plot-labels plot-frame__labels surface-sunken shadow-md radius-sm promote-layer">
            <div className="axis-label axis-label--row tab-reserve" aria-hidden="true">
              <span>{longestRowLabel}</span>
            </div>
            {yTicks.map((tick) => (
              <div
                key={tick.label}
                className="axis-label axis-label--row"
                style={{ height: yStep }}
                title={tick.label}
              >
                <span>{tick.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Plot canvas */}
        <div className="plot-frame__canvas">
          <Plot spec={spec} onHover={onHover} onClick={onClick}>
            {children}
          </Plot>
        </div>
        {import.meta.env.DEV && (
          <pre ref={debugRef} style={{ fontSize: 10, color: "lime", background: "black", padding: 8, gridColumn: "1 / -1", contain: "inline-size" }} />
        )}
      </div>

      {canopy && (
        <div className="sticky-panel canopy stack">{canopy}</div>
      )}
    </div>
  );
}
