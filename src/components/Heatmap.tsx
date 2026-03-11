import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { FadeTransition, StableCounter } from "stablekit.ts";
import { ticker } from "../lib/AnimationTicker";
import { setupCanvas } from "../lib/canvas";
import { useScrollSnap } from "../hooks/useScrollSnap";
import { SpringAnimator } from "../lib/SpringAnimator";

// ── Geometry ──

export const CELL = 32;
export const GAP = 2;
export const CELL_STEP = CELL + GAP;

// ── Tabs ──

export const HEATMAP_TABS = ["correlation", "raw"] as const;
export type HeatmapTab = (typeof HEATMAP_TABS)[number];
export const TAB_LABELS: Record<HeatmapTab, string> = { correlation: "Correlation", raw: "Raw Values" };

// ── Control spec ──

interface RangeControl {
  type: "range";
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  reserve: string;
  onChange: (value: number) => void;
}

interface SelectControl {
  type: "select";
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}

interface MetricControl {
  type: "metric";
  label: string;
  value: string;
  reserve: string;
}

export type HeatmapControl = RangeControl | SelectControl | MetricControl;

// ── Legend spec ──

export interface HeatmapLegend {
  low: string;
  high: string;
  caption: string;
  /** CSS class for the gradient bar (e.g. "heatmap-legend__gradient--seq") */
  gradientClass?: string;
}

// ── Tooltip data (returned by chapter formatters) ──

export interface HeatmapTooltipData {
  title: string;
  rows: { label: string; value: string }[];
  secondary?: string;
}

// ── Panel spec ──

export interface HeatmapPanel {
  tab: HeatmapTab;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasWidth: number;
  canvasHeight: number;
  rowLabels: { key: string; label: ReactNode }[];
  legend: HeatmapLegend;
  caption?: ReactNode;
  /** Return tooltip content for a cell, or null to suppress. */
  onCellHover?: (row: number, col: number) => HeatmapTooltipData | null;
  /** Cell click handler. */
  onCellClick?: (row: number, col: number) => void;
  mask?: (row: number, col: number) => boolean;
  /** Called when this panel's tab becomes active. */
  onBecomeActive?: () => void;
}

// ── Main component props ──

export interface HeatmapProps {
  header?: ReactNode;
  columns: { key: string; label: string }[];
  columnLabelHeight: number;
  longestRowLabel: string;
  loading: boolean;
  panels: HeatmapPanel[];
  controls: HeatmapControl[];
  hint?: string;
}

// ── Heatmap component ──

export function Heatmap({
  header,
  columns,
  columnLabelHeight,
  longestRowLabel,
  loading,
  panels,
  controls,
  hint,
}: HeatmapProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const tabGroupRef = useRef<HTMLDivElement>(null);
  const [frameScale, setFrameScale] = useState(1);
  const [activeTab, setActiveTab] = useState<HeatmapTab>(HEATMAP_TABS[0]);

  const cellsW = columns.length * CELL_STEP;
  const activePanel = panels.find((p) => p.tab === activeTab) ?? panels[0];
  const legend = activePanel.legend;

  const [snapTrigger, setSnapTrigger] = useState(0);
  const requestSnap = useCallback(() => setSnapTrigger((n) => n + 1), []);
  useScrollSnap(tabGroupRef, activeTab + "|" + snapTrigger);

  // Replay spring animation when tab switches
  const prevTabRef = useRef(activeTab);
  useEffect(() => {
    if (prevTabRef.current !== activeTab) {
      prevTabRef.current = activeTab;
      activePanel.onBecomeActive?.();
    }
  }, [activeTab, activePanel]);

  // Shrink frame to fit available width.
  // scrollWidth is unaffected by CSS zoom (returns intrinsic width), so this
  // is naturally stable: intrinsic never changes, only available width changes.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const parent = frame.parentElement;
    if (!parent) return;

    const ro = new ResizeObserver(() => {
      const available = parent.clientWidth;
      const intrinsic = frame.scrollWidth;
      setFrameScale(intrinsic > available ? available / intrinsic : 1);
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={frameRef}
      className="canvas-frame viz-frame"
      style={{
        zoom: frameScale < 1 ? frameScale : undefined,
        "--frame-zoom": frameScale < 1 ? frameScale : undefined,
      } as React.CSSProperties}
    >
      {header && <div className="canvas-frame__header">{header}</div>}
      {header && <hr />}
      <div className="sidebar">
      {/* ── Left column: tab-group grid ── */}
      <div
        ref={tabGroupRef}
        className="tab-grid tab-group"
        data-active-tab={activeTab}
        style={{ "--tab-grid-data-col": `calc(${cellsW}px + var(--space-element) * 2)` } as React.CSSProperties}
      >
        {/* Sticky header: tabs + column labels */}
        <div className="tab-grid__header tab-group__sticky-header">
          <div className="cluster tab-grid__bar" role="tablist">
            {HEATMAP_TABS.map((tab) => (
              <button
                key={tab}
                className="tab-group__tab"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
          {/* Reserve: sizes auto column for longest label across all tabs */}
          <StableCounter
            value=""
            reserve={longestRowLabel}
            className="tab-group__reserve"
          />
          {/* Shared column labels */}
          <div className="tab-grid__columns" style={{ height: columnLabelHeight }}>
            {columns.map((col) => (
              <div
                key={col.key}
                className="axis-label__cell"
                style={{
                  width: CELL_STEP,
                  "--col-center": `${CELL / 2}px`,
                } as React.CSSProperties}
              >
                <span className="axis-label axis-label--col">
                  {col.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Panels */}
        {panels.map((panel) => (
          <HeatmapPanelView key={panel.tab} panel={panel} cellsW={cellsW} cols={columns.length} />
        ))}
      </div>

      {/* ── Right column: canopy ── */}
      <div className="sticky-panel canopy">
        <div className="canopy__section">
          <div className="canopy__label">Color Scale</div>
          <div className="legend-bar heatmap-legend">
            <span className="heatmap-legend__label">{legend.low}</span>
            <div className={`legend-bar__fill heatmap-legend__gradient${legend.gradientClass ? ` ${legend.gradientClass}` : ""}`} />
            <span className="heatmap-legend__label">{legend.high}</span>
          </div>
          <span className="heatmap-legend__caption">{legend.caption}</span>
        </div>

        {controls.map((ctrl) => (
          <CanopyControl key={ctrl.label} control={ctrl} onCommit={requestSnap} />
        ))}

        {hint && (
          <p className="text-caption color-muted">{hint}</p>
        )}
      </div>
      </div>
    </div>
  );
}

// ── Panel renderer ──

function HeatmapPanelView({ panel, cellsW, cols }: { panel: HeatmapPanel; cellsW: number; cols: number }) {
  const lastCellRef = useRef<{ row: number; col: number } | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; data: HeatmapTooltipData } | null>(null);

  const interactive = !!(panel.onCellHover || panel.onCellClick);

  function hitTest(e: React.MouseEvent<HTMLCanvasElement>): { row: number; col: number } | null {
    const rect = e.currentTarget.getBoundingClientRect();
    const zoom = rect.width / panel.canvasWidth;
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    const col = Math.floor(x / CELL_STEP);
    const row = Math.floor(y / CELL_STEP);
    const rows = Math.floor(panel.canvasHeight / CELL_STEP);
    if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
    const cellX = x - col * CELL_STEP;
    const cellY = y - row * CELL_STEP;
    if (cellX > CELL || cellY > CELL) return null;
    if (panel.mask && !panel.mask(row, col)) return null;
    return { row, col };
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!panel.onCellHover) return;
    const hit = hitTest(e);
    if (!hit) {
      if (lastCellRef.current) { lastCellRef.current = null; setTip(null); }
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const zoom = rect.width / panel.canvasWidth;
    const mx = (e.clientX - rect.left) / zoom;
    const my = (e.clientY - rect.top) / zoom;
    if (lastCellRef.current?.row === hit.row && lastCellRef.current?.col === hit.col) {
      setTip((prev) => prev ? { ...prev, x: mx + 16, y: my - 8 } : prev);
      return;
    }
    lastCellRef.current = hit;
    const data = panel.onCellHover(hit.row, hit.col);
    if (data) {
      setTip({ x: mx + 16, y: my - 8, data });
    } else {
      setTip(null);
    }
  }

  function handleMouseLeave() {
    lastCellRef.current = null;
    setTip(null);
  }

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!panel.onCellClick) return;
    const hit = hitTest(e);
    if (hit) panel.onCellClick(hit.row, hit.col);
  }

  return (
    <>
      {/* Row labels (col 1) */}
      <div className="tab-grid__labels" data-tab={panel.tab}>
        {panel.rowLabels.map((row) => (
          <div
            key={row.key}
            className="axis-label axis-label--row"
            style={{ height: CELL_STEP }}
          >
            {row.label}
          </div>
        ))}
      </div>
      {/* Canvas (col 2) */}
      <div data-tab={panel.tab}>
        <div className="heatmap-panel__canvas-wrapper">
          <canvas
            ref={panel.canvasRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
            data-interactive={interactive ? "" : undefined}
            style={{ width: panel.canvasWidth, height: panel.canvasHeight }}
          />
          <HeatmapTooltip
            show={!!tip}
            x={tip?.x ?? 0}
            y={tip?.y ?? 0}
            title={tip?.data.title ?? ""}
            rows={tip?.data.rows ?? []}
            secondary={tip?.data.secondary}
            containerW={panel.canvasWidth}
            containerH={panel.canvasHeight}
          />
        </div>
        {panel.caption}
      </div>
    </>
  );
}

// ── Canopy control renderer ──

function CanopyControl({ control, onCommit }: { control: HeatmapControl; onCommit: () => void }) {
  if (control.type === "select") {
    return (
      <div className="canopy__section">
        <div className="canopy__label">{control.label}</div>
        <div className="canopy__select-wrapper">
          <select
            className="canopy__select"
            value={control.value}
            onChange={(e) => { control.onChange(e.target.value); onCommit(); }}
          >
            {control.options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <svg className="canopy__select-icon" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    );
  }

  if (control.type === "range") {
    return (
      <div className="canopy__section">
        <div className="canopy__label">{control.label}</div>
        <div className="control-grid canopy__params">
          <input
            type="range"
            min={control.min}
            max={control.max}
            step={control.step}
            value={control.value}
            onChange={(e) => control.onChange(Number(e.target.value))}
            onPointerUp={onCommit}
          />
          <StableCounter className="canopy__param-value" value={control.display} reserve={control.reserve} />
        </div>
      </div>
    );
  }

  if (control.type === "metric") {
    return (
      <div className="canopy__section">
        <div className="canopy__label">{control.label}</div>
        <StableCounter className="canopy__metric" value={control.value} reserve={control.reserve} />
      </div>
    );
  }

  return null;
}

// ── Animated grid (imperative canvas engine) ──

export interface GridConfig {
  maxSlots: number;
  cols: number;
  widthPx: number;
  colorFn: (t: number) => string;
  cell?: number;
  gap?: number;
  /** Per-cell visibility mask (for triangular grids). */
  mask?: (row: number, col: number) => boolean;
}

export function AnimatedGrid(config: GridConfig) {
  const {
    maxSlots,
    cols,
    widthPx,
    colorFn,
    cell = CELL,
    gap = GAP,
    mask,
  } = config;
  const step = cell + gap;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animatorRef = useRef<SpringAnimator | null>(null);
  const activeRowsRef = useRef(0);
  const lastNormalizedRef = useRef<number[]>([]);
  const pulseTickRef = useRef<((now: number) => boolean) | null>(null);
  const flashRef = useRef<{ row: number; col: number; scale: number; vel: number } | null>(null);
  const flashTickRef = useRef<((now: number) => boolean) | null>(null);

  const paint = useCallback((positions: Float64Array) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rows = activeRowsRef.current;
    if (rows === 0) return;
    const h = rows * step;
    const ctx = setupCanvas(canvas, widthPx, h);
    ctx.clearRect(0, 0, widthPx, h);

    const flash = flashRef.current;

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        if (mask && !mask(i, j)) continue;
        const t = positions[i * cols + j];
        ctx.fillStyle = colorFn(t);
        ctx.beginPath();
        if (flash && flash.row === i && flash.col === j) {
          const sz = cell * flash.scale;
          const off = (cell - sz) / 2;
          ctx.roundRect(j * step + off, i * step + off, sz, sz, 3);
        } else {
          ctx.roundRect(j * step, i * step, cell, cell, 3);
        }
        ctx.fill();
      }
    }
  }, []);

  useEffect(() => {
    animatorRef.current = new SpringAnimator(maxSlots, paint);
    return () => {
      animatorRef.current?.dispose();
      if (pulseTickRef.current) ticker.unsubscribe(pulseTickRef.current);
      if (flashTickRef.current) ticker.unsubscribe(flashTickRef.current);
    };
  }, [paint]);

  return {
    canvasRef,
    setNormalized(values: number[], rowCount: number) {
      if (pulseTickRef.current) {
        ticker.unsubscribe(pulseTickRef.current);
        pulseTickRef.current = null;
      }
      activeRowsRef.current = rowCount;
      if (!animatorRef.current) return;
      lastNormalizedRef.current = values.slice();
      const padded = values.slice();
      while (padded.length < maxSlots) padded.push(0);
      animatorRef.current.setNormalized(padded);
    },
    startPulse(rows: number) {
      if (pulseTickRef.current) {
        ticker.unsubscribe(pulseTickRef.current);
      }
      activeRowsRef.current = rows;

      const base = lastNormalizedRef.current;
      const hasBase = base.length > 0;
      const startTime = performance.now();
      const targets: number[] = new Array(maxSlots).fill(0);

      const tick = (now: number): boolean => {
        if (!animatorRef.current) return false;
        const elapsed = (now - startTime) / 1000;
        for (let i = 0; i < rows; i++) {
          for (let j = 0; j < cols; j++) {
            const idx = i * cols + j;
            const phase = i * 0.3 + j * 0.5 + elapsed * 3.0;
            const wave = Math.sin(phase) * 0.5 + 0.5;
            if (hasBase && idx < base.length) {
              targets[idx] = base[idx] * (0.6 + 0.4 * wave);
            } else {
              targets[idx] = 0.05 + 0.10 * wave;
            }
          }
        }
        animatorRef.current.setNormalized(targets);
        return true;
      };

      pulseTickRef.current = tick;
      ticker.subscribe(tick);
    },
    stopPulse() {
      if (pulseTickRef.current) {
        ticker.unsubscribe(pulseTickRef.current);
        pulseTickRef.current = null;
      }
    },
    flashCell(row: number, col: number) {
      if (flashTickRef.current) ticker.unsubscribe(flashTickRef.current);
      flashRef.current = { row, col, scale: 1, vel: 6 };
      let lastTime = 0;
      const tick = (now: number): boolean => {
        const f = flashRef.current;
        if (!f) return false;
        if (lastTime === 0) { lastTime = now; return true; }
        const dt = Math.min((now - lastTime) / 1000, 0.064);
        lastTime = now;
        const displacement = 1 - f.scale;
        f.vel += (180 * displacement - 14 * f.vel) * dt;
        f.scale += f.vel * dt;
        if (Math.abs(f.vel) < 0.01 && Math.abs(displacement) < 0.005) {
          flashRef.current = null;
        }
        animatorRef.current?.repaint();
        return !!flashRef.current;
      };
      flashTickRef.current = tick;
      ticker.subscribe(tick);
    },
    replay(origin?: number) {
      animatorRef.current?.replay(origin);
    },
  };
}

// ── Tooltip ──

interface HeatmapTooltipRow {
  label: string;
  value: string;
}

interface HeatmapTooltipProps {
  show: boolean;
  x: number;
  y: number;
  title: string;
  rows: HeatmapTooltipRow[];
  secondary?: string;
  containerW: number;
  containerH: number;
}

export function formatSigned(n: number, decimals = 2): string {
  const prefix = n >= 0 ? "+" : "";
  return `${prefix}${n.toFixed(decimals)}`;
}

const TIP_GAP = 12;

export function HeatmapTooltip({ show, x, y, title, rows, secondary, containerW, containerH }: HeatmapTooltipProps) {
  const tipRef = useRef<HTMLDivElement>(null);
  const lastPos = useRef({ x, y });
  const lastContent = useRef({ title, rows, secondary });
  if (show) {
    lastPos.current = { x, y };
    lastContent.current = { title, rows, secondary };
  }

  const pos = lastPos.current;
  const content = lastContent.current;

  // Measure and flip: prefer right+above cursor, flip on overflow
  const el = tipRef.current;
  const tipW = el?.offsetWidth ?? 0;
  const tipH = el?.offsetHeight ?? 0;

  let left: number;
  if (pos.x + TIP_GAP + tipW <= containerW) {
    left = pos.x + TIP_GAP;
  } else if (pos.x - TIP_GAP - tipW >= 0) {
    left = pos.x - TIP_GAP - tipW;
  } else {
    left = Math.max(0, containerW - tipW);
  }

  let top: number;
  if (pos.y - TIP_GAP - tipH >= 0) {
    top = pos.y - TIP_GAP - tipH;
  } else if (pos.y + TIP_GAP + tipH <= containerH) {
    top = pos.y + TIP_GAP;
  } else {
    top = Math.max(0, containerH - tipH);
  }

  return (
    <FadeTransition
      ref={tipRef}
      show={show}
      className="data-tooltip heatmap-tooltip"
      style={{ left, top }}
    >
      <div className="heatmap-tooltip__title">{content.title}</div>
      {content.rows.map((row) => (
        <div key={row.label}>
          {row.label}: <strong>{row.value}</strong>
        </div>
      ))}
      {content.secondary && <div className="heatmap-tooltip__secondary">{content.secondary}</div>}
    </FadeTransition>
  );
}
