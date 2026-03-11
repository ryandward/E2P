/**
 * Spring physics — Euler-integrated springs for data visualization.
 *
 * SpringAnimator: drives N-element Float64Array positions, flushing to
 * a paint callback each frame. General-purpose for histogram bars,
 * heatmap cells, any array of animated values.
 *
 * SingleSpring: drives a single scalar value via a write callback.
 *
 * All springs subscribe to the global AnimationTicker — one rAF loop.
 * When everything settles, the clock sleeps. Zero idle CPU.
 */

import { ticker } from './AnimationTicker';

const TENSION = 180;
const FRICTION = 12;
const MASS = 1;
const VELOCITY_EPSILON = 0.0005;
const POSITION_EPSILON = 0.0008;
const MAX_DT = 0.064;

/* ── SingleSpring — one value, callback-driven ── */

export class SingleSpring {
  private writeFn: (value: number) => void;
  private position = 0;
  private velocity = 0;
  private target = 0;
  private lastTime = 0;
  private disposed = false;
  private hasRun = false;
  private isAwake = false;
  private boundTick: (now: number) => boolean;

  constructor(writeFn: (value: number) => void) {
    this.writeFn = writeFn;
    this.boundTick = (now) => this.tick(now);
  }

  setTarget(value: number): void {
    this.target = value;
    if (!this.hasRun) {
      this.hasRun = true;
      this.position = value;
      this.velocity = 0;
      this.writeFn(value);
      return;
    }
    if (!this.disposed && !this.isAwake) {
      this.isAwake = true;
      this.lastTime = 0;
      ticker.subscribe(this.boundTick);
    }
  }

  snap(value: number): void {
    this.position = value;
    this.velocity = 0;
    this.target = value;
    this.isAwake = false;
    ticker.unsubscribe(this.boundTick);
    this.writeFn(value);
  }

  dispose(): void {
    this.disposed = true;
    this.isAwake = false;
    ticker.unsubscribe(this.boundTick);
  }

  private tick(now: number): boolean {
    if (this.disposed) return false;
    if (this.lastTime === 0) {
      this.lastTime = now;
      this.writeFn(this.position);
      return true;
    }

    const dt = Math.min((now - this.lastTime) / 1000, MAX_DT);
    this.lastTime = now;

    const displacement = this.target - this.position;
    const acceleration = (TENSION * displacement - FRICTION * this.velocity) / MASS;
    this.velocity += acceleration * dt;
    this.position += this.velocity * dt;

    if (Math.abs(this.velocity) < VELOCITY_EPSILON && Math.abs(displacement) < POSITION_EPSILON) {
      this.position = this.target;
      this.velocity = 0;
    }

    this.writeFn(this.position);

    if (this.position === this.target && this.velocity === 0) {
      this.isAwake = false;
      return false;
    }
    return true;
  }
}

/* ── SpringAnimator — N-bin array, paint-callback-driven ── */

export class SpringAnimator {
  private onFlush: (positions: Float64Array) => void;
  private positions: Float64Array;
  private velocities: Float64Array;
  private targets: Float64Array;
  private lastTime = 0;
  private disposed = false;
  private hasRun = false;
  private isAwake = false;
  private boundTick: (now: number) => boolean;
  readonly size: number;

  constructor(size: number, onFlush: (positions: Float64Array) => void) {
    this.size = size;
    this.onFlush = onFlush;
    this.positions = new Float64Array(size);
    this.velocities = new Float64Array(size);
    this.targets = new Float64Array(size);
    this.boundTick = (now) => this.tick(now);
  }

  private wake(): void {
    if (this.disposed || this.isAwake) return;
    this.isAwake = true;
    this.lastTime = 0;
    ticker.subscribe(this.boundTick);
  }

  private commitTargets(): void {
    if (!this.hasRun) {
      this.hasRun = true;
      this.positions.set(this.targets);
      this.flush();
    } else {
      this.wake();
    }
  }

  /** Set raw target values. Normalizes by max internally. */
  setTargets(values: number[]): void {
    let mx = 0;
    for (let i = 0; i < values.length; i++) {
      if (values[i] > mx) mx = values[i];
    }
    if (mx === 0) mx = 1;
    for (let i = 0; i < this.size; i++) {
      this.targets[i] = (values[i] ?? 0) / mx;
    }
    this.commitTargets();
  }

  /** Set already-normalized targets (0..1). No internal normalization. */
  setNormalized(values: number[]): void {
    for (let i = 0; i < this.size; i++) {
      this.targets[i] = values[i] ?? 0;
    }
    this.commitTargets();
  }

  /** Kick a single element with a velocity impulse. Spring settles it back. */
  poke(index: number, impulse: number): void {
    if (index < 0 || index >= this.size || this.disposed) return;
    this.velocities[index] += impulse;
    this.wake();
  }

  dispose(): void {
    this.disposed = true;
    this.isAwake = false;
    ticker.unsubscribe(this.boundTick);
  }

  private tick(now: number): boolean {
    if (this.disposed) return false;
    if (this.lastTime === 0) {
      this.lastTime = now;
      this.flush();
      return true;
    }

    const dt = Math.min((now - this.lastTime) / 1000, MAX_DT);
    this.lastTime = now;
    let allSettled = true;

    for (let i = 0; i < this.size; i++) {
      const target = this.targets[i];
      let pos = this.positions[i];
      let vel = this.velocities[i];

      const displacement = target - pos;
      const acceleration = (TENSION * displacement - FRICTION * vel) / MASS;
      vel += acceleration * dt;
      pos += vel * dt;

      if (Math.abs(vel) < VELOCITY_EPSILON && Math.abs(displacement) < POSITION_EPSILON) {
        pos = target;
        vel = 0;
      } else {
        allSettled = false;
      }

      this.positions[i] = pos;
      this.velocities[i] = vel;
    }

    this.flush();

    if (allSettled) {
      this.isAwake = false;
      return false;
    }
    return true;
  }

  /** Reset positions and re-animate to current targets. */
  replay(origin = 0): void {
    if (this.disposed) return;
    this.positions.fill(origin);
    this.velocities.fill(0);
    this.wake();
  }

  /** Force a repaint without changing targets. */
  repaint(): void {
    this.flush();
  }

  private flush(): void {
    this.onFlush(this.positions);
  }
}
