/**
 * Spring animation workspace and physics engine.
 *
 * Manages the interpolation state between two frozen SceneGraph snapshots.
 * All hot-path operations write into pre-allocated typed arrays — zero
 * allocation during rAF.
 *
 * Split storage model:
 * - Geometry channels (x, y, w, h, cx, cy, r): Float32Array throughout.
 * - Color channels (fillR, fillG, fillB, fillA): Uint8Array source/target
 *   from the scene graph, Float32Array workspace for spring physics
 *   (fractional precision needed for smooth interpolation), snapped back
 *   to Uint8Array at the end of each step for painting.
 */

import type { GeomBuffers } from "./types";

// ── Spring Constants (match existing SpringAnimator.ts) ──

const TENSION = 180;
const FRICTION = 12;
const MAX_DT = 0.064;
const SETTLE_VEL = 0.0005;
const SETTLE_POS = 0.0008;

// ── Channel Descriptor ──

export interface ChannelDesc {
  name: string;
  /** "f32" for geometry channels, "u8" for color channels. */
  storage: "f32" | "u8";
}

// ── Channel layout per geom kind ──

function f32(name: string): ChannelDesc { return { name, storage: "f32" }; }
function u8(name: string): ChannelDesc { return { name, storage: "u8" }; }

const RECT_CHANNELS: readonly ChannelDesc[] = [
  f32("x"), f32("y"), f32("w"), f32("h"),
  u8("fillR"), u8("fillG"), u8("fillB"), u8("fillA"),
];

const POINT_CHANNELS: readonly ChannelDesc[] = [
  f32("cx"), f32("cy"), f32("r"),
  u8("fillR"), u8("fillG"), u8("fillB"), u8("fillA"),
];

// Path fill is per-series (small count), geometry is per-vertex.
// For Phase 1 we focus on rect; path channels included for type completeness.
const PATH_CHANNELS: readonly ChannelDesc[] = [
  f32("x"), f32("y"),
];

export function getChannelDescs(kind: GeomBuffers["kind"]): readonly ChannelDesc[] {
  switch (kind) {
    case "rect": return RECT_CHANNELS;
    case "point": return POINT_CHANNELS;
    case "path": return PATH_CHANNELS;
  }
}

// ── TweenBuffer ──

/**
 * Interpolation workspace for a single GeomBuffers layer.
 *
 * For f32 channels: currentF32 is both the workspace and the paint source.
 * For u8 channels: currentF32 is the spring workspace (fractional precision),
 *   currentU8 is the snapped paint target (written at end of stepSprings).
 *
 * All arrays allocated once at creation. Reused across frames.
 */
export interface TweenBuffer {
  channels: readonly ChannelDesc[];
  count: number;
  /** Spring workspace — Float32Array for every channel. */
  currentF32: Record<string, Float32Array>;
  /** Paint targets — Uint8Array for u8 channels only. */
  currentU8: Record<string, Uint8Array>;
  /** Target values — Float32Array for every channel (u8 targets promoted). */
  targetF32: Record<string, Float32Array>;
}

/**
 * Create a TweenBuffer for transitioning from one GeomBuffers to another.
 *
 * If `from` is null (first render) or count changed, currentF32 initializes
 * from target values (no jarring tween from zero). If `from` matches,
 * currentF32 copies the previous state for seamless transition.
 */
export function createTweenBuffer(
  from: GeomBuffers | null,
  to: GeomBuffers,
): TweenBuffer {
  const channels = getChannelDescs(to.kind);
  const count = to.count;
  const sameSize = from !== null && from.count === count;
  const currentF32: Record<string, Float32Array> = {};
  const currentU8: Record<string, Uint8Array> = {};
  const targetF32: Record<string, Float32Array> = {};

  for (const ch of channels) {
    const n = ch.name;

    if (ch.storage === "f32") {
      // Geometry channel — Float32Array throughout.
      const toArr = (to as never)[n] as Float32Array;
      targetF32[n] = toArr;
      currentF32[n] = new Float32Array(count);

      if (sameSize) {
        currentF32[n].set((from as never)[n] as Float32Array);
      } else {
        currentF32[n].set(toArr);
      }
    } else {
      // Color channel — Uint8Array in scene graph, Float32Array workspace.
      const toArr = (to as never)[n] as Uint8Array;

      // Promote target bytes to Float32 for spring math.
      const tf = new Float32Array(count);
      for (let i = 0; i < count; i++) tf[i] = toArr[i];
      targetF32[n] = tf;

      // Workspace and paint target.
      currentF32[n] = new Float32Array(count);
      currentU8[n] = new Uint8Array(count);

      if (sameSize) {
        // Initialize workspace from previous state's u8 values.
        const fromArr = (from as never)[n] as Uint8Array;
        for (let i = 0; i < count; i++) currentF32[n][i] = fromArr[i];
      } else {
        currentF32[n].set(tf);
      }

      // Initialize paint target from workspace.
      for (let i = 0; i < count; i++) {
        currentU8[n][i] = Math.max(0, Math.min(255, Math.round(currentF32[n][i])));
      }
    }
  }

  return { channels, count, currentF32, currentU8, targetF32 };
}

// ── SpringState ──

export interface SpringState {
  /** Per-element velocity — one Float32Array per channel. Allocated once. */
  velocities: Record<string, Float32Array>;
  settled: boolean;
}

export function createSpringState(tween: TweenBuffer): SpringState {
  const velocities: Record<string, Float32Array> = {};
  for (const ch of tween.channels) {
    velocities[ch.name] = new Float32Array(tween.count);
  }
  return { velocities, settled: false };
}

// ── Spring Integration ──

/**
 * Advance spring physics by dt seconds.
 *
 * Writes into tween.currentF32 in-place. Zero allocation.
 * After stepping each u8 channel, snaps Float32 workspace → Uint8 paint target.
 *
 * Returns true if any spring is still moving, false if fully settled.
 * When settled, the caller can stop ticking.
 */
export function stepSprings(
  tween: TweenBuffer,
  spring: SpringState,
  dt: number,
): boolean {
  const clampedDt = Math.min(dt, MAX_DT);
  let anyMoving = false;
  const n = tween.count;

  for (const ch of tween.channels) {
    const pos = tween.currentF32[ch.name];
    const target = tween.targetF32[ch.name];
    const vel = spring.velocities[ch.name];

    for (let i = 0; i < n; i++) {
      const displacement = target[i] - pos[i];
      const accel = TENSION * displacement - FRICTION * vel[i];
      vel[i] += accel * clampedDt;
      pos[i] += vel[i] * clampedDt;

      if (Math.abs(vel[i]) > SETTLE_VEL || Math.abs(displacement) > SETTLE_POS) {
        anyMoving = true;
      } else if (vel[i] !== 0 || pos[i] !== target[i]) {
        // Snap to target when within epsilon to prevent drift.
        pos[i] = target[i];
        vel[i] = 0;
      }
    }

    // Snap color channels: Float32 workspace → Uint8 paint target.
    if (ch.storage === "u8") {
      const u8 = tween.currentU8[ch.name];
      for (let i = 0; i < n; i++) {
        u8[i] = Math.max(0, Math.min(255, Math.round(pos[i])));
      }
    }
  }

  spring.settled = !anyMoving;
  return anyMoving;
}
