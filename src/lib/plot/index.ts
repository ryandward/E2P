export type {
  DataColumn,
  DataFrame,
  AesMapping,
  StatSpec,
  ScaleSpec,
  LayerSpec,
  PlotSpec,
  ContinuousScale,
  BandScale,
  ColorScale,
  OrdinalColorScale,
  FillScale,
  Scale,
  ResolvedScales,
  RectBuffers,
  PointBuffers,
  PathBuffers,
  GeomBuffers,
  AxisTick,
  SceneGraph,
} from "./types";

export { linearScale, bandScale, colorScale, ordinalColorScale, DEFAULT_ORDINAL_COLORS } from "./scales";
export type { ColorRamp } from "./scales";

export {
  createTweenBuffer,
  createSpringState,
  stepSprings,
  getChannelDescs,
} from "./springs";
export type { ChannelDesc, TweenBuffer, SpringState } from "./springs";

export { compile, packColors, niceDomain } from "./compiler";

export { getPainter } from "./painters";

export { hitTest } from "./hitTest";
export type { HitResult } from "./hitTest";

/** Standard column name for categorical row labels across the viz library. */
export const NAME_COL = "name";
