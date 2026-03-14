/**
 * Scale factories — dynamic mathematical projections (Domain → Range).
 *
 * Each factory returns a callable function object with attached methods.
 * No d3 dependency. Color math uses the existing palettes.ts HSL ramps
 * and canvas.ts viridis LUT, wrapped behind the ColorScale interface.
 *
 * colorScale.toRGBA() reuses a single internal tuple — zero allocation
 * per call. Safe for compile()-time bulk packing into Uint8Array buffers.
 */

import type { ContinuousScale, BandScale, ColorScale, OrdinalColorScale, ColorScaleType } from "./types";

// ── Linear Scale ──

export function linearScale(
  domain: [number, number],
  range: [number, number],
  clamp = false,
): ContinuousScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const dSpan = d1 - d0;
  const rSpan = r1 - r0;

  const scale = ((value: number): number => {
    if (value !== value) return NaN; // Propagate NaN — geometry emitters check it
    let t = dSpan === 0 ? 0 : (value - d0) / dSpan;
    if (clamp) t = Math.max(0, Math.min(1, t));
    return r0 + t * rSpan;
  }) as ContinuousScale;

  scale.kind = "continuous";
  scale.domain = domain;
  scale.range = range;
  scale.invert = (pixel: number): number => {
    const t = rSpan === 0 ? 0 : (pixel - r0) / rSpan;
    return d0 + t * dSpan;
  };

  return scale;
}

// ── Band Scale ──

export function bandScale(
  domain: string[],
  range: [number, number],
  gap: number,
): BandScale {
  const [r0, r1] = range;
  const n = domain.length;
  const totalGap = gap * Math.max(0, n - 1);
  const bandwidth = n > 0 ? (r1 - r0 - totalGap) / n : 0;
  const step = bandwidth + gap;

  const indexMap = new Map<string, number>();
  for (let i = 0; i < n; i++) indexMap.set(domain[i], i);

  const scale = ((key: string): number => {
    const i = indexMap.get(key) ?? 0;
    return r0 + i * step;
  }) as BandScale;

  scale.kind = "band";
  scale.domain = domain;
  scale.range = range;
  scale.bandwidth = bandwidth;
  scale.step = step;
  scale.gap = gap;
  scale.invertIndex = (pixel: number): number => {
    const i = Math.floor((pixel - r0) / step);
    return Math.max(0, Math.min(n - 1, i));
  };

  return scale;
}

// ── Color Scale Internals ──

// HSL → RGB conversion (no DOM, no getComputedStyle, pure math).
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  // h in degrees, s and l in 0–100
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs(hp % 2 - 1));
  let r1: number, g1: number, b1: number;
  if (hp < 1) { r1 = c; g1 = x; b1 = 0; }
  else if (hp < 2) { r1 = x; g1 = c; b1 = 0; }
  else if (hp < 3) { r1 = 0; g1 = c; b1 = x; }
  else if (hp < 4) { r1 = 0; g1 = x; b1 = c; }
  else if (hp < 5) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }
  const m = ln - c / 2;
  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}

// Lerp between two HSL triplets, return RGB bytes.
function lerpHslToRgb(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  return hslToRgb(
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  );
}

// ── Sequential palette (matches palettes.ts SEQ constants) ──

const SEQ_LOW: readonly [number, number, number] = [220, 20, 95];
const SEQ_MID: readonly [number, number, number] = [228, 47, 55];
const SEQ_HIGH: readonly [number, number, number] = [235, 75, 30];

function sequentialRgb(t: number): [number, number, number] {
  const c = Math.max(0, Math.min(1, t));
  if (c <= 0.5) return lerpHslToRgb(SEQ_LOW, SEQ_MID, c * 2);
  return lerpHslToRgb(SEQ_MID, SEQ_HIGH, (c - 0.5) * 2);
}

// ── Diverging palette (blue → white → red, interpolated in RGB) ──

const DIV_NEG_RGB: readonly [number, number, number] = [67, 147, 195];
const DIV_ZERO_RGB: readonly [number, number, number] = [255, 255, 255];
const DIV_POS_RGB: readonly [number, number, number] = [214, 96, 77];

function lerpRgb(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function divergingRgb(t: number): [number, number, number] {
  const c = Math.max(0, Math.min(1, t));
  if (c <= 0.5) return lerpRgb(DIV_NEG_RGB, DIV_ZERO_RGB, c * 2);
  return lerpRgb(DIV_ZERO_RGB, DIV_POS_RGB, (c - 0.5) * 2);
}

// ── Viridis LUT (256 hex → pre-parsed RGB bytes) ──

const VIRIDIS_HEX: readonly string[] = [
  "#440154","#440256","#450457","#450559","#46075a","#46085c","#460a5d","#460b5e",
  "#470d60","#470e61","#471063","#471164","#471365","#481467","#481668","#481769",
  "#48186a","#481a6c","#481b6d","#481c6e","#481d6f","#481f70","#482071","#482173",
  "#482374","#482475","#482576","#482677","#482878","#482979","#472a7a","#472c7a",
  "#472d7b","#472e7c","#472f7d","#46307e","#46327e","#46337f","#463480","#453581",
  "#453781","#453882","#443983","#443a83","#443b84","#433d84","#433e85","#423f85",
  "#424086","#424186","#414287","#414487","#404588","#404688","#3f4788","#3f4889",
  "#3e4989","#3e4a89","#3e4c8a","#3d4d8a","#3d4e8a","#3c4f8a","#3c508b","#3b518b",
  "#3b528b","#3a538b","#3a548c","#39558c","#39568c","#38588c","#38598c","#375a8c",
  "#375b8d","#365c8d","#365d8d","#355e8d","#355f8d","#34608d","#34618d","#33628d",
  "#33638d","#32648e","#32658e","#31668e","#31678e","#31688e","#30698e","#306a8e",
  "#2f6b8e","#2f6c8e","#2e6d8e","#2e6e8e","#2e6f8e","#2d708e","#2d718e","#2c718e",
  "#2c728e","#2c738e","#2b748e","#2b758e","#2a768e","#2a778e","#2a788e","#29798e",
  "#297a8e","#297b8e","#287c8e","#287d8e","#277e8e","#277f8e","#27808e","#26818e",
  "#26828e","#26828e","#25838e","#25848e","#25858e","#24868e","#24878e","#23888e",
  "#23898e","#238a8d","#228b8d","#228c8d","#228d8d","#218e8d","#218f8d","#21908d",
  "#21918c","#20928c","#20928c","#20938c","#1f948c","#1f958b","#1f968b","#1f978b",
  "#1f988b","#1f998a","#1f9a8a","#1e9b8a","#1e9c89","#1e9d89","#1f9e89","#1f9f88",
  "#1fa088","#1fa188","#1fa187","#1fa287","#20a386","#20a486","#21a585","#21a685",
  "#22a785","#22a884","#23a983","#24aa83","#25ab82","#25ac82","#26ad81","#27ad81",
  "#28ae80","#29af7f","#2ab07f","#2cb17e","#2db27d","#2eb37c","#2fb47c","#31b57b",
  "#32b67a","#34b679","#35b779","#37b878","#38b977","#3aba76","#3bbb75","#3dbc74",
  "#3fbc73","#40bd72","#42be71","#44bf70","#46c06f","#48c16e","#4ac16d","#4cc26c",
  "#4ec36b","#50c46a","#52c569","#54c568","#56c667","#58c765","#5ac864","#5cc863",
  "#5ec962","#60ca60","#63cb5f","#65cb5e","#67cc5c","#69cd5b","#6ccd5a","#6ece58",
  "#70cf57","#73d056","#75d054","#77d153","#7ad151","#7cd250","#7fd34e","#81d34d",
  "#84d44b","#86d549","#89d548","#8bd646","#8ed645","#90d743","#93d741","#95d840",
  "#98d83e","#9bd93c","#9dd93b","#a0da39","#a2da37","#a5db36","#a8db34","#aadc32",
  "#addc30","#b0dd2f","#b2dd2d","#b5de2b","#b8de29","#bade28","#bddf26","#c0df25",
  "#c2df23","#c5e021","#c8e020","#cae11f","#cde11d","#d0e11c","#d2e21b","#d5e21a",
  "#d8e219","#dae319","#dde318","#dfe318","#e2e418","#e5e419","#e7e419","#eae51a",
  "#ece51b","#efe51c","#f1e51d","#f4e61e","#f6e620","#f8e621","#fbe723","#fde725",
];

// Pre-parse viridis hex into a flat Uint8Array: [r0,g0,b0, r1,g1,b1, ...]
const VIRIDIS_RGB = new Uint8Array(256 * 3);
for (let i = 0; i < 256; i++) {
  const hex = VIRIDIS_HEX[i];
  VIRIDIS_RGB[i * 3] = parseInt(hex.slice(1, 3), 16);
  VIRIDIS_RGB[i * 3 + 1] = parseInt(hex.slice(3, 5), 16);
  VIRIDIS_RGB[i * 3 + 2] = parseInt(hex.slice(5, 7), 16);
}

function viridisRgb(t: number): [number, number, number] {
  const idx = Math.max(0, Math.min(255, Math.round(t * 255)));
  const off = idx * 3;
  return [VIRIDIS_RGB[off], VIRIDIS_RGB[off + 1], VIRIDIS_RGB[off + 2]];
}

// ── Color Scale Factory ──

export type { ColorScaleType as ColorRamp } from "./types";

/**
 * Create a ColorScale from a named ramp and a numeric domain.
 *
 * The returned function object:
 * - (value) → CSS color string (for legends, non-hot-path use)
 * - .toRGBA(value) → [r, g, b, a] bytes via a reused internal tuple
 * - .domain — the [min, max] range
 *
 * toRGBA reuses a single mutable tuple. NOT safe to hold references
 * to the returned array across calls — copy immediately. This is
 * intentional: packColors() reads and copies each call's result into
 * Uint8Arrays, so the reuse is safe and avoids allocation.
 */
export function colorScale(
  ramp: ColorScaleType,
  domain: [number, number],
): ColorScale {
  const [d0, d1] = domain;
  const dSpan = d1 - d0;

  // Select the RGB interpolation function for this ramp.
  let rgbFn: (t: number) => [number, number, number];
  switch (ramp) {
    case "sequential": rgbFn = sequentialRgb; break;
    case "diverging": rgbFn = divergingRgb; break;
    case "viridis": rgbFn = viridisRgb; break;
    case "ordinal":
      throw new Error("Use ordinalColorScale() for ordinal color mapping");
  }

  // The single reusable tuple — mutated in place by toRGBA.
  const rgba: [number, number, number, number] = [0, 0, 0, 255];

  // Normalize domain value to 0..1
  function normalize(value: number): number {
    if (value !== value) return NaN; // NaN guard — packColors checks and sets alpha 0
    if (dSpan === 0) return 0;
    return Math.max(0, Math.min(1, (value - d0) / dSpan));
  }

  const scale = ((value: number): string => {
    const t = normalize(value);
    const [r, g, b] = rgbFn(t);
    return `rgba(${r},${g},${b},1)`;
  }) as ColorScale;

  scale.kind = "color";
  scale.domain = domain;

  scale.toRGBA = (value: number): readonly [number, number, number, number] => {
    const t = normalize(value);
    const rgb = rgbFn(t);
    rgba[0] = rgb[0];
    rgba[1] = rgb[1];
    rgba[2] = rgb[2];
    // rgba[3] stays 255 — full opacity by default.
    // Caller can override alpha via a separate alpha channel.
    return rgba;
  };

  return scale;
}

// ── Color String Parsing ──

/**
 * Parse a CSS color string to [R, G, B] bytes.
 * Supports #RRGGBB, #RGB, hsl(h, s%, l%), and rgb(r, g, b).
 */
function parseColorToRgb(color: string): [number, number, number] {
  if (color.startsWith("#")) {
    const hex =
      color.length === 4
        ? color[1] + color[1] + color[2] + color[2] + color[3] + color[3]
        : color.slice(1);
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  const hslMatch = color.match(
    /hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*\)/,
  );
  if (hslMatch) {
    return hslToRgb(
      parseFloat(hslMatch[1]),
      parseFloat(hslMatch[2]),
      parseFloat(hslMatch[3]),
    );
  }
  const rgbMatch = color.match(
    /rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/,
  );
  if (rgbMatch) {
    return [
      Math.round(parseFloat(rgbMatch[1])),
      Math.round(parseFloat(rgbMatch[2])),
      Math.round(parseFloat(rgbMatch[3])),
    ];
  }
  return [128, 128, 128]; // fallback: mid-gray
}

// ── Default Ordinal Palette (Tableau 10) ──

export const DEFAULT_ORDINAL_COLORS = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2",
  "#59a14f", "#edc948", "#b07aa1", "#ff9da7",
  "#9c755f", "#bab0ac",
];

// ── Ordinal Color Scale Factory ──

/**
 * Create an OrdinalColorScale from a categorical domain and a color palette.
 *
 * Maps each domain value to a color by index, wrapping if the domain
 * exceeds the palette length. Colors can be hex (#RRGGBB), hsl(), or rgb().
 *
 * toRGBA reuses a single mutable tuple — same contract as colorScale.
 */
export function ordinalColorScale(
  domain: string[],
  colors: string[],
): OrdinalColorScale {
  const n = colors.length;
  const palette = colors.map(parseColorToRgb);

  const indexMap = new Map<string, number>();
  for (let i = 0; i < domain.length; i++) {
    indexMap.set(domain[i], i % n);
  }

  const rgba: [number, number, number, number] = [0, 0, 0, 255];

  const scale = ((value: string): string => {
    const idx = indexMap.get(value) ?? 0;
    const [r, g, b] = palette[idx % n];
    return `rgba(${r},${g},${b},1)`;
  }) as OrdinalColorScale;

  scale.kind = "ordinal-color";
  scale.domain = domain;

  scale.toRGBA = (value: string): readonly [number, number, number, number] => {
    const idx = indexMap.get(value) ?? 0;
    const rgb = palette[idx % n];
    rgba[0] = rgb[0];
    rgba[1] = rgb[1];
    rgba[2] = rgb[2];
    return rgba;
  };

  return scale;
}
