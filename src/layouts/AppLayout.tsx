import { useRef, useLayoutEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useTheme } from "../hooks/useTheme";

const chapters = [
  { path: "/data", label: "Data" },
  { path: "/expression", label: "Expression" },
  { path: "/histones", label: "Histones" },
  { path: "/chromatin", label: "Chromatin" },
  { path: "/disease", label: "Disease" },
  { path: "/conservation", label: "Conservation" },
];

export default function AppLayout() {
  const { theme, toggle } = useTheme();
  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState({ y: 0, height: 0, ready: false });
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const link = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (!link) return;
    const navTop = nav.getBoundingClientRect().top;
    const { top, height } = link.getBoundingClientRect();
    setIndicator({ y: Math.round(top - navTop), height: Math.round(height), ready: true });
  }, [pathname]);

  return (
    <div className="app-layout">
      <aside className="app-sidebar stack">
        <div className="wordmark cluster spread">
          <span>E2P</span>
          <button
            onClick={toggle}
            className="hover-accent transition-colors"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>
        <nav aria-label="Chapters" ref={navRef} className="anchor">
          <div
            className="app-nav-indicator"
            style={{
              transform: `translateY(${indicator.y}px)`,
              height: indicator.height,
              opacity: indicator.ready ? 1 : 0,
            }}
          />
          <ul className="stack" role="list">
            {chapters.map(({ path, label }) => (
              <li key={path}>
                <NavLink to={path} className="app-nav-link promote-layer">
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main className="app-layout__content">
        <Outlet />
      </main>
    </div>
  );
}
