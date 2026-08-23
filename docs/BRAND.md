# Brand — Ontology Atlas

> The **meaning** of the mark and the **usage rules** for assets. The source of truth for coordinates is
> [`src/shared/ui/brand-mark.tsx`](../src/shared/ui/brand-mark.tsx), and this document defines what it says and where to use it.

## One Sentence

> **A knowledge map that helps you understand the entire codebase by starting from central concepts and following relationships and hierarchy.**

English tagline — **Map your codebase knowledge.**
Korean — **Connect the knowledge of your codebase and explore its structure.**

---

## Meaning by Element

This mark is not decoration but **a drawing of the product's data model**. The order of layers
matches `element → capability → domain → project`.

### Central Hexagon — Core Concept

The smallest unit of knowledge for understanding a project. It represents a single concept recorded in the ontology, such as a domain, feature, component,
or implementation element.

This is why it has the **thickest line** (`core: 19`) in this mark — the rest is
the context surrounding it.

### Three Circular Nodes — Core Concepts and Intersections

Nodes representing the domain, function, and implementation elements that make up the codebase. Arranged in three directions, this illustrates that **a single concept can connect to and expand across multiple areas**.

The three nodes are **anchored at the vertices of the central hexagon**. If they were floating dots, it would become a common molecular icon, losing the meaning of "interconnected layers."

### Lines Connecting Nodes — Typed Relationships

Not simple connections, but relationships with **defined semantics** like `contains`, `depends_on`, `implements`, and `relates`. These lines convey that Atlas is not just a note-taking tool, but a **computable and queryable graph**.

### Nested Hexagons — Hierarchy of Knowledge

The structure expanding from inside to outside is the hierarchy itself.

```
element  →  capability  →  domain  →  project
  Core          Middle         Node/Spoke    Outer
```

A flow starting from small implementation evidence to grasp the structure of the entire project.

### Dashed Layer — The Invisible Map

It represents not only the currently documented structure but also **inferable connections, missing relationships, and explorable paths**. The key point is that it is dashed, not solid — a knowledge map that is **continuously discovered and updated**, rather than having a finished boundary.

### Outer Hexagon — Boundary of the Codebase

A boundary enclosing the entire repository/project. It also signifies **local-first** — all information resides within user-owned local Markdown and codebases, not external services.

### The Hexagonal Form — Structure and Scalability

Hexagons interlock seamlessly, depicting how independent concepts come together to form a larger system. Simultaneously, it evokes the technical impression of map cells, modules, and graph nodes.

---

## Colors

| Name | Value | Usage |
|---|---|---|
| Brand Ember | `#C14A24` | Solid mark, tagline, global app accent |
| Gradient Start | `#E46238` | Top-left of brand asset mark |
| Gradient End | `#A83E1D` | Bottom-right of brand asset mark |
| Plate | `#15182C` → `#06081A` | App icon background |

**The gradient's range is outside the app DOM.** It is used only for OS icons, favicons, og images, and banners; the mark drawn inside the app (`<BrandMark>`) is a single color via `currentColor`. This is not a preference but a charter — a strict boundary defined in the "Moving Gradient Background" section of `.claude/rules/forbidden.md`. New hues or multi-color gradients are also prohibited in brand assets.

---

## Size Ladder — Layering at Smaller Sizes

| Stage | Size | Layers Retained |
|---|---|---|
| `full` | ≥64px | Outer · Dashed · Middle · Core · 3 Spokes · 3 Nodes |
| `compact` | 20~48px | Outer · Middle · 3 Nodes |
| `micro` | ≤18px | Outer · Filled Core |

**Simply removing layers is insufficient.** The stroke width of the retained layers must also be redefined for that size — if strokes drop below 1 device px, anti-aliasing turns them into gray mush, and if ink spacing falls below 1px, layers merge into one blob. Empirical evidence and floor values are enforced by `tests/contract/brand-asset-parity.contract.test.ts`.

**The mark's size is defined by the ink, not the viewBox.** Within the 512 viewBox, the ink occupies only 418 pixels vertically, so when scaled to the viewBox, the actually visible mark is much smaller.

---

## Asset List — What and When to Use

All located under `public/brand/`. **Do not create them manually** — the pipeline below generates them.

### Mark only

| File | Use case |
|---|---|
| `mark.svg` | Gradient mark. Documentation, banners, presentations |
| `mark-mono.svg` | `currentColor` — **only when inserting as inline SVG**. If placed via `<img>`, it won't inherit color and will appear black |
| `icon-mono-light.svg` / `.png` | White background + black mark. Light backgrounds, print |
| `icon-mono-dark.svg` / `.png` | Black background + white mark. Dark backgrounds, watermarks |

### Horizontal lockup

| File | Use case |
|---|---|
| `lockup.svg` · `lockup.png` · `lockup@2x.png` | Default. Dark backgrounds |
| `lockup-light.svg` · `lockup-light@2x.png` | Light background (solid black) |
| `lockup-dark.svg` · `lockup-dark@2x.png` | Dark background (solid white) |
| `lockup-compact.svg` | No tagline. **Use this if height is less than 48px** |

**Minimum size**: Lockups with taglines must not be used below **48px height**. Below that, the tagline becomes unreadable; illegible text is just ink smudge. For smaller sizes, use `lockup-compact`; below 24px, use the mark only.

**Padding**: The lockup SVG's viewBox fits **exactly to the ink** (optical padding is 0). Surrounding padding is provided by the consumer — minimum padding is **0.4x the mark height**.

### App/OS

| File | Use case |
|---|---|
| `app/icon.svg` | Favicon (micro, solid color) |
| `app/apple-icon.png` | Apple Touch Icon 180 |
| `src-tauri/icons/*` | macOS `.icns` · Windows `.ico` · Tile |
| `public/og-image.png` | Link preview card **1200×630** — must match the size declared in `app/layout.tsx` |
| `public/brand-icon-512.png` | PWA manifest |
| `public/logo.png` | Large logo within the app |

### SVG vs PNG

Lockup SVGs contain **live text**, so they open and edit everywhere, but in environments without Pretendard, they fall back to system sans-serif, changing character widths. **Use PNG where pixel accuracy is critical** (README images, presentations, external distribution) — PNG renders exactly as the browser bakes with the real font.

We do not outline the glyphs because it requires a font parser dependency (`forbidden.md` — new dependencies must be justified). We deemed the cost of adding one for this single asset unacceptable, so we provide both.

---

## How to build — three steps, run once by a human

```bash
node scripts/build-brand-assets.mjs     # coordinates → SVG
node scripts/build-brand-raster.mjs     # → open http://127.0.0.1:8231/ in browser
node scripts/install-brand-icons.mjs    # install PNG/icns/ico to 27 destinations
```

This is not automated. A human runs it once when icons change, and the results are committed; product builds do not depend on these scripts.

The rasterization uses a browser to avoid adding new image dependencies (sharp·resvg) to the repository. Also, the lockup **relies on the browser to embed Pretendard and measure the ink** to get the viewBox right — hardcoding values measured without fonts will silently break.

---

## Do not

- **Do not redraw the mark.** If coordinates need changing, update `brand-mark.tsx` and rerun the pipeline. Hand-made assets will inevitably fall out of sync — in fact, `logo.png` and `og-image.png` carried the deprecated "A" logo until 2026-07-30, and og images were served **every time they were shared**.
- **Do not uniformize stroke weight.** The core > outer > middle hierarchy is this mark's identity.
- **Do not rotate, italicize, or distort the mark.** Maintain the fixed aspect ratio of the tall hexagon.
- **Do not place text over the mark.** Lockups are horizontal only.
- **Do not add new colors.** Indigo single hue only.
- Do not use the gradient mark inside app screens — `<BrandMark>` uses `currentColor`.

---

## Gates

| Spec | Where it's enforced |
|---|---|
| Component ↔ asset script coordinate match | `tests/contract/brand-asset-parity.contract.test.ts` (**output** comparison) |
| Stroke/gap floor at small sizes | Same file |
| All asset files exist and use the latest mark | `tests/contract/brand-assets-present.contract.test.ts` |
| Gradient only outside app DOM | `.claude/rules/forbidden.md` + `BrandMark` tests |
