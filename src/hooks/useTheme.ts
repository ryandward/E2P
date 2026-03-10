import { useState, useEffect } from "react";

type Theme = "light" | "dark";

const KEY = "theme";

function stored(): Theme | null {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : null;
}

function system(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(t: Theme) {
  document.documentElement.dataset.theme = t;
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => stored() ?? system());

  useEffect(() => apply(theme), [theme]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      if (!stored()) setTheme(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggle = () =>
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem(KEY, next);
      return next;
    });

  return { theme, toggle } as const;
}
