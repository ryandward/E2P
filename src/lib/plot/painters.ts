/**
 * Batch painters — geom-specific canvas rendering.
 *
 * Each painter takes a CanvasRenderingContext2D and the geom's typed
 * buffers. Colors come from pre-packed Uint8Array RGBA channels —
 * zero color scale calls at paint time.
 *
 * Phase 1: paintRects only. Phase 2+ adds paintPoints, paintPaths.
 */

import type { RectBuffers, PointBuffers, PathBuffers, GeomBuffers } from "./types";

// ── Paint Function Signature ──

type PaintFn = (
  ctx: CanvasRenderingContext2D,
  buffers: GeomBuffers,
  cornerRadius: number,
) => void;

// ── Rect Painter ──

/**
 * Paint all rects in a single tight loop.
 *
 * Reads spatial data from Float32Array (x, y, w, h).
 * Constructs fillStyle directly from Uint8Array color channels.
 * Skips fully transparent elements (fillA === 0).
 */
function paintRects(
  ctx: CanvasRenderingContext2D,
  buffers: GeomBuffers,
  cornerRadius: number,
): void {
  const buf = buffers as RectBuffers;
  const { count, x, y, w, h, fillR, fillG, fillB, fillA } = buf;

  for (let i = 0; i < count; i++) {
    const a = fillA[i];
    if (a === 0) continue;
    ctx.fillStyle = `rgba(${fillR[i]},${fillG[i]},${fillB[i]},${a / 255})`;
    ctx.beginPath();
    ctx.roundRect(x[i], y[i], w[i], h[i], cornerRadius);
    ctx.fill();
  }
}

// ── Point Painter (stub — Phase 2+) ──

function paintPoints(
  ctx: CanvasRenderingContext2D,
  buffers: GeomBuffers,
  _cornerRadius: number,
): void {
  const buf = buffers as PointBuffers;
  const { count, cx, cy, r, fillR, fillG, fillB, fillA } = buf;

  for (let i = 0; i < count; i++) {
    const a = fillA[i];
    if (a === 0) continue;
    ctx.fillStyle = `rgba(${fillR[i]},${fillG[i]},${fillB[i]},${a / 255})`;
    ctx.beginPath();
    ctx.arc(cx[i], cy[i], r[i], 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Path Painter (stub — Phase 2+) ──

function paintPaths(
  ctx: CanvasRenderingContext2D,
  buffers: GeomBuffers,
  _cornerRadius: number,
): void {
  const buf = buffers as PathBuffers;
  const { x, y, seriesOffset, seriesCount, fillR, fillG, fillB, fillA } = buf;

  for (let s = 0; s < seriesCount; s++) {
    const a = fillA[s];
    if (a === 0) continue;
    ctx.fillStyle = `rgba(${fillR[s]},${fillG[s]},${fillB[s]},${a / 255})`;
    ctx.beginPath();
    const start = seriesOffset[s];
    const end = seriesOffset[s + 1];
    ctx.moveTo(x[start], y[start]);
    for (let v = start + 1; v < end; v++) {
      ctx.lineTo(x[v], y[v]);
    }
    ctx.fill();
  }
}

// ── Painter Registry ──

const painters: Record<GeomBuffers["kind"], PaintFn> = {
  rect: paintRects,
  point: paintPoints,
  path: paintPaths,
};

/**
 * Look up the batch painter for a given geom buffer kind.
 */
export function getPainter(kind: GeomBuffers["kind"]): PaintFn {
  return painters[kind];
}
