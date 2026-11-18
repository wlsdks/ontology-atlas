import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Files under `src/shared/ui/**` not registered in `ATLAS_BOUND` (the core) may not import an app
 * binding: a core part that fetches its own strings, routing or upper layers belongs to this app.
 */

const ROOT = process.cwd();
const UI_DIR = path.join(ROOT, "src/shared/ui");

/**
 * **Parts for which app binding is correct** — not extraction candidates. Each row
 * carries why it belongs to this app. So this list cannot become an alibi, the
 * contract below asks back whether **a registered file really has an app binding or
 * carries Atlas domain vocabulary.**
 */
const ATLAS_BOUND: ReadonlyArray<readonly [file: string, why: string]> = [
  ["controls/chrome-tile.tsx", "map chrome 36px tile contract + i18n Link — the locked-scale contract belongs to this app"],
  ["controls/chrome-chip.tsx", "same chrome contract (--chrome-tile-size)"],
  ["controls/get-app-link.tsx", "the browser-only door to this app's /download route through the i18n Link"],
  ["fallbacks/gateway-entry-fallback.tsx", "screen dedicated to the gateway (/download)"],
  ["fallbacks/map-entry-fallback.tsx", "screen dedicated to the map"],
  ["routing/route-focus-manager.tsx", "Next.js routing + i18n navigation"],
  ["fallbacks/route-loading-fallback.tsx", "Next.js routing loading surface"],
  ["routing/route-memory.tsx", "Next.js routing memory"],
  ["routing/locale-redirect.tsx", "locale routing fallback"],
  ["hints/term-hint.tsx", "reads this app's glossary messages (termHints)"],
  ["document/locale-html-lang.tsx", "locale html lang synchronisation"],
  ["marks/brand-mark.tsx", "Atlas brand asset"],
  ["marks/github-mark.tsx", "external service mark — this app's link asset"],
  ["marks/x-mark.tsx", "external service mark — this app's link asset"],
  ["ontology-node/map-kind-glyph.tsx", "ontology kind data mark"],
  ["ontology-node/last-edit-subject-row.tsx", "agent | human type union — a proposition of product identity"],
  ["ontology-node/mtime-conflict-badge.tsx", "expected_mtime concurrency contract of patch_concept"],
  ["ontology-node/node-explanation-edit.tsx", "node body = the node's explanation"],
  ["ontology-node/similar-node-warning.tsx", "duplicate node warning — vault vocabulary"],
  ["status/frame-meter.tsx", "map frame measurement — an app-only instrument"],
];

/** What a core part must not have — this app's routing, translations, or upper layers. */
const APP_COUPLING = [
  { pattern: "next-intl", why: "reading translations itself ties it to this app's message namespaces" },
  { pattern: "@/i18n", why: "ties it to this app's locale routing" },
  { pattern: "next/navigation", why: "ties it to the Next.js router" },
  { pattern: "@/entities", why: "upper FSD layer — domain knowledge leaks into the part" },
  { pattern: "@/features", why: "upper FSD layer" },
  { pattern: "@/views", why: "upper FSD layer" },
  { pattern: "@/widgets", why: "upper FSD layer" },
] as const;

export function importSources(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) out.push(m[1]);
  for (const m of source.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  return out;
}

function uiFiles(): string[] {
  return readdirSync(UI_DIR, { recursive: true })
    .map((f) => String(f).split(path.sep).join("/"))
    .filter((f) => (f.endsWith(".tsx") || f.endsWith(".ts")) && !f.includes(".test."));
}

function coreFiles(): string[] {
  const bound = new Set(ATLAS_BOUND.map(([f]) => f));
  return uiFiles()
    .filter((f) => !bound.has(f))
    .sort();
}

describe("design system extraction boundary", () => {
  const core = coreFiles();

  it("the detector does not idle — the core exists and holds the main parts", () => {
    expect(core.length, "could not find a single core part").toBeGreaterThan(15);
    for (const known of ["controls/button.tsx", "fields/input.tsx", "fields/checkbox.tsx", "surfaces/dialog.tsx", "fields/segmented-control.tsx", "control-class.ts", "toast/toast.tsx"]) {
      expect(core, `${known} dropped out of the core`).toContain(known);
    }
  });

  it("core parts do not import app bindings", () => {
    const offenders: string[] = [];
    for (const file of core) {
      const sources = importSources(readFileSync(path.join(UI_DIR, file), "utf8"));
      for (const { pattern, why } of APP_COUPLING) {
        if (sources.some((s) => s === pattern || s.startsWith(`${pattern}/`))) {
          offenders.push(`${file} → ${pattern} (${why})`);
        }
      }
    }
    expect(
      offenders,
      "A core primitive is bound to this app. **Inject strings as props** (the precedent is " +
        "notificationsLabel in toast.tsx); if it needs routing, the primitive is not core but " +
        "ATLAS_BOUND, so register it there with the reason.",
    ).toEqual([]);
  });

  it("ATLAS_BOUND is not an alibi — registered files exist and carry a reason", () => {
    const existing = new Set(uiFiles());
    const problems: string[] = [];
    for (const [file, why] of ATLAS_BOUND) {
      if (!existing.has(file)) problems.push(`${file}: does not exist`);
      if (why.trim().length < 8) problems.push(`${file}: the reason is empty`);
    }
    expect(problems).toEqual([]);
  });

  /* ── Standing probes (/gate-probe) ── */
  it("probe: extracts the import source exactly", () => {
    const sample = [
      "import { useTranslations } from 'next-intl';",
      "import { Link } from \"@/i18n/navigation\";",
      "const m = await import('@/features/x');",
      "import { cn } from '@/shared/lib/cn';",
    ].join("\n");
    expect(importSources(sample)).toEqual([
      "next-intl",
      "@/i18n/navigation",
      "@/shared/lib/cn",
      "@/features/x",
    ]);
  });
});
