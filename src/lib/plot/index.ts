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
  Scale,
  ResolvedScales,
  RectBuffers,
  PointBuffers,
  PathBuffers,
  GeomBuffers,
  AxisTick,
  SceneGraph,
} from "./types";

export { linearScale, bandScale, colorScale } from "./scales";
export type { ColorRamp } from "./scales";

export {
  createTweenBuffer,
  createSpringState,
  stepSprings,
  getChannelDescs,
} from "./springs";
export type { ChannelDesc, TweenBuffer, SpringState } from "./springs";

export { compile, packColors } from "./compiler";

export { getPainter } from "./painters";

export { hitTest } from "./hitTest";
export type { HitResult } from "./hitTest";
