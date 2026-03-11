/**
 * Canvas rendering utilities for epigenomic visualizations.
 *
 * Color science: HSL interpolation for canvas compatibility.
 * Noise: Mulberry32 PRNG for deterministic ChIP-seq peak shapes.
 * Hash: FNV-1a + Murmur3 finalizer for tissue-label → hue mapping.
 */

/* ── Viridis colormap — 256 canonical RGB values (matplotlib, CC0) ── */

const VIRIDIS: readonly string[] = [
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

export function viridisColor(t: number): string {
  const idx = Math.max(0, Math.min(255, Math.round(t * 255)));
  return VIRIDIS[idx];
}

export function viridisTextColor(t: number): string {
  return t < 0.55 ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.7)";
}

/* ── Palette reader — parse CSS custom properties once ── */

function parseRGB(el: HTMLElement, raw: string): [number, number, number] {
  const v = raw.trim();
  if (!v) return [128, 128, 128];
  el.style.color = v;
  const computed = getComputedStyle(el).color;
  const m = computed.match(/(\d+)/g);
  return m ? [+m[0], +m[1], +m[2]] : [128, 128, 128];
}

function lerpRGB(a: [number, number, number], b: [number, number, number], t: number): string {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)}, ${Math.round(a[1] + (b[1] - a[1]) * t)}, ${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

let seqLow: [number, number, number] | null = null;
let seqMid: [number, number, number] | null = null;
let seqHigh: [number, number, number] | null = null;
let divNeg: [number, number, number] | null = null;
let divZero: [number, number, number] | null = null;
let divPos: [number, number, number] | null = null;

function ensurePalettes() {
  if (seqLow) return;
  const s = getComputedStyle(document.documentElement);
  const el = document.createElement("div");
  document.body.appendChild(el);
  seqLow = parseRGB(el, s.getPropertyValue("--palette-seq-low"));
  seqMid = parseRGB(el, s.getPropertyValue("--palette-seq-mid"));
  seqHigh = parseRGB(el, s.getPropertyValue("--palette-seq-high"));
  divNeg = parseRGB(el, s.getPropertyValue("--palette-div-neg"));
  divZero = parseRGB(el, s.getPropertyValue("--palette-div-zero"));
  divPos = parseRGB(el, s.getPropertyValue("--palette-div-pos"));
  document.body.removeChild(el);
}

/** Clear cached palette and label colors. Call on theme change. */
export function resetCaches() {
  seqLow = seqMid = seqHigh = null;
  divNeg = divZero = divPos = null;
  _stateColors = null;
  _labelColor = null;
}

/* ── Sequential heatmap scale ── */

export function heatmapColor(t: number): string {
  ensurePalettes();
  const c = Math.max(0, Math.min(1, t));
  if (c <= 0.5) {
    return lerpRGB(seqLow!, seqMid!, c * 2);
  }
  return lerpRGB(seqMid!, seqHigh!, (c - 0.5) * 2);
}

export function heatmapTextColor(t: number): string {
  return t > 0.45 ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.7)";
}

/* ── Diverging scale ── */

export function divergingColor(r: number): string {
  ensurePalettes();
  const t = Math.max(-1, Math.min(1, r));
  if (t >= 0) {
    return lerpRGB(divZero!, divPos!, t);
  }
  return lerpRGB(divZero!, divNeg!, -t);
}

export function divergingTextColor(r: number): string {
  return Math.abs(r) > 0.5 ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.7)";
}

/* ── Seeded PRNG (Mulberry32) ── */

export function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── ChIP-seq signal generator ── */

export function generateSignal(
  length: number,
  seed: number,
  peakDensity = 0.02,
  maxHeight = 1.0,
): Float32Array {
  const rng = mulberry32(seed);
  const signal = new Float32Array(length);

  // Baseline noise
  for (let i = 0; i < length; i++) {
    signal[i] = rng() * 0.04;
  }

  // Gaussian peaks with sharp rise, gradual decay
  const numPeaks = Math.floor(length * peakDensity);
  for (let p = 0; p < numPeaks; p++) {
    const center = Math.floor(rng() * length);
    const width = 8 + Math.floor(rng() * 30);
    const height = 0.25 + rng() * (maxHeight - 0.25);

    for (let i = -width * 3; i <= width * 3; i++) {
      const idx = center + i;
      if (idx >= 0 && idx < length) {
        const dist = Math.abs(i) / width;
        signal[idx] = Math.min(1, signal[idx] + height * Math.exp(-dist * dist * 2));
      }
    }
  }

  return signal;
}


/* ── Retina-safe canvas setup ──
   Sets buffer resolution and scales context for DPR.
   Display size (style.width/height) belongs in JSX. */

export function setupCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  return ctx;
}

/* ── Chromatin state colors (ChromHMM convention) ── */

let _stateColors: Record<number, string> | null = null;

export function getStateColors(): Record<number, string> {
  if (_stateColors) return _stateColors;
  const s = getComputedStyle(document.documentElement);
  _stateColors = {};
  for (let i = 1; i <= 15; i++) {
    _stateColors[i] = s.getPropertyValue(`--state-${i}`).trim() || "hsl(0, 0%, 50%)";
  }
  return _stateColors;
}

let _labelColor: string | null = null;

/** Resolved --color-text-muted for canvas paint calls. */
export function getLabelColor(): string {
  if (!_labelColor) {
    _labelColor = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-text-muted").trim() || "hsl(30,10%,55%)";
  }
  return _labelColor;
}
