/**
 * AnimationTicker — the master clock for all visualization animations.
 *
 * One rAF loop for the entire application. Subscribers provide
 * (now: DOMHighResTimeStamp) => boolean. Return true to keep ticking,
 * false to auto-unsubscribe. Zero idle CPU when no subscribers.
 */

type TickFn = (now: number) => boolean;

class AnimationTicker {
  private subscribers = new Set<TickFn>();
  private rafId: number | null = null;

  subscribe(fn: TickFn): void {
    this.subscribers.add(fn);
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame((t) => this.tick(t));
    }
  }

  unsubscribe(fn: TickFn): void {
    this.subscribers.delete(fn);
  }

  private tick(now: number): void {
    for (const fn of this.subscribers) {
      try {
        if (!fn(now)) this.subscribers.delete(fn);
      } catch (e) {
        this.subscribers.delete(fn);
        console.error('AnimationTicker: subscriber threw, removed:', e);
      }
    }
    if (this.subscribers.size > 0) {
      this.rafId = requestAnimationFrame((t) => this.tick(t));
    } else {
      this.rafId = null;
    }
  }
}

export const ticker = new AnimationTicker();
