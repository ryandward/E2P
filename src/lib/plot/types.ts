/**
 * Core type definitions for the E2P visualization engine.
 *
 * These types define the declarative specification layer (PlotSpec),
 * the scale system, and the columnar scene graph buffers. No runtime
 * code — pure type declarations.
 */

// ── Data Layer ──

export type DataColumn = Float32Array | string[];

export interface DataFrame {
  readonly columns: Record<string, DataColumn>;
  readonly length: number;
}

// ── Aesthetic Mapping ──

export interface AesMapping {
  x: string;
  y: string;
  fill?: string;
  size?: string;
  alpha?: string;
  group?: string;
}

// ── Stat ──

export interface StatSpec {
  type: "identity" | "bin" | "density" | "cor";
  params?: Record<string, unknown>;
}

// ── Scale Spec (declarative, pre-resolution) ──

export type PositionScaleType = "linear" | "log" | "band" | "ordinal";
export type ColorScaleType = "sequential" | "diverging" | "viridis";

export interface ScaleSpec {
  type: PositionScaleType | ColorScaleType;
  domain?: [number, number] | string[];
  range?: [number, number] | string[];
  clamp?: boolean;
}

// ── Layer Spec ──

export interface LayerSpec {
  geom: "tile" | "point" | "rect" | "segment" | "area" | "line";
  data?: DataFrame;
  aes?: Partial<AesMapping>;
  stat?: StatSpec;
  params?: Record<string, unknown>;
}

// ── Plot Spec (top-level declarative input) ──

export interface PlotSpec {
  data: DataFrame;
  aes: AesMapping;
  scales?: Partial<Record<keyof AesMapping, ScaleSpec>>;
  layers: LayerSpec[];
  width: number;
  height: number;
  facet?: { row?: string; col?: string };
}

// ── Resolved Scales (callable function objects) ──

export interface ContinuousScale {
  kind: "continuous";
  (value: number): number;
  invert(pixel: number): number;
  domain: [number, number];
  range: [number, number];
}

export interface BandScale {
  kind: "band";
  (key: string): number;
  invertIndex(pixel: number): number;
  domain: string[];
  range: [number, number];
  bandwidth: number;
  step: number;
  gap: number;
}

export interface ColorScale {
  kind: "color";
  (value: number): string;
  toRGBA(value: number): readonly [number, number, number, number];
  domain: [number, number];
}

export type Scale = ContinuousScale | BandScale | ColorScale;

export interface ResolvedScales {
  x: ContinuousScale | BandScale;
  y: ContinuousScale | BandScale;
  fill?: ColorScale;
  size?: ContinuousScale;
  alpha?: ContinuousScale;
}

// ── Scene Graph Buffers (Struct-of-Arrays) ──

export interface RectBuffers {
  kind: "rect";
  count: number;
  x: Float32Array;
  y: Float32Array;
  w: Float32Array;
  h: Float32Array;
  fillR: Uint8Array;
  fillG: Uint8Array;
  fillB: Uint8Array;
  fillA: Uint8Array;
  dataIndex: Uint32Array;
}

export interface PointBuffers {
  kind: "point";
  count: number;
  cx: Float32Array;
  cy: Float32Array;
  r: Float32Array;
  fillR: Uint8Array;
  fillG: Uint8Array;
  fillB: Uint8Array;
  fillA: Uint8Array;
  dataIndex: Uint32Array;
}

export interface PathBuffers {
  kind: "path";
  vertexCount: number;
  x: Float32Array;
  y: Float32Array;
  seriesOffset: Uint32Array;
  seriesCount: number;
  fillR: Uint8Array;
  fillG: Uint8Array;
  fillB: Uint8Array;
  fillA: Uint8Array;
  dataIndex: Uint32Array;
}

export type GeomBuffers = RectBuffers | PointBuffers | PathBuffers;

export interface AxisTick {
  label: string;
  position: number;
}

export interface SceneGraph {
  layers: GeomBuffers[];
  scales: ResolvedScales;
  axes: {
    x: { ticks: AxisTick[] };
    y: { ticks: AxisTick[] };
  };
  width: number;
  height: number;
}
