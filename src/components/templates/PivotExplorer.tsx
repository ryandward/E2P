/**
 * PivotExplorer — interaction template for pivotable bar chart exploration.
 *
 * Accepts a tidy DataFrame with two categorical dimensions and one numeric
 * metric. Lets the user group by either dimension (tabs show the active
 * group's values, bars show the other dimension). Knows nothing about
 * specific datasets — all domain knowledge lives in the page.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { FadeTransition, StableCounter } from "stablekit.ts";
import { PlotFrame, type HoverEvent } from "../plot/PlotFrame";
import { compile, niceDomain, NAME_COL } from "../../lib/plot";
import type { DataFrame, PlotSpec } from "../../lib/plot/types";

// ── Geometry Constants ──

const BAR_W = 480;
const BAR_H = 36;
const GAP = 2;
const STEP = BAR_H + GAP;

// ── Helpers ──

function unique(col: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of col) {
    if (!seen.has(v)) {
      seen.add(v);
      result.push(v);
    }
  }
  return result;
}

// ── Tooltip ──

function PivotTooltip({ hover }: { hover: HoverEvent }) {
  const { hit, canvasX, canvasY } = hover;
  const category = hit.dataY as string;
  const value = hit.dataX as number;

  return (
    <FadeTransition
      show
      className="data-tooltip heatmap-tooltip"
      style={{ left: canvasX + 12, top: canvasY - 8 }}
    >
      <div className="weight-semibold">{category}</div>
      <div><strong>{value.toLocaleString()}</strong></div>
    </FadeTransition>
  );
}

// ── Tab Bar ──

const Chevron = ({ flip }: { flip?: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"
    style={flip ? { transform: "scaleX(-1)" } : undefined}>
    <path d="M4.5 2.5l3.5 3.5-3.5 3.5" stroke="currentColor"
      strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function TabBar({ tabs, active, onSelect }: {
  tabs: string[];
  active: string;
  onSelect: (tab: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canGoPrev, setCanGoPrev] = useState(false);
  const [canGoNext, setCanGoNext] = useState(false);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const check = () => {
      setCanGoPrev(el.scrollLeft > 1);
      setCanGoNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", check); ro.disconnect(); };
  }, [tabs]);

  const step = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.75, behavior: "smooth" });
  };

  return (
    <div className="tab-scroll tab-bar" role="tablist">
      {canGoPrev && (
        <button className="button tab-scroll__nav" aria-label="Previous tabs" onClick={() => step(-1)}>
          <Chevron flip />
        </button>
      )}
      <div ref={trackRef} className="tab-scroll__track">
        {tabs.map((tab) => (
          <button
            key={tab}
            className="tab"
            role="tab"
            aria-selected={tab === active}
            onClick={() => onSelect(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      {canGoNext && (
        <button className="button tab-scroll__nav" aria-label="More tabs" onClick={() => step(1)}>
          <Chevron />
        </button>
      )}
    </div>
  );
}

// ── Component ──

export interface PivotExplorerProps {
  data: DataFrame;
  /** Two categorical dimension column names. First is the default groupBy. */
  dimensions: [string, string];
  /** Numeric metric column name (continuous x-axis). */
  metric: string;
}

export function PivotExplorer({ data, dimensions, metric }: PivotExplorerProps) {
  // Default groupBy: the lower-cardinality dimension becomes tabs (fewer tabs),
  // so the higher-cardinality dimension fills the y-axis (more bars per view).
  const defaultGroupBy = useMemo(() => {
    const card0 = unique(data.columns[dimensions[0]] as string[]).length;
    const card1 = unique(data.columns[dimensions[1]] as string[]).length;
    return card0 <= card1 ? dimensions[0] : dimensions[1];
  }, [data, dimensions]);

  const [groupBy, setGroupBy] = useState(defaultGroupBy);
  const [activeTab, setActiveTab] = useState("");
  const [hover, setHover] = useState<HoverEvent | null>(null);
  const [threshold, setThreshold] = useState(0);

  const otherDim = dimensions[0] === groupBy ? dimensions[1] : dimensions[0];

  // Stable label column floor: longest label across both dimensions, capped at truncation limit.
  const minLabelW = useMemo(() => {
    const vals0 = unique(data.columns[dimensions[0]] as string[]);
    const vals1 = unique(data.columns[dimensions[1]] as string[]);
    const maxLen = [...vals0, ...vals1].reduce((max, s) => Math.max(max, s.length), 0);
    return Math.min(maxLen, 18); // capped at --label-max-w token (18ch)
  }, [data, dimensions]);

  // Unique values for tabs (from groupBy column).
  const groupByCol = data.columns[groupBy] as string[];
  const tabValues = useMemo(() => unique(groupByCol), [groupByCol]);
  const resolvedTab = tabValues.includes(activeTab) ? activeTab : tabValues[0];

  // Shared x-axis domain across all tabs for visual comparability.
  const sharedDomain = useMemo(() => {
    const col = data.columns[metric] as Float32Array;
    let max = 0;
    for (let i = 0; i < col.length; i++) {
      if (col[i] > max) max = col[i];
    }
    return niceDomain([0, max]);
  }, [data, metric]);

  // Filter data to rows matching resolvedTab, build PlotSpec.
  const spec = useMemo((): PlotSpec => {
    const gCol = data.columns[groupBy] as string[];
    const oCol = data.columns[otherDim] as string[];
    const mCol = data.columns[metric] as Float32Array;

    const indices: number[] = [];
    const thresholdAbs = threshold * sharedDomain[1];
    for (let i = 0; i < data.length; i++) {
      if (gCol[i] === resolvedTab && mCol[i] >= thresholdAbs) indices.push(i);
    }

    const cat: string[] = new Array(indices.length);
    const val = new Float32Array(indices.length);
    for (let j = 0; j < indices.length; j++) {
      cat[j] = oCol[indices[j]];
      val[j] = mCol[indices[j]];
    }

    return {
      data: { columns: { [NAME_COL]: cat, [metric]: val }, length: indices.length },
      aes: { x: metric, y: NAME_COL, fill: NAME_COL },
      scales: {
        x: { type: "linear", domain: sharedDomain },
      },
      layers: [{ geom: "bar" }],
      width: BAR_W,
      height: { step: STEP },
    };
  }, [data, groupBy, otherDim, metric, resolvedTab, sharedDomain, threshold]);

  const graph = useMemo(
    () => compile(spec),
    [spec],
  );

  return (
    <div style={{ "--plot-label-floor": `${minLabelW}ch` } as React.CSSProperties}>
    <PlotFrame
      spec={spec}
      graph={graph}
      onHover={setHover}
      snapKey={groupBy + "|" + resolvedTab}
      header={<TabBar tabs={tabValues} active={resolvedTab} onSelect={setActiveTab} />}
      canopy={<>
        <div className="stack">
          <div className="text-label color-muted">Group by</div>
          <div className="dropdown">
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
            >
              {dimensions.map((dim) => (
                <option key={dim} value={dim}>{dim}</option>
              ))}
            </select>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
          </div>
        </div>

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
            />
            <StableCounter
              className="gauge"
              value={`${Math.round(threshold * 100)}%`}
              reserve="100%"
            />
          </div>
        </div>
      </>}
    >
      {hover && <PivotTooltip hover={hover} />}
    </PlotFrame>
    </div>
  );
}
