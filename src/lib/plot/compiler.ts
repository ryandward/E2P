/**
 * Plot compiler — PlotSpec → SceneGraph.
 *
 * Pure function. No React, no Canvas, no DOM.
 * Called once per data/spec change. The rAF loop never touches this.
 *
 * Phase 1: implements the full pipeline for geom: "tile" only,
 * emitting RectBuffers with pre-packed RGBA colors.
 */

import type {
  PlotSpec,
  DataFrame,
  AesMapping,
  ScaleSpec,
  DataColumn,
  SceneGraph,
  GeomBuffers,
  RectBuffers,
  ResolvedScales,
  ContinuousScale,
  BandScale,
  ColorScale,
  AxisTick,
} from "./types";
import { linearScale, bandScale, colorScale, type ColorRamp } from "./scales";

// ── Color Packing ──

/**
 * Resolve fill values through a color scale and write into
 * separate R/G/B/A Uint8Arrays. Called once during compile().
 *
 * colorScale.toRGBA() reuses an internal tuple — we copy each
 * result immediately into the byte arrays. Zero intermediate allocation.
 */
export function packColors(
  normalized: Float32Array,
  scale: ColorScale,
  count: number,
): { fillR: Uint8Array; fillG: Uint8Array; fillB: Uint8Array; fillA: Uint8Array } {
  const fillR = new Uint8Array(count);
  const fillG = new Uint8Array(count);
  const fillB = new Uint8Array(count);
  const fillA = new Uint8Array(count);

  for (let i = 0; i < count; i++) {
    const rgba = scale.toRGBA(normalized[i]);
    fillR[i] = rgba[0];
    fillG[i] = rgba[1];
    fillB[i] = rgba[2];
    fillA[i] = rgba[3];
  }

  return { fillR, fillG, fillB, fillA };
}

// ── Stat Resolution (Phase 1: identity only) ──

function applyStat(data: DataFrame): DataFrame {
  // Phase 1: identity transform — pass through unchanged.
  return data;
}

// ── Scale Resolution ──

/**
 * Infer domain from a data column.
 * String columns → unique values in order of appearance.
 * Float32Array columns → [min, max].
 */
function inferDomain(col: DataColumn): [number, number] | string[] {
  if (col instanceof Float32Array) {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < col.length; i++) {
      if (col[i] < min) min = col[i];
      if (col[i] > max) max = col[i];
    }
    if (!isFinite(min)) return [0, 1];
    return [min, max];
  }
  // String array — unique values preserving first occurrence order.
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

/**
 * Resolve a position scale (x or y) from a ScaleSpec and data column.
 *
 * String columns produce BandScale (with gap derived from the existing
 * CELL_STEP / CELL ratio: gap = range_span * (GAP / CELL_STEP) / n,
 * but simpler: we let the caller's pixel range and the domain count
 * determine bandwidth, with a fixed 2px gap matching the design).
 *
 * Numeric columns produce ContinuousScale (linear).
 */
function resolvePositionScale(
  spec: ScaleSpec | undefined,
  col: DataColumn,
  range: [number, number],
): ContinuousScale | BandScale {
  const domain = spec?.domain ?? inferDomain(col);

  if (Array.isArray(domain) && typeof domain[0] === "string") {
    // Band scale for categorical data.
    const gap = 2; // Fixed 2px gap (matches CELL_STEP design).
    return bandScale(domain as string[], range, gap);
  }

  // Continuous scale for numeric data.
  return linearScale(domain as [number, number], range, spec?.clamp ?? false);
}

/**
 * Resolve a color scale from a ScaleSpec and data column.
 * Defaults to "sequential" ramp if not specified.
 */
function resolveColorScale(
  spec: ScaleSpec | undefined,
  col: Float32Array,
): ColorScale {
  const ramp = (spec?.type ?? "sequential") as ColorRamp;
  const domain = (spec?.domain as [number, number] | undefined) ?? inferNumericDomain(col);
  return colorScale(ramp, domain);
}

function inferNumericDomain(col: Float32Array): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < col.length; i++) {
    if (col[i] < min) min = col[i];
    if (col[i] > max) max = col[i];
  }
  if (!isFinite(min)) return [0, 1];
  return [min, max];
}

// ── Geom Emitters ──

/**
 * Emit RectBuffers for geom: "tile".
 *
 * Tiles are axis-aligned rectangles placed at band positions.
 * x and y aesthetics map to band scales. Each data row becomes
 * one rect at (scale_x(row.x), scale_y(row.y)) with width = bandwidth_x,
 * height = bandwidth_y.
 *
 * Fill values are normalized through the domain, then packed into
 * RGBA bytes via packColors. This is the only place the color scale
 * is called — never during paint.
 */
function emitTile(
  data: DataFrame,
  aes: AesMapping,
  scales: ResolvedScales,
  _params: Record<string, unknown> | undefined,
): RectBuffers {
  const count = data.length;
  const xCol = data.columns[aes.x];
  const yCol = data.columns[aes.y];
  const xScale = scales.x;
  const yScale = scales.y;

  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const w = new Float32Array(count);
  const h = new Float32Array(count);
  const dataIndex = new Uint32Array(count);

  // Resolve geometry positions.
  if (xScale.kind === "band" && yScale.kind === "band") {
    // Both axes categorical — the typical heatmap case.
    const bw = xScale.bandwidth;
    const bh = yScale.bandwidth;
    const xArr = xCol as string[];
    const yArr = yCol as string[];

    for (let i = 0; i < count; i++) {
      x[i] = xScale(xArr[i]);
      y[i] = yScale(yArr[i]);
      w[i] = bw;
      h[i] = bh;
      dataIndex[i] = i;
    }
  } else if (xScale.kind === "band") {
    // x categorical, y continuous.
    const bw = xScale.bandwidth;
    const xArr = xCol as string[];
    const yArr = yCol as Float32Array;

    for (let i = 0; i < count; i++) {
      x[i] = xScale(xArr[i]);
      y[i] = (yScale as ContinuousScale)(yArr[i]);
      w[i] = bw;
      h[i] = 1; // 1px height for continuous y — caller should spec tile height via params
      dataIndex[i] = i;
    }
  } else if (yScale.kind === "band") {
    // x continuous, y categorical.
    const bh = yScale.bandwidth;
    const xArr = xCol as Float32Array;
    const yArr = yCol as string[];

    for (let i = 0; i < count; i++) {
      x[i] = (xScale as ContinuousScale)(xArr[i]);
      y[i] = yScale(yArr[i]);
      w[i] = 1;
      h[i] = bh;
      dataIndex[i] = i;
    }
  } else {
    // Both continuous — unusual for tiles but handle it.
    const xArr = xCol as Float32Array;
    const yArr = yCol as Float32Array;

    for (let i = 0; i < count; i++) {
      x[i] = (xScale as ContinuousScale)(xArr[i]);
      y[i] = (yScale as ContinuousScale)(yArr[i]);
      w[i] = 1;
      h[i] = 1;
      dataIndex[i] = i;
    }
  }

  // Resolve fill colors.
  let fillR: Uint8Array;
  let fillG: Uint8Array;
  let fillB: Uint8Array;
  let fillA: Uint8Array;

  if (aes.fill && scales.fill) {
    const fillCol = data.columns[aes.fill] as Float32Array;
    const packed = packColors(fillCol, scales.fill, count);
    fillR = packed.fillR;
    fillG = packed.fillG;
    fillB = packed.fillB;
    fillA = packed.fillA;
  } else {
    // No fill mapping — default to opaque mid-gray.
    fillR = new Uint8Array(count).fill(128);
    fillG = new Uint8Array(count).fill(128);
    fillB = new Uint8Array(count).fill(128);
    fillA = new Uint8Array(count).fill(255);
  }

  return { kind: "rect", count, x, y, w, h, fillR, fillG, fillB, fillA, dataIndex };
}

// ── Geom Dispatch ──

function emitGeom(
  geom: string,
  data: DataFrame,
  aes: AesMapping,
  scales: ResolvedScales,
  params: Record<string, unknown> | undefined,
): GeomBuffers {
  switch (geom) {
    case "tile":
    case "rect":
      return emitTile(data, aes, scales, params);
    default:
      throw new Error(`compile: geom "${geom}" not implemented (Phase 1 supports "tile" only)`);
  }
}

// ── Axis Tick Generation ──

/**
 * Generate tick labels and pixel positions from a resolved position scale.
 * BandScale: one tick per domain value, centered within each band.
 * ContinuousScale: returns empty (numeric ticks not yet implemented).
 */
function buildAxisTicks(scale: ContinuousScale | BandScale): AxisTick[] {
  if (scale.kind === "band") {
    const half = scale.bandwidth / 2;
    return scale.domain.map((label) => ({
      label,
      position: scale(label) + half,
    }));
  }
  return [];
}

// ── Compiler ──

/**
 * Compile a PlotSpec into a SceneGraph.
 *
 * Pure function. No React, no Canvas, no DOM.
 * Resolves stats → scales → geometry buffers with pre-packed RGBA colors.
 *
 * The returned SceneGraph is frozen: typed arrays are final, scales are
 * resolved. The rAF loop interpolates between two SceneGraphs via
 * TweenBuffer, never calling compile() again.
 */
export function compile(spec: PlotSpec): SceneGraph {
  const layers: GeomBuffers[] = [];
  const resolvedScales: Partial<ResolvedScales> = {};

  for (const layerSpec of spec.layers) {
    // 1. Merge per-layer data/aes with plot-level defaults.
    const data = layerSpec.data ?? spec.data;
    const aes: AesMapping = { ...spec.aes, ...layerSpec.aes };

    // 2. Apply stat transformation.
    const transformed = applyStat(data);

    // 3. Resolve scales (lazily — first layer to use a channel creates it).
    const xCol = transformed.columns[aes.x];
    const yCol = transformed.columns[aes.y];

    if (!resolvedScales.x) {
      resolvedScales.x = resolvePositionScale(
        spec.scales?.x,
        xCol,
        [0, spec.width],
      );
    }
    if (!resolvedScales.y) {
      resolvedScales.y = resolvePositionScale(
        spec.scales?.y,
        yCol,
        [0, spec.height],
      );
    }
    if (aes.fill && !resolvedScales.fill) {
      const fillCol = transformed.columns[aes.fill] as Float32Array;
      resolvedScales.fill = resolveColorScale(
        spec.scales?.fill,
        fillCol,
      );
    }

    // 4. Emit geometry buffers.
    const buffers = emitGeom(
      layerSpec.geom,
      transformed,
      aes,
      resolvedScales as ResolvedScales,
      layerSpec.params,
    );
    layers.push(buffers);
  }

  const scales = resolvedScales as ResolvedScales;

  return {
    layers,
    scales,
    axes: {
      x: { ticks: buildAxisTicks(scales.x) },
      y: { ticks: buildAxisTicks(scales.y) },
    },
    width: spec.width,
    height: spec.height,
  };
}
