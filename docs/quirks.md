# Architectural Rules

## The DOM-to-GPU Rendering Bridge

Browsers operate in two distinct rendering phases: CPU-driven layout (floating-point math, vector text) and GPU-driven compositing (physical pixels, flat textures).  Bridging these worlds incorrectly causes visual artifacts, dropped frames, and text vibration.

**1. The Rule of Spatial Integers**
* **The Trigger:** Passing raw `getBoundingClientRect()` values (which return subpixel fractions like `145.239px`) to GPU-accelerated CSS properties (like `transform: translate`).
* **The Impact:** The GPU is forced to interpolate subpixels during motion, causing the browser to continuously recalculate the anti-aliasing of adjacent CPU-rendered elements (like text). This results in a visible "vibration" or jitter.
* **The Systemic Fix:** All DOM layout measurements must be strictly rounded to whole integers before being mapped to state or passed to CSS transforms. For ref-based measurements, use the `useSnappedRect` hook (`src/hooks/useSnappedRect.ts`). For dynamically-queried elements (e.g. `querySelector('[aria-current="page"]')`), apply `Math.round()` at the measurement site.

**2. The Rule of Layer Isolation**
* **The Trigger:** Hardware-accelerated elements (using `transform` or `opacity`) moving underneath or adjacent to static, vector-based text.
* **The Impact:** The browser engine constantly swaps between redrawing the text vectors on the CPU and moving the composite layer on the GPU, resulting in text that shifts in font-weight or bleeds at the edges.
* **The Systemic Fix:** Preemptively promote the static elements to their own GPU layer so the browser rasterizes them into a high-quality texture *before* the animation begins. Apply the `.u-promote-layer` utility class (`src/styles/utilities.css`) to the affected text elements.

## Variable Font Rendering

**3. Self-host variable fonts via `@fontsource-variable`**
* CDN-loaded fonts (Google Fonts, `rsms.me`) bypass Vite's bundler and provide no guarantees about variable axis support. Always use the NPM package (e.g. `@fontsource-variable/inter`) imported at the top of `main.tsx`.

**4. Never set `font-variation-settings` globally**
* Explicitly setting `"wght"` via `font-variation-settings` clobbers the `opsz` (optical sizing) axis. Use `font-weight` + `font-optical-sizing: auto` and let the browser map weight to the `wght` axis automatically.

**5. `text-rendering: optimizeLegibility` is harmful**
* Breaks variable font kerning tables in modern Chromium. Use `text-rendering: auto`.

**6. Global antialiasing is safe when GPU isolation is handled**
* `-webkit-font-smoothing: antialiased` on `body` is correct once subpixel vibration is solved via integer snapping (Rule 1) and layer promotion (Rule 2). Do not remove it to "fix" GPU issues — fix the GPU issues at their source.

## Scroll Behavior

**7. `scroll-behavior: smooth` is globally set on `html` and protected by `prefers-reduced-motion`**
* The reduced-motion media query overrides it with `scroll-behavior: auto !important`. This works for CSS-driven scrolls but is fragile — if JS ever sets `scroll-behavior` inline (e.g. `element.style.scrollBehavior = 'smooth'`), the `!important` in the media query cannot override inline styles. Always use CSS classes or `scrollTo({ behavior })` instead of inline style assignment.
