import { useEffect, useRef, type RefObject } from "react";

/**
 * Scroll an element into view when a watched value changes,
 * but only if the element has already scrolled past its pinned position.
 * Skips the initial mount.
 */
export function useScrollSnap<T>(ref: RefObject<HTMLElement | null>, value: T): void {
  const initial = useRef(true);
  useEffect(() => {
    if (initial.current) { initial.current = false; return; }
    const el = ref.current;
    if (!el) return;
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    if (el.getBoundingClientRect().top < margin) {
      el.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, [value, ref]);
}
