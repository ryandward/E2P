/**
 * Geometry-aware hit testing.
 *
 * Each geom buffer kind has its own spatial math — rects do AABB,
 * points do closest-within-radius, paths do segment distance.
 * The top-level hitTest() iterates layers back-to-front, delegates
 * to the right tester, and resolves data-space coordinates via
 * scale inversion.
 */

import type {
  SceneGraph,
  GeomBuffers,
  RectBuffers,
  PointBuffers,
  PathBuffers,
} from "./types";

type HitTestFn = (px: number, py: number, buffers: GeomBuffers) => number;

// ── Hit Result ──

export interface HitResult {
  layerIndex: number;
  elementIndex: number;
  dataIndex: number;
  /** Data-space x coordinate (inverse-projected through scale). */
  dataX: number | string;
  /** Data-space y coordinate (inverse-projected through scale). */
  dataY: number | string;
}

// ── Per-Geom Hit Testers ──

/**
 * AABB containment test for rects.
 * Iterates back-to-front — returns the topmost hit.
 * Skips fully transparent elements.
 */
function hitTestRects(px: number, py: number, buffers: RectBuffers): number {
  const { count, x, y, w, h, fillA } = buffers;
  for (let i = count - 1; i >= 0; i--) {
    if (fillA[i] === 0) continue;
    if (px >= x[i] && px < x[i] + w[i] && py >= y[i] && py < y[i] + h[i]) {
      return i;
    }
  }
  return -1;
}

/**
 * Closest-within-radius test for points.
 * Returns the nearest visible point whose center is within its radius
 * of the cursor.
 */
function hitTestPoints(px: number, py: number, buffers: PointBuffers): number {
  const { count, cx, cy, r, fillA } = buffers;
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < count; i++) {
    if (fillA[i] === 0) continue;
    const dx = px - cx[i];
    const dy = py - cy[i];
    const dist = dx * dx + dy * dy;
    const ri = r[i];
    if (dist <= ri * ri && dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/**
 * Squared distance from point (px, py) to line segment (ax, ay)–(bx, by).
 */
function segmentDistSq(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = px - ax;
    const ey = py - ay;
    return ex * ex + ey * ey;
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  const ex = px - projX;
  const ey = py - projY;
  return ex * ex + ey * ey;
}

/**
 * Line proximity test for paths.
 * Returns the closest visible series within a 6px tolerance.
 */
function hitTestPaths(px: number, py: number, buffers: PathBuffers): number {
  const { x, y, seriesOffset, seriesCount, fillA } = buffers;
  const tol2 = 36; // 6px tolerance squared
  let best = -1;
  let bestDist = Infinity;

  for (let s = 0; s < seriesCount; s++) {
    if (fillA[s] === 0) continue;
    const start = seriesOffset[s];
    const end = seriesOffset[s + 1];
    for (let v = start; v < end - 1; v++) {
      const dist2 = segmentDistSq(px, py, x[v], y[v], x[v + 1], y[v + 1]);
      if (dist2 <= tol2 && dist2 < bestDist) {
        bestDist = dist2;
        best = s;
      }
    }
  }
  return best;
}

// ── Tester Registry ──

const hitTesters: Record<GeomBuffers["kind"], HitTestFn> = {
  rect: hitTestRects as HitTestFn,
  point: hitTestPoints as HitTestFn,
  path: hitTestPaths as HitTestFn,
};

// ── Data-Space Coordinate Resolution ──

/**
 * Given a pixel coordinate and a resolved position scale, invert
 * back to the data-space value.
 */
function invertPosition(
  scale: SceneGraph["scales"]["x"],
  pixel: number,
): number | string {
  if (scale.kind === "band") {
    const idx = scale.invertIndex(pixel);
    return scale.domain[idx];
  }
  return scale.invert(pixel);
}

/**
 * Extract the x/y pixel position from a hit element, given its buffer kind.
 */
function getElementPosition(buf: GeomBuffers, idx: number): { px: number; py: number } {
  switch (buf.kind) {
    case "rect":
      return { px: buf.x[idx], py: buf.y[idx] };
    case "point":
      return { px: buf.cx[idx], py: buf.cy[idx] };
    case "path":
      return { px: buf.x[idx], py: buf.y[idx] };
  }
}

// ── Top-Level Hit Test ──

/**
 * Hit-test a SceneGraph at canvas-local pixel coordinates.
 *
 * Iterates layers back-to-front. Delegates to the geometry-specific
 * tester. On hit, resolves data-space coordinates via scale inversion.
 *
 * Returns null if nothing is hit.
 */
export function hitTest(
  graph: SceneGraph,
  px: number,
  py: number,
): HitResult | null {
  for (let l = graph.layers.length - 1; l >= 0; l--) {
    const buf = graph.layers[l];
    const tester = hitTesters[buf.kind];
    const idx = tester(px, py, buf);
    if (idx === -1) continue;

    const { px: elemX, py: elemY } = getElementPosition(buf, idx);
    const dataX = invertPosition(graph.scales.x, elemX);
    const dataY = invertPosition(graph.scales.y, elemY);

    return {
      layerIndex: l,
      elementIndex: idx,
      dataIndex: buf.dataIndex[idx],
      dataX,
      dataY,
    };
  }
  return null;
}
