# Heatmap Port — Known Issues

## Bugs (broken behavior)

- [ ] **Color scale selector does nothing.** `paint` in `AnimatedGrid` uses
  `useCallback(..., [])` — empty deps. The `colorFn` closure is captured once
  at mount and never updates. Switching Sequential → Viridis has zero effect
  on the canvas. Fix: store `colorFn` in a ref so `paint` always reads the
  latest, or add it to the dep array and re-create the animator.

- [ ] **Range slider thumb invisible.** Thumb background is
  `var(--color-surface-raised)` — same as the canopy panel behind it. In light
  mode: white thumb on near-white surface. In dark mode: dark thumb on dark
  surface. Only visible by a faint `--shadow-sm`. Needs a contrasting fill
  (e.g. `var(--color-interactive)`) or a visible border.

- [ ] **Range slider has no active/dragging feedback.** No `:active` state on
  the thumb — no color shift, no scale change, no shadow increase. You can't
  tell you're holding it. The track also has no filled portion showing current
  value position.

- [ ] **Tab buttons missing `:focus-visible`.** Keyboard navigation through
  tabs gives no visual indicator. `.tab-group__tab` has `:hover` but no
  `:focus-visible` rule. Accessibility failure.

- [ ] **Select `outline: none` with no `:focus-visible` guard.** Line 337 of
  blocks.css kills the outline on all focus (including keyboard). Should be
  `:focus-visible` only, or at minimum provide a visible ring that keyboard
  users can see.

## CSS issues

- [ ] **`--legend-bar-height: 10px` raw value in tokens.css.** Line 255. Not
  referencing any space token. Should be `var(--space-2)` or a named intent.

- [ ] **Probe wrapper uses inline CSS properties.** Data.tsx line 265:
  `style={{ position: "absolute", visibility: "hidden", pointerEvents: "none" }}`.
  These are direct CSS properties, not custom property contracts. Violates CUBE.
  Should be a utility class (`.sr-only` already exists but clips — need a
  `.measurement-probe` or similar that hides without clipping).

- [ ] **Range input missing `::-webkit-slider-runnable-track`.** We style the
  `input[type="range"]` element itself for track appearance, which works in
  most browsers, but the proper WebKit pseudo-element is unstyled. Could cause
  visual inconsistency on Safari.

## Architecture

- [ ] **`AnimatedGrid` is a hook without `use` prefix.** It calls `useRef`,
  `useCallback`, `useEffect` internally — it is a hook. React's rules of hooks
  require the `use` prefix. Linters will flag this. Rename to `useAnimatedGrid`.

- [ ] **`loading` prop is dead.** `HeatmapProps` accepts `loading: boolean`
  but the `Heatmap` component never reads it. Either implement a loading state
  (pulse animation is already wired in `AnimatedGrid.startPulse`) or remove
  the prop from the interface.

- [ ] **`roundRect(..., 3)` raw pixel border radius.** Lines 453/455 in
  Heatmap.tsx. Canvas cells use a hardcoded 3px corner radius disconnected
  from `--radius-sm` or any CSS token. Needs a `getComputedStyle` cache read
  like the palette system uses.

- [ ] **Raw rgba in canvas text color helpers.** `heatmapTextColor` and
  `divergingTextColor` in canvas.ts return hardcoded `"rgba(255,255,255,0.9)"`
  and `"rgba(0,0,0,0.7)"`. Not used by demo yet, but the moment someone
  renders text on cells these bypass the token system entirely.

## Coupling

- [ ] **Slider ↔ plot coupling is implicit and fragile.** The threshold slider
  sets React state, which triggers a `useEffect` that calls
  `rawGrid.setNormalized`. This works for a demo but the data flow is
  invisible — there's no explicit contract between "this control modifies that
  panel." When real chapters declare their own controls+panels, this needs a
  cleaner binding pattern (callback refs, or controls that directly reference
  their target panel).
