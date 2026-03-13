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
  ColorScaleType,
  AxisTick,
} from "./types";
import { linearScale, bandScale, colorScale } from "./scales";

// ── Resolved Channel ──

/**
 * Bundles a resolved position scale with the data column that produced it.
 *
 * This discriminated union encodes the invariant that band scales always
 * pair with string[] columns and continuous scales with Float32Array columns.
 * Downstream consumers switch on `kind` to narrow both simultaneously,
 * eliminating unsafe casts in geometry emission.
 */
type ResolvedChannel =
  | { kind: "band"; scale: BandScale; col: string[] }
  | { kind: "continuous"; scale: ContinuousScale; col: Float32Array };

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
 * Infer a numeric domain [min, max] from a Float32Array column.
 */
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

/**
 * Infer a categorical domain from a string[] column.
 * Unique values in order of first appearance.
 */
function inferCategoricalDomain(col: string[]): string[] {
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
 * Resolve a position channel (x or y) from a ScaleSpec and data column.
 *
 * The column's runtime type determines the scale kind:
 *   Float32Array → ContinuousScale (linear)
 *   string[]     → BandScale (categorical, fixed 2px gap)
 *
 * Returns a ResolvedChannel that bundles the scale and column under
 * a single discriminant, preserving their correlation for downstream use.
 */
function resolvePositionChannel(
  spec: ScaleSpec | undefined,
  col: DataColumn,
  range: [number, number],
): ResolvedChannel {
  if (col instanceof Float32Array) {
    const domain =
      (spec?.domain as [number, number] | undefined) ?? inferNumericDomain(col);
    return {
      kind: "continuous",
      scale: linearScale(domain, range, spec?.clamp ?? false),
      col,
    };
  }

  // String column → band scale for categorical data.
  const domain =
    (spec?.domain as string[] | undefined) ?? inferCategoricalDomain(col);
  const gap = 2; // Fixed 2px gap (matches CELL_STEP design).
  return {
    kind: "band",
    scale: bandScale(domain, range, gap),
    col,
  };
}

/**
 * Resolve a color scale from a ScaleSpec and data column.
 * Defaults to "sequential" ramp if not specified.
 */
function resolveColorScale(
  spec: ScaleSpec | undefined,
  col: Float32Array,
): ColorScale {
  const ramp = (spec?.type ?? "sequential") as ColorScaleType;
  const domain = (spec?.domain as [number, number] | undefined) ?? inferNumericDomain(col);
  return colorScale(ramp, domain);
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
  xCh: ResolvedChannel,
  yCh: ResolvedChannel,
  fillScale: ColorScale | undefined,
  _params: Record<string, unknown> | undefined,
): RectBuffers {
  const count = data.length;

  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const w = new Float32Array(count);
  const h = new Float32Array(count);
  const dataIndex = new Uint32Array(count);

  // Resolve geometry positions.
  // Nested checks on xCh.kind / yCh.kind give TypeScript full narrowing
  // of both scale and column types — zero casts needed.
  if (xCh.kind === "band") {
    const bw = xCh.scale.bandwidth;
    if (yCh.kind === "band") {
      // Both axes categorical — the typical heatmap case.
      const bh = yCh.scale.bandwidth;
      for (let i = 0; i < count; i++) {
        x[i] = xCh.scale(xCh.col[i]);
        y[i] = yCh.scale(yCh.col[i]);
        w[i] = bw;
        h[i] = bh;
        dataIndex[i] = i;
      }
    } else {
      // x categorical, y continuous.
      for (let i = 0; i < count; i++) {
        x[i] = xCh.scale(xCh.col[i]);
        y[i] = yCh.scale(yCh.col[i]);
        w[i] = bw;
        h[i] = 1; // 1px height for continuous y — caller should spec tile height via params
        dataIndex[i] = i;
      }
    }
  } else {
    if (yCh.kind === "band") {
      // x continuous, y categorical.
      const bh = yCh.scale.bandwidth;
      for (let i = 0; i < count; i++) {
        x[i] = xCh.scale(xCh.col[i]);
        y[i] = yCh.scale(yCh.col[i]);
        w[i] = 1;
        h[i] = bh;
        dataIndex[i] = i;
      }
    } else {
      // Both continuous — unusual for tiles but handle it.
      for (let i = 0; i < count; i++) {
        x[i] = xCh.scale(xCh.col[i]);
        y[i] = yCh.scale(yCh.col[i]);
        w[i] = 1;
        h[i] = 1;
        dataIndex[i] = i;
      }
    }
  }

  // Resolve fill colors.
  let fillR: Uint8Array;
  let fillG: Uint8Array;
  let fillB: Uint8Array;
  let fillA: Uint8Array;

  if (aes.fill && fillScale) {
    const fillCol = data.columns[aes.fill] as Float32Array;
    const packed = packColors(fillCol, fillScale, count);
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
  xCh: ResolvedChannel,
  yCh: ResolvedChannel,
  fillScale: ColorScale | undefined,
  params: Record<string, unknown> | undefined,
): GeomBuffers {
  switch (geom) {
    case "tile":
    case "rect":
      return emitTile(data, aes, xCh, yCh, fillScale, params);
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
  let xChannel: ResolvedChannel | undefined;
  let yChannel: ResolvedChannel | undefined;
  let fillScale: ColorScale | undefined;

  for (const layerSpec of spec.layers) {
    // 1. Merge per-layer data/aes with plot-level defaults.
    const data = layerSpec.data ?? spec.data;
    const aes: AesMapping = { ...spec.aes, ...layerSpec.aes };

    // 2. Apply stat transformation.
    const transformed = applyStat(data);

    // 3. Resolve channels (lazily — first layer to use a channel creates it).
    const xCol = transformed.columns[aes.x];
    const yCol = transformed.columns[aes.y];

    if (!xChannel) {
      xChannel = resolvePositionChannel(spec.scales?.x, xCol, [0, spec.width]);
    }
    if (!yChannel) {
      yChannel = resolvePositionChannel(spec.scales?.y, yCol, [0, spec.height]);
    }
    if (aes.fill && !fillScale) {
      const fillCol = transformed.columns[aes.fill] as Float32Array;
      fillScale = resolveColorScale(spec.scales?.fill, fillCol);
    }

    // 4. Emit geometry buffers.
    const buffers = emitGeom(
      layerSpec.geom,
      transformed,
      aes,
      xChannel,
      yChannel,
      fillScale,
      layerSpec.params,
    );
    layers.push(buffers);
  }

  if (!xChannel || !yChannel) {
    throw new Error("compile: spec must have at least one layer to resolve scales");
  }

  const scales: ResolvedScales = {
    x: xChannel.scale,
    y: yChannel.scale,
    fill: fillScale,
  };

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
