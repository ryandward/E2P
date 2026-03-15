# Prompt for GenomeHub CSS Audit

Copy this into a Claude session with GenomeHub as the working directory.

---

I need you to audit GenomeHub's CSS and produce a color token mapping for migration to a CUBE CSS architecture. Do NOT change any files yet — produce a mapping document only.

## Context

We have a sister project (E2P) with a mature CUBE CSS architecture: six layers (`reset → tokens → compositions → blocks → utilities → exceptions`), where **only `tokens.css` contains raw color values**. Every other layer references named intent aliases like `--color-surface`, `--color-text`, `--color-interactive`.

GenomeHub needs to adopt this architecture so the two projects can share a unified design system. The first step is mapping GenomeHub's current color values to E2P's token vocabulary.

## E2P's Token Vocabulary

Here are the intent aliases you're mapping TO. These are the canonical names:

### Surfaces
```
--color-surface:         main background
--color-surface-raised:  cards, elevated panels
--color-surface-sunken:  inset areas, gutters
--color-surface-frosted: translucent overlays
```

### Text
```
--color-text:         primary text
--color-text-muted:   secondary/hint text
--color-text-inverse: text on interactive/dark backgrounds
```

### Borders
```
--color-border:         standard borders
--color-border-frosted: translucent borders
```

### Interactive
```
--color-interactive:       buttons, links, active controls
--color-interactive-hover: hover state for interactive elements
```

### Accent
```
--color-accent:     brand accent
--color-accent-dim: subdued accent
```

### Controls
```
--color-control:  slider tracks, inactive control elements
```

### Focus
```
--color-ring:  focus outline
```

### Status
```
--color-success / --color-warning / --color-danger
--color-success-subtle / --color-warning-subtle / --color-danger-subtle
--color-success-border / --color-warning-border / --color-danger-border
```

### Selection
```
--color-selection:  text selection highlight
```

## Your Task

1. Search all CSS files in `packages/client/src/` for every raw color value: hex (`#...`), `rgb()`, `rgba()`, `hsl()`, `hsla()`, color keywords (white, black, transparent), and any existing CSS custom property that holds a color.

2. For each color value found, produce a row in a mapping table:

```
| File | Line | Current Value | Used For | Proposed Token |
```

- **Used For**: describe what this color does visually (e.g., "sidebar background", "hover highlight", "error text")
- **Proposed Token**: the E2P intent alias it maps to. If none fits, propose a new intent name following the `--color-{category}-{variant}` pattern.

3. Flag any colors that don't map to E2P's vocabulary. These are candidates for new tokens that E2P doesn't have yet (e.g., genomics-specific status colors, visualization overlays).

4. Note any inline styles in TSX/JSX files that contain color values — these need to move to CSS classes.

5. Identify GenomeHub's dark mode strategy. Does it use `prefers-color-scheme`? A data attribute? Class toggle? How does it compare to E2P's `[data-theme="dark"]` approach?

## Rules

- Do NOT modify any files.
- Do NOT propose CSS changes yet.
- Produce the mapping table and a summary of findings.
- If you find more than 100 color values, group them by category (surfaces, text, borders, etc.) rather than listing every instance.
- Note which colors appear most frequently — these are the highest-value tokens to migrate first.

## Output

Save your mapping to `docs/cube-color-audit.md` in the GenomeHub repo. I will review it before any migration begins.
