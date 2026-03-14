/**
 * Plot compiler — PlotSpec → SceneGraph.
 *
 * Pure function. No React, no Canvas, no DOM.
 * Called once per data/spec change. The rAF loop never touches this.
 *
 * Supports geom: "tile" (heatmap cells) and "bar" (horizontal/vertical bars).
 */

import type {
  PlotSpec,
  DimensionSpec,
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
  OrdinalColorScale,
  FillScale,
  ColorScaleType,
  AxisTick,
} from "./types";
import { linearScale, bandScale, colorScale, ordinalColorScale, DEFAULT_ORDINAL_COLORS } from "./scales";

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

type FillChannels = {
  fillR: Uint8Array;
  fillG: Uint8Array;
  fillB: Uint8Array;
  fillA: Uint8Array;
};

/**
 * Pack continuous fill values through a ColorScale into RGBA byte arrays.
 * colorScale.toRGBA() reuses an internal tuple — we copy each
 * result immediately. Zero intermediate allocation.
 */
export function packColors(
  col: Float32Array,
  scale: ColorScale,
  count: number,
): FillChannels {
  const fillR = new Uint8Array(count);
  const fillG = new Uint8Array(count);
  const fillB = new Uint8Array(count);
  const fillA = new Uint8Array(count);

  for (let i = 0; i < count; i++) {
    const rgba = scale.toRGBA(col[i]);
    fillR[i] = rgba[0];
    fillG[i] = rgba[1];
    fillB[i] = rgba[2];
    fillA[i] = rgba[3];
  }

  return { fillR, fillG, fillB, fillA };
}

/**
 * Pack categorical fill values through an OrdinalColorScale into RGBA byte arrays.
 */
function packOrdinalColors(
  col: string[],
  scale: OrdinalColorScale,
  count: number,
): FillChannels {
  const fillR = new Uint8Array(count);
  const fillG = new Uint8Array(count);
  const fillB = new Uint8Array(count);
  const fillA = new Uint8Array(count);

  for (let i = 0; i < count; i++) {
    const rgba = scale.toRGBA(col[i]);
    fillR[i] = rgba[0];
    fillG[i] = rgba[1];
    fillB[i] = rgba[2];
    fillA[i] = rgba[3];
  }

  return { fillR, fillG, fillB, fillA };
}

/**
 * Resolve fill colors for a geom layer. Dispatches to the correct
 * packing function based on the fill scale's kind.
 */
function resolveFillColors(
  data: DataFrame,
  aes: AesMapping,
  fillScale: FillScale | undefined,
  count: number,
): FillChannels {
  if (aes.fill && fillScale) {
    const fillCol = data.columns[aes.fill];
    if (fillScale.kind === "ordinal-color") {
      return packOrdinalColors(fillCol as string[], fillScale, count);
    }
    return packColors(fillCol as Float32Array, fillScale, count);
  }
  // No fill mapping — default to opaque mid-gray.
  return {
    fillR: new Uint8Array(count).fill(128),
    fillG: new Uint8Array(count).fill(128),
    fillB: new Uint8Array(count).fill(128),
    fillA: new Uint8Array(count).fill(255),
  };
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
 * Extend a numeric domain to nice round boundaries.
 * Uses the same Heckbert niceStep as tick generation so the domain
 * edges always land on a tick mark.
 */
export function niceDomain(raw: [number, number]): [number, number] {
  const [lo, hi] = raw;
  const span = hi - lo;
  if (span <= 0) {
    // Constant data: expand to a visible range around the value.
    if (lo === 0) return [0, 1];
    const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(lo))));
    return [Math.floor(lo / mag) * mag, Math.ceil(lo / mag + 1) * mag];
  }
  const step = niceStep(span / 5);
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
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
    const domainSpec = spec?.domain;
    let domain: [number, number];
    if (domainSpec === "nice") {
      domain = niceDomain(inferNumericDomain(col));
    } else if (domainSpec === "data" || domainSpec === undefined) {
      domain = inferNumericDomain(col);
    } else {
      domain = domainSpec as [number, number];
    }
    return {
      kind: "continuous",
      scale: linearScale(domain, range, spec?.clamp ?? false),
      col,
    };
  }

  // String column → band scale for categorical data.
  const domainSpec = spec?.domain;
  const domain: string[] =
    (typeof domainSpec === "string" || domainSpec === undefined)
      ? inferCategoricalDomain(col)
      : domainSpec as string[];
  const gap = 2; // Fixed 2px gap (matches CELL_STEP design).
  return {
    kind: "band",
    scale: bandScale(domain, range, gap),
    col,
  };
}

/**
 * Resolve a continuous color scale from a ScaleSpec and numeric column.
 * Defaults to "sequential" ramp if not specified.
 */
function resolveContinuousColorScale(
  spec: ScaleSpec | undefined,
  col: Float32Array,
): ColorScale {
  const ramp = (spec?.type ?? "sequential") as ColorScaleType;
  const domainSpec = spec?.domain;
  let domain: [number, number];
  if (domainSpec === "nice") {
    domain = niceDomain(inferNumericDomain(col));
  } else if (domainSpec === "data" || domainSpec === undefined) {
    domain = inferNumericDomain(col);
  } else {
    domain = domainSpec as [number, number];
  }
  return colorScale(ramp, domain);
}

/**
 * Resolve an ordinal color scale from a ScaleSpec and string column.
 * Uses DEFAULT_ORDINAL_COLORS if no range is specified.
 */
function resolveOrdinalColorScale(
  spec: ScaleSpec | undefined,
  col: string[],
): OrdinalColorScale {
  const domain = (spec?.domain as string[] | undefined) ?? inferCategoricalDomain(col);
  const colors = (spec?.range as string[] | undefined) ?? DEFAULT_ORDINAL_COLORS;
  return ordinalColorScale(domain, colors);
}

/**
 * Resolve a fill scale from a ScaleSpec and data column.
 * Dispatches to continuous or ordinal based on the column type.
 */
function resolveFillScale(
  spec: ScaleSpec | undefined,
  col: DataColumn,
): FillScale {
  if (col instanceof Float32Array) {
    return resolveContinuousColorScale(spec, col);
  }
  return resolveOrdinalColorScale(spec, col);
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
  fillScale: FillScale | undefined,
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

  const { fillR, fillG, fillB, fillA } = resolveFillColors(data, aes, fillScale, count);
  return { kind: "rect", count, x, y, w, h, fillR, fillG, fillB, fillA, dataIndex };
}

/**
 * Emit RectBuffers for geom: "bar".
 *
 * Bars span from the scale origin (0) to the data value along the
 * continuous axis, with width/height from the band scale's bandwidth.
 *
 * Supports both orientations:
 *   Horizontal — y is band (categories), x is continuous (values)
 *   Vertical   — x is band (categories), y is continuous (values)
 */
function emitBar(
  data: DataFrame,
  aes: AesMapping,
  xCh: ResolvedChannel,
  yCh: ResolvedChannel,
  fillScale: FillScale | undefined,
  _params: Record<string, unknown> | undefined,
): RectBuffers {
  const count = data.length;

  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const w = new Float32Array(count);
  const h = new Float32Array(count);
  const dataIndex = new Uint32Array(count);

  if (xCh.kind === "band" && yCh.kind === "continuous") {
    // Vertical bars: categories on x, values on y.
    const bw = xCh.scale.bandwidth;
    const baseline = yCh.scale(0);
    for (let i = 0; i < count; i++) {
      const top = yCh.scale(yCh.col[i]);
      x[i] = xCh.scale(xCh.col[i]);
      y[i] = Math.min(top, baseline);
      w[i] = bw;
      h[i] = Math.abs(baseline - top);
      dataIndex[i] = i;
    }
  } else if (xCh.kind === "continuous" && yCh.kind === "band") {
    // Horizontal bars: values on x, categories on y.
    const bh = yCh.scale.bandwidth;
    const baseline = xCh.scale(0);
    for (let i = 0; i < count; i++) {
      const right = xCh.scale(xCh.col[i]);
      x[i] = Math.min(right, baseline);
      y[i] = yCh.scale(yCh.col[i]);
      w[i] = Math.abs(right - baseline);
      h[i] = bh;
      dataIndex[i] = i;
    }
  } else {
    throw new Error("emitBar requires one band scale and one continuous scale");
  }

  const { fillR, fillG, fillB, fillA } = resolveFillColors(data, aes, fillScale, count);
  return { kind: "rect", count, x, y, w, h, fillR, fillG, fillB, fillA, dataIndex };
}

// ── Geom Dispatch ──

function emitGeom(
  geom: string,
  data: DataFrame,
  aes: AesMapping,
  xCh: ResolvedChannel,
  yCh: ResolvedChannel,
  fillScale: FillScale | undefined,
  params: Record<string, unknown> | undefined,
): GeomBuffers {
  switch (geom) {
    case "tile":
    case "rect":
      return emitTile(data, aes, xCh, yCh, fillScale, params);
    case "bar":
      return emitBar(data, aes, xCh, yCh, fillScale, params);
    default:
      throw new Error(`compile: geom "${geom}" not implemented`);
  }
}

// ── Axis Tick Generation ──

/**
 * Choose a "nice" tick step size for continuous scales.
 * Heckbert's algorithm — rounds to the nearest 1, 2, or 5 × 10^n.
 */
function niceStep(rawStep: number): number {
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const fraction = rawStep / magnitude;
  if (fraction < 1.5) return magnitude;
  if (fraction < 3.5) return 2 * magnitude;
  if (fraction < 7.5) return 5 * magnitude;
  return 10 * magnitude;
}

/**
 * Format a numeric tick label for axis display.
 * Abbreviates thousands (k) and millions (M).
 */
function formatTickLabel(value: number): string {
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${+(value / 1_000_000).toPrecision(3)}M`;
  if (abs >= 1_000) return `${+(value / 1_000).toPrecision(3)}k`;
  if (Number.isInteger(value)) return String(value);
  return value.toPrecision(3);
}

/**
 * Generate tick labels and pixel positions from a resolved position scale.
 * BandScale: one tick per domain value, centered within each band.
 * ContinuousScale: ~5 evenly spaced nice-number ticks across the domain.
 */
function buildAxisTicks(
  scale: ContinuousScale | BandScale,
  format?: (value: number) => string,
): AxisTick[] {
  if (scale.kind === "band") {
    const half = scale.bandwidth / 2;
    return scale.domain.map((label) => ({
      label,
      position: scale(label) + half,
    }));
  }

  // Continuous scale: generate nice ticks.
  const [lo, hi] = scale.domain;
  const span = hi - lo;
  if (span <= 0) return [];

  const step = niceStep(span / 5);
  const ticks: AxisTick[] = [];
  const start = Math.ceil(lo / step) * step;
  const fmt = format ?? formatTickLabel;

  for (let v = start; v <= hi + step * 1e-9; v += step) {
    ticks.push({
      label: fmt(v),
      position: scale(v),
    });
  }
  return ticks;
}

// ── Dimension Resolution ──

/**
 * Resolve a DimensionSpec to pixels.
 *
 * - number → pass through (explicit pixels)
 * - { step } → domain cardinality × step (band-scale shorthand)
 */
function resolveDimension(dim: DimensionSpec, col: DataColumn): number {
  if (typeof dim === "number") return dim;
  if (col instanceof Float32Array) return dim.step;
  return inferCategoricalDomain(col).length * dim.step;
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
  let fillScale: FillScale | undefined;
  let width: number | undefined;
  let height: number | undefined;

  for (const layerSpec of spec.layers) {
    // 1. Merge per-layer data/aes with plot-level defaults.
    const data = layerSpec.data ?? spec.data;
    const aes: AesMapping = { ...spec.aes, ...layerSpec.aes };

    // 2. Apply stat transformation.
    const transformed = applyStat(data);

    // 3. Resolve dimensions and channels (lazily — first layer creates them).
    const xCol = transformed.columns[aes.x];
    const yCol = transformed.columns[aes.y];

    if (width === undefined) width = resolveDimension(spec.width, xCol);
    if (height === undefined) height = resolveDimension(spec.height, yCol);

    if (!xChannel) {
      xChannel = resolvePositionChannel(spec.scales?.x, xCol, [0, width]);
    }
    if (!yChannel) {
      yChannel = resolvePositionChannel(spec.scales?.y, yCol, [0, height]);
    }
    if (aes.fill && !fillScale) {
      fillScale = resolveFillScale(spec.scales?.fill, transformed.columns[aes.fill]);
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

  if (!xChannel || !yChannel || width === undefined || height === undefined) {
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
      x: { ticks: buildAxisTicks(scales.x, spec.scales?.x?.format) },
      y: { ticks: buildAxisTicks(scales.y, spec.scales?.y?.format) },
    },
    width,
    height,
  };
}
