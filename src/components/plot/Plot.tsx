/**
 * Plot — the React boundary for the E2P visualization engine.
 *
 * usePlot(spec): compiles the spec, diffs scene graphs, sets up
 * TweenBuffers and SpringStates, subscribes to the AnimationTicker.
 * React never re-renders during animation.
 *
 * <Plot>: declarative component. Spec in, canvas out. Hover events
 * are throttled to once per rAF via a pending-event bridge to prevent
 * React from rendering at mousemove frequency.
 */

import {
  useEffect,
  useRef,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";

import { ticker } from "../../lib/AnimationTicker";
import { setupCanvas, getCssVariableAsPx } from "../../lib/canvas";
import { compile } from "../../lib/plot/compiler";
import {
  createTweenBuffer,
  createSpringState,
  stepSprings,
} from "../../lib/plot/springs";
import type {
  TweenBuffer,
  SpringState,
  ChannelDesc,
} from "../../lib/plot/springs";
import { getPainter } from "../../lib/plot/painters";
import { hitTest } from "../../lib/plot/hitTest";
import type { HitResult } from "../../lib/plot/hitTest";
import type { PlotSpec, SceneGraph, GeomBuffers } from "../../lib/plot/types";

// ── Re-export HitResult for consumers ──

export type { HitResult };

// ── Hover Event (dispatched from canvas to React) ──

export interface HoverEvent {
  hit: HitResult;
  /** Canvas-local x in CSS pixels (for tooltip positioning). */
  canvasX: number;
  /** Canvas-local y in CSS pixels. */
  canvasY: number;
}

// ── Build Paint View ──

/**
 * Build a paint-compatible buffer view from the tween's current arrays.
 * Swaps in interpolated geometry (Float32Array from currentF32) and
 * snapped colors (Uint8Array from currentU8).
 *
 * Shallow property copy — O(8) assignments, not O(n).
 */
function buildPaintView(
  layer: GeomBuffers,
  tween: TweenBuffer,
): GeomBuffers {
  // Spread creates a shallow copy. We then overwrite the animated channels.
  const view = { ...layer };
  for (const ch of tween.channels as readonly ChannelDesc[]) {
    if (ch.storage === "f32") {
      (view as Record<string, unknown>)[ch.name] = tween.currentF32[ch.name];
    } else {
      (view as Record<string, unknown>)[ch.name] = tween.currentU8[ch.name];
    }
  }
  return view as GeomBuffers;
}

// ── Render Loop ──

/**
 * Create a render loop that subscribes to the global AnimationTicker.
 *
 * Each frame: step all springs, then batch-paint each layer from the
 * tween's current buffers. Returns a cleanup function that unsubscribes.
 *
 * When all springs settle, the tick function returns false and the
 * ticker auto-unsubscribes — zero idle CPU.
 */
function createRenderLoop(
  canvas: HTMLCanvasElement,
  graph: SceneGraph,
  tweens: TweenBuffer[],
  springs: SpringState[],
  cornerRadius: number,
): () => void {
  let lastTime = 0;

  const tick = (now: number): boolean => {
    if (lastTime === 0) {
      lastTime = now;
      // First frame: paint the initial state without stepping.
      paint();
      return true;
    }

    const dt = (now - lastTime) / 1000;
    lastTime = now;

    // Step all springs.
    let anyAnimating = false;
    for (let i = 0; i < tweens.length; i++) {
      if (!springs[i].settled) {
        if (stepSprings(tweens[i], springs[i], dt)) {
          anyAnimating = true;
        }
      }
    }

    paint();

    // false = auto-unsubscribe (all settled, zero idle CPU).
    return anyAnimating;
  };

  function paint(): void {
    const ctx = setupCanvas(canvas, graph.width, graph.height);
    ctx.clearRect(0, 0, graph.width, graph.height);

    for (let i = 0; i < graph.layers.length; i++) {
      const layer = graph.layers[i];
      const tween = tweens[i];
      const viewBuf = buildPaintView(layer, tween);
      const painter = getPainter(layer.kind);
      painter(ctx, viewBuf, cornerRadius);
    }
  }

  ticker.subscribe(tick);
  return () => ticker.unsubscribe(tick);
}

// ── usePlot Hook ──

interface UsePlotResult {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  graph: SceneGraph | null;
  hitTestAt: (px: number, py: number) => HitResult | null;
}

function usePlot(spec: PlotSpec): UsePlotResult {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Compile: pure function, runs once per spec identity change.
  const graph = useMemo(() => compile(spec), [spec]);

  // Persistent refs that survive across renders.
  const prevGraphRef = useRef<SceneGraph | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Transition effect: diffs old graph vs new, builds tween workspace,
  // starts the render loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prevGraph = prevGraphRef.current;

    // Build tween buffers and spring states for each layer.
    const tweens: TweenBuffer[] = [];
    const springs: SpringState[] = [];

    for (let i = 0; i < graph.layers.length; i++) {
      const prevLayer = prevGraph?.layers[i] ?? null;
      const tween = createTweenBuffer(prevLayer, graph.layers[i]);
      tweens.push(tween);
      springs.push(createSpringState(tween));
    }

    prevGraphRef.current = graph;

    // Tear down previous render loop.
    cleanupRef.current?.();

    // Start new render loop.
    const radius = getCssVariableAsPx("--radius-sm");
    cleanupRef.current = createRenderLoop(canvas, graph, tweens, springs, radius);

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [graph]);

  // Stable hit-test callback — reads current graph from a ref.
  const graphRef = useRef(graph);
  graphRef.current = graph;

  const hitTestAt = useCallback((px: number, py: number): HitResult | null => {
    const g = graphRef.current;
    if (!g) return null;
    return hitTest(g, px, py);
  }, []);

  return { canvasRef, graph, hitTestAt };
}

// ── Plot Component ──

export interface PlotProps {
  spec: PlotSpec;
  /**
   * Called when the hover target changes. Throttled to once per rAF.
   * Receives HitResult + canvas-local CSS pixel coords for tooltip
   * positioning, or null when the cursor leaves all elements.
   */
  onHover?: (event: HoverEvent | null) => void;
  onClick?: (hit: HitResult) => void;
  className?: string;
  /** React children rendered as an overlay (tooltip, annotations). */
  children?: ReactNode;
}

export function Plot({ spec, onHover, onClick, className, children }: PlotProps) {
  const { canvasRef, graph, hitTestAt } = usePlot(spec);

  // ── Throttled hover bridge ──
  // mousemove fires at 60–120+ Hz. We batch: store the latest event
  // in a ref, dispatch to React once per rAF. This prevents React
  // re-renders from outpacing the frame budget.

  // Using `undefined` as sentinel for "no pending event".
  const pendingHover = useRef<HoverEvent | null | undefined>(undefined);
  const rafId = useRef(0);

  // Keep onHover in a ref so the flush callback is stable.
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;

  const flushHover = useCallback(() => {
    rafId.current = 0;
    if (pendingHover.current !== undefined) {
      onHoverRef.current?.(pendingHover.current);
      pendingHover.current = undefined;
    }
  }, []);

  const scheduleHover = useCallback((evt: HoverEvent | null) => {
    pendingHover.current = evt;
    if (!rafId.current) {
      rafId.current = requestAnimationFrame(flushHover);
    }
  }, [flushHover]);

  // Clean up pending rAF on unmount.
  useEffect(() => () => {
    if (rafId.current) cancelAnimationFrame(rafId.current);
  }, []);

  // ── Mouse handlers ──

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!graph) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const scaleX = graph.width / rect.width;
      const scaleY = graph.height / rect.height;
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top) * scaleY;
      const hit = hitTestAt(px, py);

      if (hit) {
        scheduleHover({
          hit,
          canvasX: e.clientX - rect.left,
          canvasY: e.clientY - rect.top,
        });
      } else {
        scheduleHover(null);
      }
    },
    [graph, hitTestAt, scheduleHover],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onClick || !graph) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const scaleX = graph.width / rect.width;
      const scaleY = graph.height / rect.height;
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top) * scaleY;
      const hit = hitTestAt(px, py);
      if (hit) onClick(hit);
    },
    [onClick, graph, hitTestAt],
  );

  const handleMouseLeave = useCallback(() => {
    scheduleHover(null);
  }, [scheduleHover]);

  return (
    <div
      className="anchor"
      style={{ width: graph?.width ?? 0, height: graph?.height ?? 0 }}
    >
      <canvas
        ref={canvasRef}
        className={className}
        style={{ width: graph?.width ?? 0, height: graph?.height ?? 0 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />
      {children}
    </div>
  );
}
