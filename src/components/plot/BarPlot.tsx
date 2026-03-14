/**
 * BarPlot — layout wrapper for horizontal/vertical bar charts.
 *
 * Renders band-scale y-axis labels on the left, continuous x-axis
 * tick labels along the bottom, and the Plot canvas between them.
 * Accepts `header` (tab bar) and `canopy` (sidebar controls) props
 * so parent templates can inject UI shell elements.
 *
 * For categorical × categorical (heatmaps), use GridPlot.
 */

import { useRef, useEffect, type ReactNode } from "react";
import { useScrollSnap } from "../../hooks/useScrollSnap";
import { Plot, type HoverEvent } from "./Plot";
import type { HitResult } from "../../lib/plot/hitTest";
import type { PlotSpec, SceneGraph, BandScale } from "../../lib/plot/types";

export type { HoverEvent };

/** Scene graph where y is a band scale (categories on the left). */
export type BarSceneGraph = SceneGraph & {
  scales: { y: BandScale };
};

export interface BarPlotProps {
  spec: PlotSpec;
  graph: BarSceneGraph;
  onHover?: (event: HoverEvent | null) => void;
  onClick?: (hit: HitResult) => void;
  /** Longest possible row label (for stable column sizing across views). */
  longestRowLabel: string;
  /** Tab content rendered inside the sticky header bar. */
  header?: ReactNode;
  /** Sidebar controls (dropdowns, legend) rendered in the canopy. */
  canopy?: ReactNode;
  /** When this value changes, the grid snaps back into view. */
  snapKey?: string | number;
  /** Overlay children passed through to Plot (tooltips). */
  children?: ReactNode;
}

export function BarPlot({
  spec,
  graph,
  onHover,
  onClick,
  longestRowLabel,
  header,
  canopy,
  snapKey,
  children,
}: BarPlotProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const debugRef = useRef<HTMLPreElement>(null);
  useScrollSnap(gridRef, snapKey);

  useEffect(() => {
    const frame = gridRef.current;
    if (!frame || !debugRef.current) return;
    const header = frame.querySelector('.bar-plot__header') as HTMLElement;
    const barPlot = frame.querySelector('.bar-plot') as HTMLElement;
    const tabScroll = frame.querySelector('.tab-scroll') as HTMLElement;
    const track = frame.querySelector('.tab-scroll__track') as HTMLElement;
    debugRef.current.textContent = [
      `frame: ${frame.offsetWidth}`,
      `header: ${header?.offsetWidth}`,
      `barPlot: ${barPlot?.offsetWidth}`,
      `tabScroll: ${tabScroll?.offsetWidth}`,
      `track: ${track?.offsetWidth} (scrollW: ${track?.scrollWidth})`,
      `spec.width: ${spec.width}`,
      `frame classes: ${frame.className}`,
      `frame computed width: ${getComputedStyle(frame).width}`,
      `frame parent width: ${(frame.parentElement as HTMLElement)?.offsetWidth}`,
    ].join('\n');
  });

  const yScale = graph.scales.y;
  const xTicks = graph.axes.x.ticks;
  const yTicks = graph.axes.y.ticks;
  const yStep = Math.round(yScale.step);

  return (
    <div className="sidebar">
      <div ref={gridRef} className="bar-plot-frame">
        {header && (
          <div className="bar-plot__header surface-raised shadow-md radius-sm">
            {header}
          </div>
        )}

        <div
          className="bar-plot"
          style={{
            "--bar-plot-data-col": `${spec.width}px`,
          } as React.CSSProperties}
        >
          <div className="plot-labels bar-plot__y surface-raised shadow-md radius-sm promote-layer">
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

          {/* Canvas + x-axis */}
          <div>
            <Plot spec={spec} onHover={onHover} onClick={onClick}>
              {children}
            </Plot>

            {xTicks.length > 0 && (
              <div className="bar-plot__x">
                {xTicks.map((tick) => (
                  <span
                    key={tick.label}
                    className="axis-label"
                    style={{
                      position: "absolute",
                      left: tick.position,
                      transform: "translateX(-50%)",
                    }}
                  >
                    {tick.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <pre ref={debugRef} style={{ fontSize: 10, color: "lime", background: "black", padding: 8 }} />
      </div>

      {canopy && (
        <div className="sticky-panel canopy stack">{canopy}</div>
      )}
    </div>
  );
}
