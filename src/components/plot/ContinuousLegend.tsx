/**
 * ContinuousLegend — renders a color ramp from the engine's ColorScale.
 *
 * Single source of truth: the same scale.toRGBA() that packs cell colors
 * during compile() also paints this legend. No CSS gradient duplication.
 *
 * Uses a 256×1 ImageData buffer written via putImageData — one bulk
 * pixel write instead of 256 fillRect calls.
 */

import { useEffect, useRef } from "react";
import type { ColorScale } from "../../lib/plot/types";

export interface ContinuousLegendProps {
  scale: ColorScale;
  /** Label for the low end of the domain. Defaults to domain[0]. */
  low?: string;
  /** Label for the high end of the domain. Defaults to domain[1]. */
  high?: string;
}

const RESOLUTION = 256;

export function ContinuousLegend({ scale, low, high }: ContinuousLegendProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const imageData = ctx.createImageData(RESOLUTION, 1);
    const pixels = imageData.data; // Uint8ClampedArray, 4 bytes per pixel

    const [d0, d1] = scale.domain;
    const dSpan = d1 - d0;

    for (let x = 0; x < RESOLUTION; x++) {
      const t = dSpan === 0 ? 0 : d0 + (x / (RESOLUTION - 1)) * dSpan;
      const rgba = scale.toRGBA(t);
      const off = x * 4;
      pixels[off] = rgba[0];
      pixels[off + 1] = rgba[1];
      pixels[off + 2] = rgba[2];
      pixels[off + 3] = rgba[3];
    }

    ctx.putImageData(imageData, 0, 0);
  }, [scale]);

  const lowLabel = low ?? String(scale.domain[0]);
  const highLabel = high ?? String(scale.domain[1]);

  return (
    <div className="legend-bar tab surface-sunken shadow-inner radius-sm">
      <span className="color-muted">{lowLabel}</span>
      <canvas
        ref={canvasRef}
        width={RESOLUTION}
        height={1}
        className="legend-bar__fill radius-sm"
      />
      <span className="color-muted">{highLabel}</span>
    </div>
  );
}
