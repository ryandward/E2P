import { describe, it, expect } from "vitest";
import { linearScale, bandScale, colorScale, ordinalColorScale } from "../scales";

describe("linearScale", () => {
  it("maps domain to range linearly", () => {
    const s = linearScale([0, 100], [0, 500]);
    expect(s(0)).toBe(0);
    expect(s(50)).toBe(250);
    expect(s(100)).toBe(500);
  });

  it("inverts pixel to domain value", () => {
    const s = linearScale([0, 100], [0, 500]);
    expect(s.invert(0)).toBe(0);
    expect(s.invert(250)).toBe(50);
    expect(s.invert(500)).toBe(100);
  });

  it("clamps when enabled", () => {
    const s = linearScale([0, 100], [0, 500], true);
    expect(s(-50)).toBe(0);
    expect(s(200)).toBe(500);
  });

  it("does not clamp by default", () => {
    const s = linearScale([0, 100], [0, 500]);
    expect(s(-50)).toBe(-250);
    expect(s(200)).toBe(1000);
  });

  it("handles zero-span domain without NaN", () => {
    const s = linearScale([5, 5], [0, 100]);
    expect(s(5)).toBe(0);
    expect(Number.isNaN(s(5))).toBe(false);
  });

  it("exposes kind, domain, range", () => {
    const s = linearScale([0, 10], [0, 200]);
    expect(s.kind).toBe("continuous");
    expect(s.domain).toEqual([0, 10]);
    expect(s.range).toEqual([0, 200]);
  });
});

describe("bandScale", () => {
  it("maps categories to pixel positions", () => {
    const s = bandScale(["a", "b", "c"], [0, 300], 0);
    expect(s("a")).toBe(0);
    expect(s("b")).toBe(100);
    expect(s("c")).toBe(200);
    expect(s.bandwidth).toBe(100);
  });

  it("accounts for gap between bands", () => {
    const s = bandScale(["a", "b"], [0, 100], 10);
    // total gap = 10 * 1 = 10, bandwidth = (100 - 10) / 2 = 45
    expect(s.bandwidth).toBe(45);
    expect(s.step).toBe(55); // 45 + 10
    expect(s("a")).toBe(0);
    expect(s("b")).toBe(55);
  });

  it("inverts pixel to domain index", () => {
    const s = bandScale(["x", "y", "z"], [0, 300], 0);
    expect(s.invertIndex(50)).toBe(0);
    expect(s.invertIndex(150)).toBe(1);
    expect(s.invertIndex(250)).toBe(2);
  });

  it("handles single-element domain", () => {
    const s = bandScale(["only"], [0, 100], 0);
    expect(s("only")).toBe(0);
    expect(s.bandwidth).toBe(100);
  });

  it("handles empty domain without error", () => {
    const s = bandScale([], [0, 100], 2);
    expect(s.bandwidth).toBe(0);
    expect(s.domain).toEqual([]);
  });

  it("exposes kind, domain, range, gap", () => {
    const s = bandScale(["a"], [0, 50], 2);
    expect(s.kind).toBe("band");
    expect(s.domain).toEqual(["a"]);
    expect(s.range).toEqual([0, 50]);
    expect(s.gap).toBe(2);
  });
});

describe("colorScale", () => {
  it("returns CSS color string", () => {
    const s = colorScale("sequential", [0, 1]);
    const color = s(0.5);
    expect(color).toMatch(/^rgba\(/);
  });

  it("toRGBA returns byte values", () => {
    const s = colorScale("sequential", [0, 1]);
    const rgba = s.toRGBA(0.5);
    expect(rgba.length).toBe(4);
    expect(rgba[0]).toBeGreaterThanOrEqual(0);
    expect(rgba[0]).toBeLessThanOrEqual(255);
    expect(rgba[3]).toBe(255); // full opacity
  });

  it("clamps values outside domain", () => {
    const s = colorScale("viridis", [0, 1]);
    // Should not throw
    s.toRGBA(-1);
    s.toRGBA(2);
  });

  it("supports diverging ramp", () => {
    const s = colorScale("diverging", [0, 1]);
    // toRGBA reuses a tuple — copy immediately
    const lowR = s.toRGBA(0)[0];
    const highR = s.toRGBA(1)[0];
    expect(lowR).not.toBe(highR);
  });

  it("exposes kind and domain", () => {
    const s = colorScale("sequential", [0, 100]);
    expect(s.kind).toBe("color");
    expect(s.domain).toEqual([0, 100]);
  });
});

describe("ordinalColorScale", () => {
  it("maps categories to colors", () => {
    const s = ordinalColorScale(["a", "b"], ["#ff0000", "#0000ff"]);
    expect(s("a")).toMatch(/rgba/);
    expect(s("b")).toMatch(/rgba/);
  });

  it("toRGBA returns byte values", () => {
    const s = ordinalColorScale(["x"], ["#ff0000"]);
    const rgba = s.toRGBA("x");
    expect(rgba[0]).toBe(255);
    expect(rgba[1]).toBe(0);
    expect(rgba[2]).toBe(0);
    expect(rgba[3]).toBe(255);
  });

  it("wraps palette when domain exceeds palette length", () => {
    const s = ordinalColorScale(["a", "b", "c"], ["#ff0000", "#00ff00"]);
    // "c" wraps to index 0 (same as "a")
    const a = s.toRGBA("a");
    const c = s.toRGBA("c");
    expect(a[0]).toBe(c[0]);
    expect(a[1]).toBe(c[1]);
  });

  it("exposes kind and domain", () => {
    const s = ordinalColorScale(["a"], ["#000"]);
    expect(s.kind).toBe("ordinal-color");
    expect(s.domain).toEqual(["a"]);
  });
});
