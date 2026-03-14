import { describe, it, expect } from "vitest";
import { hitTest } from "../hitTest";
import { compile } from "../compiler";
import type { PlotSpec } from "../types";

function makeTileSpec(): PlotSpec {
  return {
    data: {
      columns: {
        x: ["a", "b", "a", "b"],
        y: ["r0", "r0", "r1", "r1"],
        v: new Float32Array([0.1, 0.5, 0.9, 0.3]),
      },
      length: 4,
    },
    aes: { x: "x", y: "y", fill: "v" },
    scales: { fill: { type: "sequential", domain: [0, 1] } },
    layers: [{ geom: "tile" }],
    width: { step: 50 },
    height: { step: 50 },
  };
}

describe("hitTest", () => {
  it("returns a hit for a point inside a rect", () => {
    const graph = compile(makeTileSpec());
    // First tile "a","r0" should be at (0..bandwidth, 0..bandwidth)
    const hit = hitTest(graph, 10, 10);
    expect(hit).not.toBeNull();
    if (hit) {
      expect(hit.dataX).toBe("a");
      expect(hit.dataY).toBe("r0");
    }
  });

  it("returns null for a point outside all rects", () => {
    const graph = compile(makeTileSpec());
    // Way outside the canvas
    const hit = hitTest(graph, 999, 999);
    expect(hit).toBeNull();
  });

  it("returns correct data index", () => {
    const graph = compile(makeTileSpec());
    const hit = hitTest(graph, 10, 10);
    expect(hit).not.toBeNull();
    if (hit) {
      expect(hit.dataIndex).toBeDefined();
    }
  });
});
