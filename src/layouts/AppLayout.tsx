import { useRef, useLayoutEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";

const chapters = [
  { path: "/expression", label: "Expression" },
  { path: "/histones", label: "Histones" },
  { path: "/chromatin", label: "Chromatin" },
  { path: "/disease", label: "Disease" },
  { path: "/conservation", label: "Conservation" },
  { path: "/data", label: "Data" },
];

export default function AppLayout() {
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
      <aside className="app-sidebar">
        <p className="app-sidebar__brand">E2P</p>
        <nav aria-label="Chapters" ref={navRef} className="app-sidebar__nav-wrapper">
          <div
            className="app-nav-indicator"
            style={{
              transform: `translateY(${indicator.y}px)`,
              height: indicator.height,
              opacity: indicator.ready ? 1 : 0,
            }}
          />
          <ul className="app-sidebar__nav stack" role="list">
            {chapters.map(({ path, label }) => (
              <li key={path}>
                <NavLink to={path} className="app-nav-link u-promote-layer">
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
