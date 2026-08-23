# Executor Marks — Where They Came From and What Was Fixed

The 38 SVGs in this folder are **other companies' product marks**. They are used
solely as identifiers to say "this is that tool," and must not be used to mimic
the vendor's design.

## Graphics (All 38)

| | |
|---|---|
| Source | [ACP Registry](https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json) — assets published by the protocol organization **for client UIs** |
| Acquisition Time | Once at build time (`pnpm acp:registry`). The app does not fetch images at runtime — per Trust Charter ① (runs offline) and ② (zero communication unless enabled by user) |
| Modifications | None. Committed exactly as received |
| Filtering | SVGs containing `<script>` or external `href` are excluded (`scripts/build-acp-registry.mjs`) |
| Rendering Method | Used as a **mask** (`VendorMark`). Content inside the SVG is not drawn on screen; only the silhouette remains, so other companies' files cannot affect our UI |

The registry rejects **filled-color SVGs** via registration rules — all 38 are
monochrome with `fill="currentColor"`. Therefore, colors come separately below.

## Colors (Only 11)

| | |
|---|---|
| Source | `hex` values from [simple-icons](https://github.com/simple-icons/simple-icons) `data/simple-icons.json` (CC0-1.0) |
| What We Use | **Only the color value**. Path data is not used — the graphics are the vendor's own marks from the registry above |
| Pairing | `BRAND_MARK` in `scripts/build-acp-registry.mjs` — **only manually verified pairs** are included |
| If Missing | Rendered in grayscale (`--color-vendor-mark-ink`) |

### Why Not Automatic Pairing?

Automatic name-based matching resulted in **wrong brand colors** (observed in 2 cases):

- `amp-acp` (Sourcegraph Amp) → Google AMP's blue `#005AF0`
- `pi-acp` → Raspberry Pi

**Wrong color is worse than no color.** If missing, the screen just falls back to
grayscale; if wrong, it misrepresents another brand. Therefore, automatic matching
is not used.

### The 11 With Colors Now

| Executor | simple-icons Title |
|---|---|
| `claude-acp` | Claude Code |
| `gemini` | Google Gemini |
| `mistral-vibe` | Mistral AI |
| `qwen-code` | QWen |
| `codebuddy-code` | CodeBuddy |
| `glm-acp-agent` | Z.ai |
| `cursor` | Cursor |
| `github-copilot-cli` | GitHub Copilot |
| `opencode` | OpenCode |
| `kimi` | Kimi |
| `cline` | Cline |

### OpenAI (Codex) Is Intentionally Empty

The OpenAI mark was **removed** from simple-icons v16 at the vendor's request. We
use graphics published by the ACP Registry for client UIs but **do not include
colors**. For the same reason, Buzz also does not bundle the OpenAI mark (`block/buzz`
`desktop/public/harness-logos/CREDITS.md`).

## Why Disclose the Plate?

This app uses a dark theme, but the marks placed here belong to vendors and are
mostly drawn for light backgrounds — **6 of the 11 verified colors** are black to
`#2D2D2D`. Placing them directly on a dark plate results in black-on-black (this
actually happened on 2026-08-16). Buzz also provides a separate light plate for
dark marks.

Plates, borders, and base ink are all grayscale tokens
(`--color-vendor-plate` · `-edge` · `--color-vendor-mark-ink`) and live **only
within the 32px tile**. Gate: `tests/contract/vendor-mark-plate.contract.test.ts`.

## Adding Marks

1. Graphics come automatically from the registry — do not add them manually.
2. To add color, write the **verified pair** in `BRAND_MARK` and add one line to
   the table above.
3. Do not include marks that vendors prohibit redistribution of. Leaving them
   grayscale (no color) is the default and represents correct behavior, not an
   incomplete state.
