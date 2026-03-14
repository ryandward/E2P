/**
 * PlotFrame — unified layout wrapper for the Plot engine.
 *
 * Renders any combination of band/continuous axes as DOM elements
 * alongside a <Plot> canvas:
 *   - Sticky header with optional tabs + x-axis context
 *     (rotated column labels for band, tick marks for continuous)
 *   - Row labels pinned to the left via CSS Grid
 *
 * Layout uses three emergent measurements as CSS custom properties:
 *   --col-label-h:   rotated column label height (trigonometry)
 *   --label-col-w:   row label column width (measured from DOM)
 *   --tabs-h:        tab bar height for co-pinning (measured from DOM)
 *
 * Replaces GridPlot and BarPlot with a single composable frame.
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
  /** Longest possible row label (for stable column sizing across views). */
  longestRowLabel: string;
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
          <span className="axis-label axis-label--col">
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
          <span className="axis-label axis-label--col">
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
  longestRowLabel,
  header,
  canopy,
  snapKey,
  children,
}: PlotFrameProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const [colLabelHeight, setColLabelHeight] = useState(0);
  const [colOverhang, setColOverhang] = useState(0);
  const [labelColW, setLabelColW] = useState(0);
  const [tabsH, setTabsH] = useState(0);

  const debugRef = useRef<HTMLPreElement>(null);
  useScrollSnap(gridRef, snapKey);

  // Measure label column width and tabs height after render.
  useLayoutEffect(() => {
    if (labelsRef.current) {
      setLabelColW(labelsRef.current.offsetWidth);
    }
    if (tabsRef.current) {
      setTabsH(tabsRef.current.offsetHeight);
    } else {
      setTabsH(0);
    }
  });

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || !debugRef.current) return;
    const tabsEl = grid.querySelector('.plot-frame__tabs') as HTMLElement;
    const tabScroll = grid.querySelector('.tab-scroll') as HTMLElement;
    const track = grid.querySelector('.tab-scroll__track') as HTMLElement;
    const labels = grid.querySelector('.plot-labels') as HTMLElement;
    const xLabels = grid.querySelector('.plot-frame__x-labels') as HTMLElement;
    debugRef.current.textContent = [
      `grid: ${grid.offsetWidth} (computed: ${getComputedStyle(grid).width})`,
      `tabs: ${tabsEl?.offsetWidth} (h: ${tabsEl?.offsetHeight})`,
      `tabScroll: ${tabScroll?.offsetWidth}`,
      `track: ${track?.offsetWidth} (scrollW: ${track?.scrollWidth})`,
      `labels: ${labels?.offsetWidth}`,
      `xLabels: ${xLabels?.offsetWidth}`,
      `--plot-frame-data-col: ${graph.width}px`,
      `--label-col-w: ${labelColW}px`,
      `--tabs-h: ${tabsH}px`,
      `colLabelHeight: ${colLabelHeight}`,
      `grid cols: ${getComputedStyle(grid).gridTemplateColumns}`,
      `parent: ${(grid.parentElement as HTMLElement)?.offsetWidth}`,
    ].join('\n');
  });

  const xScale = graph.scales.x;
  const yScale = graph.scales.y;
  const xBand = xScale.kind === "band" ? xScale : null;
  const xContinuous = xScale.kind === "continuous" ? xScale : null;
  const xTicks = graph.axes.x.ticks;
  const yTicks = graph.axes.y.ticks;
  const yStep = yScale.kind === "band" ? Math.round(yScale.step) : 0;

  const handleMeasure = (height: number, overhang: number) => {
    setColLabelHeight(height);
    setColOverhang(overhang);
  };

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
          <div ref={tabsRef} className="plot-frame__tabs surface-sunken shadow-md radius-sm">
            {header}
          </div>
        )}

        {/* Column names: subgrid for column alignment */}
        <div className="plot-frame__colnames surface-sunken shadow-md radius-sm">
          {xBand && (
            <BandColumnLabels xBand={xBand} xTicks={xTicks} onMeasure={handleMeasure} />
          )}
          {xContinuous && xTicks.length > 0 && (
            <ContinuousTickLabels
              xTicks={xTicks}
              onMeasure={(height, overhang) => {
                setColLabelHeight(height);
                setColOverhang(overhang);
              }}
            />
          )}
        </div>

        {/* Row labels */}
        {yScale.kind === "band" && (
          <div ref={labelsRef} className="plot-labels plot-frame__labels surface-sunken shadow-md radius-sm promote-layer">
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
        )}

        {/* Plot canvas */}
        <Plot spec={spec} onHover={onHover} onClick={onClick}>
          {children}
        </Plot>
        <pre ref={debugRef} style={{ fontSize: 10, color: "lime", background: "black", padding: 8, gridColumn: "1 / -1" }} />
      </div>

      {canopy && (
        <div className="sticky-panel canopy stack">{canopy}</div>
      )}
    </div>
  );
}
