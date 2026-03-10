import { useLayoutEffect, useState, RefObject } from "react";

interface SnappedRect {
  top: number;
  left: number;
  width: number;
  height: number;
  ready: boolean;
}

export function useSnappedRect(
  ref: RefObject<HTMLElement | null>,
  dependencies: unknown[] = []
): SnappedRect {
  const [rect, setRect] = useState<SnappedRect>({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    ready: false,
  });

  useLayoutEffect(() => {
    if (!ref.current) return;
    const rawRect = ref.current.getBoundingClientRect();
    setRect({
      top: Math.round(rawRect.top),
      left: Math.round(rawRect.left),
      width: Math.round(rawRect.width),
      height: Math.round(rawRect.height),
      ready: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ...dependencies]);

  return rect;
}
