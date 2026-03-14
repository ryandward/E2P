/**
 * PlotFrame — unified layout wrapper for the Plot engine.
 *
 * Renders any combination of band/continuous axes as DOM elements
 * alongside a <Plot> canvas:
 *   - Sticky header with optional tabs + x-axis context
 *     (rotated column labels for band, tick marks for continuous)
 *   - Row labels pinned to the left via CSS Grid
 *
 * Layout uses five emergent measurements as CSS custom properties:
 *   --plot-col-h:        rotated column label height (trigonometry)
 *   --plot-col-overhang: last label's horizontal extent past data column
 *   --plot-row-h:        row label height (band scale step, rounded)
 *   --plot-label-w:      grid column 1 track width (measured from computed style)
 *   --plot-tabs-h:       tab bar height for co-pinning (measured from DOM)
 *
 * Templates can set --plot-label-floor (in ch units) on a parent element
 * to guarantee stable label column width across tab switches.
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
import { CanopyControl } from "./CanopyControl";
import type { ControlSpec, ControlValues } from "./controls";
import { initControlValues } from "./controls";
import type { HitResult } from "../../lib/plot/hitTest";
import type {
  PlotSpec,
  SceneGraph,
  BandScale,
  AxisTick,
} from "../../lib/plot/types";

export type { HoverEvent };
export type { ControlSpec, ControlValues };

export interface PlotFrameProps {
  spec: PlotSpec;
  graph: SceneGraph;
  onHover?: (event: HoverEvent | null) => void;
  onClick?: (hit: HitResult) => void;
  /** Content rendered inside the sticky header (tab bar). */
  header?: ReactNode;
  /** Declarative control specs — PlotFrame owns the state. */
  controls?: ControlSpec[];
  /** Called when any control value changes. Values are keyed by control id. */
  onControlChange?: (values: ControlValues) => void;
  /** Additional canopy content (legends, non-control elements). */
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
  controls,
  onControlChange,
  canopy,
  snapKey,
  children,
}: PlotFrameProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const debugRef = useRef<HTMLPreElement>(null);
  const [colH, setColH] = useState(0);
  const [colOverhang, setColOverhang] = useState(0);
  const [labelW, setLabelW] = useState(0);
  const [tabsH, setTabsH] = useState(0);

  // Control state — owned by PlotFrame, not the caller.
  const [controlValues, setControlValues] = useState<ControlValues>(
    () => initControlValues(controls ?? []),
  );

  const handleControlChange = useCallback((id: string, value: number | string) => {
    setControlValues((prev) => {
      const next = { ...prev, [id]: value };
      onControlChange?.(next);
      return next;
    });
  }, [onControlChange]);

  useScrollSnap(gridRef, snapKey);

  const handleColMeasure = useCallback((height: number, overhang: number) => {
    setColH(height);
    setColOverhang(overhang);
  }, []);

  // Measure label column width and tabs height after render.
  useLayoutEffect(() => {
    if (gridRef.current) {
      const cols = getComputedStyle(gridRef.current).gridTemplateColumns;
      const firstCol = parseFloat(cols);
      if (isFinite(firstCol)) setLabelW(firstCol);
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
    debugRef.current.textContent = [
      `grid: ${grid.offsetWidth} cols: ${getComputedStyle(grid).gridTemplateColumns}`,
      `tabs: ${tabsEl?.offsetWidth} (h: ${tabsEl?.offsetHeight})`,
      `labels: ${labels?.offsetWidth}  xLabels: ${xLabels?.offsetWidth}`,
      `reserve: ${reserveEl?.offsetWidth} (text: "${reserveEl?.textContent?.slice(0, 20)}${(reserveEl?.textContent?.length ?? 0) > 20 ? '...' : ''}")`,
      `firstRowLabel: ${firstRowLabel?.offsetWidth} (scrollW: ${firstRowLabel?.scrollWidth}) maxW: ${firstRowLabel ? getComputedStyle(firstRowLabel).maxWidth : 'n/a'}`,
      `firstColLabel: ${firstColLabel?.offsetWidth} (scrollW: ${firstColLabel?.scrollWidth})`,
      `colnames: ${colnames?.offsetWidth} (h: ${colnames?.offsetHeight})`,
      `canvas: ${canvas?.offsetWidth} (left: ${canvas?.offsetLeft})`,
      `--plot-data-w: ${graph.width}px  --plot-label-w: ${labelW}px  --plot-tabs-h: ${tabsH}px`,
      `--plot-col-h: ${colH}  --plot-col-overhang: ${colOverhang}`,
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
          "--plot-data-w": `${graph.width}px`,
          "--plot-col-overhang": `${colOverhang}px`,
          "--plot-col-h": `${colH}px`,
          "--plot-row-h": `${yStep}px`,
          "--plot-label-w": `${labelW}px`,
          "--plot-tabs-h": `${tabsH}px`,
        } as React.CSSProperties}
      >
        {/* Tabs: contained grid item, can't inflate columns */}
        {header && (
          <div ref={tabsRef} className="plot-frame__tabs surface-sunken">
            {header}
          </div>
        )}

        {/* X-axis context: aligned via --plot-label-w measurement */}
        <div className="plot-frame__colnames surface-sunken">
          {xBand && (
            <BandColumnLabels xBand={xBand} xTicks={xTicks} onMeasure={handleColMeasure} />
          )}
          {xContinuous && xTicks.length > 0 && (
            <ContinuousTickLabels xTicks={xTicks} onMeasure={handleColMeasure} />
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

      {(controls?.length || canopy) && (
        <div className="sticky-panel canopy stack">
          {canopy}
          {controls?.map((spec) => (
            <CanopyControl
              key={spec.id}
              spec={spec}
              value={controlValues[spec.id] ?? (spec.type === "metric" ? spec.value : "")}
              onChange={handleControlChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
