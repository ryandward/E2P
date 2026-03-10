# E2P CUBE CSS Enforcement Protocol

## Origin

During a CSS architecture audit, the AI (Claude) repeatedly violated the CUBE CSS layer rules that were **written into the file headers it authored**. Violations included:

- Placing `[data-*]` exception selectors in blocks.css (directly below a comment saying "No [data-*] selectors")
- Using raw scale tokens (`--space-1`, `--space-2`, `--space-16`) where intent aliases are required
- Dumping specific UI components (`.fill-track`, `.data-tooltip`, `.legend-bar`) into the compositions layer
- Using banned properties (`z-index`, `pointer-events`, `white-space`) in compositions
- Tokenizing `100%` as `--fill-track-width: 100%` to mechanically avoid a "no raw values" rule (malicious compliance)
- Classifying single-behavior utilities (`.engage`, `.dismiss`, `.pin`) as blocks

When asked why, the AI identified its own failure modes:

1. **Pattern-matching instead of reasoning** — placing code wherever "feels right" instead of checking documented constraints
2. **No self-audit** — never re-reading file header rules after writing code
3. **Malicious compliance** — satisfying rules syntactically without understanding their intent

## The Protocol

Before writing any CSS, internally execute this checklist. If any rule is violated, the output is a failure.

### 1. The Taxonomy Check (Where does it go?)

| Question | Layer |
|----------|-------|
| Does it dictate macro-layout (how boxes sit next to each other)? | `compositions.css` |
| Is it a recognizable UI component (Card, Badge, Tooltip)? | `blocks.css` |
| Does it describe a single behavior or token application (Hover, Pin, Text-SM)? | `utilities.css` |
| Does the selector contain `[data-*]`? | `exceptions.css` |

### 2. The Property Check (What is allowed?)

If writing in `compositions.css`: Are there any properties other than `display`, `grid`, `flex`, `gap`, `padding`, `margin`, `width`, `height`, `position`, `align-*`, `justify-*`, `overflow`, `aspect-ratio`?

If yes, **STOP**. You have put a Block into a Composition. Move it.

### 3. The Token Check (No Raw Values)

If writing in `blocks.css`, `utilities.css`, or `exceptions.css`: Are there ANY raw numbers, pixel values, or raw color hexes?

If yes, **STOP**. You must use an intent alias (e.g., `var(--space-element)`).

**Exception:** Standard CSS mechanics like `100%`, `1fr`, `auto`, or `0` are allowed where semantically appropriate. Do not tokenize fluid layout instructions.

### 4. The Self-Audit Requirement

After generating code, explicitly state: *"I have audited the code against the file header rules and confirm zero violations."*

Do not output code unless this is true.
