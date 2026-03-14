import { describe, it, expect } from "vitest";
import { compile, niceDomain } from "../compiler";
import type { PlotSpec } from "../types";

// ── niceDomain ──

describe("niceDomain", () => {
  it("extends to nice round boundaries", () => {
    const [lo, hi] = niceDomain([3, 47]);
    expect(lo).toBe(0);
    expect(hi).toBe(50);
  });

  it("handles [0, max] common case", () => {
    const [lo, hi] = niceDomain([0, 47832]);
    expect(lo).toBe(0);
    expect(hi).toBe(50000);
  });

  it("handles constant zero data", () => {
    const [lo, hi] = niceDomain([0, 0]);
    expect(lo).toBe(0);
    expect(hi).toBe(1);
  });

  it("handles constant non-zero data", () => {
    const [lo, hi] = niceDomain([42, 42]);
    expect(lo).toBeLessThanOrEqual(42);
    expect(hi).toBeGreaterThan(42);
  });

  it("handles negative ranges", () => {
    const [lo, hi] = niceDomain([-100, -3]);
    expect(lo).toBeLessThanOrEqual(-100);
    expect(hi).toBeGreaterThanOrEqual(-3);
  });

  it("handles ranges crossing zero", () => {
    const [lo, hi] = niceDomain([-23, 47]);
    expect(lo).toBeLessThanOrEqual(-23);
    expect(hi).toBeGreaterThanOrEqual(47);
  });

  it("returns same reference for zero span", () => {
    const raw: [number, number] = [5, 5];
    const result = niceDomain(raw);
    // Should expand, not return raw
    expect(result[1]).toBeGreaterThan(result[0]);
  });
});

// ── compile ──

function makeTileSpec(rows: number, cols: number): PlotSpec {
  const count = rows * cols;
  const xCol: string[] = [];
  const yCol: string[] = [];
  const val = new Float32Array(count);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      yCol[i] = `row${r}`;
      xCol[i] = `col${c}`;
      val[i] = i / count;
    }
  }

  return {
    data: { columns: { x: xCol, y: yCol, v: val }, length: count },
    aes: { x: "x", y: "y", fill: "v" },
    scales: { fill: { type: "sequential", domain: [0, 1] } },
    layers: [{ geom: "tile" }],
    width: { step: 34 },
    height: { step: 34 },
  };
}

function makeBarSpec(categories: string[], values: number[]): PlotSpec {
  const val = new Float32Array(values);
  return {
    data: { columns: { cat: categories, val }, length: categories.length },
    aes: { x: "val", y: "cat" },
    layers: [{ geom: "bar" }],
    width: 480,
    height: { step: 38 },
  };
}

describe("compile", () => {
  it("produces a scene graph with correct dimensions", () => {
    const spec = makeTileSpec(4, 3);
    const graph = compile(spec);
    expect(graph.width).toBe(3 * 34);
    expect(graph.height).toBe(4 * 34);
  });

  it("resolves band scales for tile geom", () => {
    const graph = compile(makeTileSpec(2, 3));
    expect(graph.scales.x.kind).toBe("band");
    expect(graph.scales.y.kind).toBe("band");
    if (graph.scales.x.kind === "band") {
      expect(graph.scales.x.domain).toEqual(["col0", "col1", "col2"]);
    }
  });

  it("produces rect buffers for tile geom", () => {
    const graph = compile(makeTileSpec(2, 2));
    expect(graph.layers.length).toBe(1);
    const layer = graph.layers[0];
    expect(layer.kind).toBe("rect");
    if (layer.kind === "rect") expect(layer.count).toBe(4);
  });

  it("resolves band y + continuous x for bar geom", () => {
    const graph = compile(makeBarSpec(["a", "b"], [10, 20]));
    expect(graph.scales.x.kind).toBe("continuous");
    expect(graph.scales.y.kind).toBe("band");
  });

  it("respects domain: 'nice' on continuous scale", () => {
    const spec = makeBarSpec(["a", "b", "c"], [3, 47, 12]);
    spec.scales = { x: { type: "linear", domain: "nice" } };
    const graph = compile(spec);
    if (graph.scales.x.kind === "continuous") {
      expect(graph.scales.x.domain[0]).toBe(0);
      expect(graph.scales.x.domain[1]).toBe(50);
    }
  });

  it("respects domain: 'data' (tight fit)", () => {
    const spec = makeBarSpec(["a", "b"], [3, 47]);
    spec.scales = { x: { type: "linear", domain: "data" } };
    const graph = compile(spec);
    if (graph.scales.x.kind === "continuous") {
      expect(graph.scales.x.domain).toEqual([3, 47]);
    }
  });

  it("respects explicit domain override", () => {
    const spec = makeBarSpec(["a"], [10]);
    spec.scales = { x: { type: "linear", domain: [0, 100] } };
    const graph = compile(spec);
    if (graph.scales.x.kind === "continuous") {
      expect(graph.scales.x.domain).toEqual([0, 100]);
    }
  });

  it("uses custom format function for tick labels", () => {
    const spec = makeBarSpec(["a"], [1000]);
    spec.scales = {
      x: { type: "linear", domain: [0, 2000], format: (v: number) => `${v} bp` },
    };
    const graph = compile(spec);
    const xTick = graph.axes.x.ticks.find((t) => t.label === "1000 bp");
    expect(xTick).toBeDefined();
  });

  it("generates axis ticks for continuous scales", () => {
    const graph = compile(makeBarSpec(["a", "b"], [0, 100]));
    expect(graph.axes.x.ticks.length).toBeGreaterThan(0);
    expect(graph.axes.x.ticks[0].label).toBeDefined();
    expect(graph.axes.x.ticks[0].position).toBeDefined();
  });

  it("generates axis ticks for band scales", () => {
    const graph = compile(makeTileSpec(3, 2));
    expect(graph.axes.y.ticks.length).toBe(3);
    expect(graph.axes.y.ticks[0].label).toBe("row0");
  });

  it("resolves step-based dimensions from domain cardinality", () => {
    const spec = makeTileSpec(5, 3);
    spec.width = { step: 20 };
    spec.height = { step: 30 };
    const graph = compile(spec);
    expect(graph.width).toBe(3 * 20);
    expect(graph.height).toBe(5 * 30);
  });

  it("pre-packs RGBA fill colors in buffers", () => {
    const graph = compile(makeTileSpec(2, 2));
    const layer = graph.layers[0];
    if (layer.kind === "rect") {
      expect(layer.fillR).toBeInstanceOf(Uint8Array);
      expect(layer.fillG).toBeInstanceOf(Uint8Array);
      expect(layer.fillB).toBeInstanceOf(Uint8Array);
      expect(layer.fillA).toBeInstanceOf(Uint8Array);
      expect(layer.fillR.length).toBe(4);
    }
  });

  it("throws on empty spec with no layers", () => {
    const spec: PlotSpec = {
      data: { columns: {}, length: 0 },
      aes: { x: "x", y: "y" },
      layers: [],
      width: 100,
      height: 100,
    };
    expect(() => compile(spec)).toThrow();
  });

  it("throws on unsupported geom type", () => {
    const spec = makeBarSpec(["a"], [10]);
    spec.layers = [{ geom: "hexbin" as "bar" }];
    expect(() => compile(spec)).toThrow(/not implemented/);
  });
});
