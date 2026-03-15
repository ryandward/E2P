# Prompt for GenomeHub CUBE CSS Restructuring

Copy this into a Claude session with GenomeHub as the working directory.

---

You completed the color token rename. Now restructure GenomeHub's CSS into six CUBE layers. This is the hard part — you're splitting one monolithic `index.css` into six files with strict rules about what goes where.

## The Six Layers (in cascade order)

Import them in this exact order. Each layer overrides the one above it.

### 1. `reset.css` — Normalize browser defaults

No tokens, no opinions. Just a level playing field.

```css
*, *::before, *::after { box-sizing: border-box; }
* { margin: 0; padding: 0; }
```

Plus: `html` text-size-adjust, `body` min-height + line-height, media elements `display: block; max-width: 100%`, form elements `font: inherit; color: inherit`, heading overflow-wrap, link reset, list-style reset, table border-collapse.

**Rule:** Nothing in this file references a token. No `var(--anything)`. Pure browser normalization.

### 2. `tokens.css` — Raw values + intent aliases + element styles

This is the ONLY file that contains raw color values, pixel sizes, hex codes, or numeric literals.

Structure:
```
:root {
  /* Raw scales (neutral, brand, status ramps) */
  /* Intent aliases (--color-surface, --color-text, etc.) */
  /* Spacing, typography, radius, shadow, z-index, motion intents */
}

:root[data-theme="dark"] {
  /* Intent alias remaps ONLY — same names, different raw values */
}

/* Element-level styles: body, a, hr, ::selection, :focus-visible */
```

**Rule:** Every other file references ONLY the intent aliases from this file. If you see a hex value, OKLCH value, pixel size, or raw number in any other file, it's a violation.

### 3. `compositions.css` — Layout primitives (geometry only)

CUBE "C" layer. Spatial skeleton. Reusable layout patterns.

**ALLOWED:** `display`, `flex`, `grid`, `gap`, `padding`, `margin`, `width`, `height`, `min-width`, `max-width`, `position`, `align-items`, `justify-content`, `overflow`, `aspect-ratio`, `grid-template-*`, `grid-column`, `contain`, `clip-path`

**BANNED:** `color`, `background`, `background-color`, `border-color`, `box-shadow`, `font-*`, `opacity`, `transform` (visual), `text-*`, `fill`, `stroke`, any raw numeric literal. Values come from tokens via `var()`.

**Examples of compositions:** app layout grid, sidebar + content, card grid, stack (vertical flow), cluster (horizontal flow), center (max-width container), tab scroll container

**This is the hardest layer to get right.** If a style does geometry AND visual treatment, split it. The geometry goes here. The visual treatment goes in blocks or utilities.

### 4. `blocks.css` — Component-scoped visual styles

CUBE "B" layer. Named components. Visual treatment only — compositions handle the layout.

**Rules:**
1. Reference intent aliases only. Never raw values.
2. No `[data-*]` selectors — those belong in exceptions.
3. Blocks handle: `background-color`, `color`, `border`, `border-radius`, `box-shadow`, `font-size`, `font-weight`, `font-family`, `transition`, `cursor`, `text-transform`, `white-space`

**Examples:** `.button`, `.card`, `.badge`, `.tab`, `.dropdown`, `.axis-label`, `.tooltip`, `.app-nav-link`

### 5. `utilities.css` — Single-purpose overrides

CUBE "U" layer. One job each. Higher cascade priority than blocks.

**Rules:**
1. Reference intent aliases only.
2. No `[data-*]` selectors.
3. If a utility is only used by one block, it's a block declaration, not a utility.

**Two kinds:**
- Token appliers: `.surface-raised { background-color: var(--color-surface-raised); }`, `.color-muted { color: var(--color-text-muted); }`
- Interaction vocabulary: `.hover-surface:hover { background-color: var(--color-surface-sunken); }`, `.promote-layer { will-change: transform; }`

### 6. `exceptions.css` — Data-attribute state variations

CUBE "E" layer. Highest priority. The ONLY place where data drives visuals.

**Rules:**
1. Every selector targets a `[data-*]` attribute or `[aria-*]` attribute.
2. Reference intent aliases only.
3. Set properties on the CONTAINER with the data attribute. Children inherit via `currentColor` / `inherit`.
4. No layout properties (`display`, `grid`, `flex`, `gap`).

**Examples:**
```css
.button[data-variant="primary"] { background-color: var(--color-interactive); }
.button[data-variant="danger"] { background-color: var(--color-danger); }
.badge[data-state="active"] { background-color: var(--color-interactive); }
.tab[aria-selected="true"] { color: var(--color-text); }
```

## How to Execute

1. Create all six files in `packages/client/src/styles/` (or equivalent).
2. Go through `index.css` rule by rule. For each rule, ask: is this reset, token, composition, block, utility, or exception?
3. Move the rule to the correct file.
4. If a rule mixes concerns (e.g., layout + color), split it.
5. Update the import order to match the cascade: reset → tokens → compositions → blocks → utilities → exceptions.
6. Tailwind utilities (`text-*`, `bg-*`, `border-*`) map to the utilities layer or stay as Tailwind. Don't fight Tailwind — it already operates at the utility layer.

## Critical Constraints

- **Do NOT change any rendered output.** The app must look identical before and after.
- **Do NOT rename any classes.** The restructuring is about which FILE a rule lives in, not what it's called.
- **Do NOT introduce new CSS.** Only move existing rules between files.
- **Every raw value violation in layers 3–6 must be extracted to tokens.** If you find `border-radius: 4px` in a block, it becomes `border-radius: var(--radius-sm)` and `--radius-sm: 4px` goes in tokens.
- **`@keyframes` go in the file that owns the element they animate.** Usually blocks.
- **Media queries go in the file that owns the rules they modify.**
- **Tailwind's `@theme` block stays in tokens.** It's the token layer by definition.

## Verification

After restructuring:
1. `npm run build -w packages/client` must succeed.
2. Dev server must render identically.
3. `grep -rn '#[0-9a-fA-F]' compositions.css blocks.css utilities.css exceptions.css` must return zero results.
4. `grep -rn 'oklch' compositions.css blocks.css utilities.css exceptions.css` must return zero results (except inside `var()` references or `color-mix()` that reference tokens).

Save a summary of what went into each file to `docs/cube-restructure-log.md`.
