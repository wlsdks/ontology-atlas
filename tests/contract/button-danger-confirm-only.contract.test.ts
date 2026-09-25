import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `Button variant="danger"` stays on the confirm step of an irreversible action.
 *
 * The variant (2026-09-25, `src/shared/ui/button.tsx`) is red so that "Remove" and "Cancel" in a
 * confirm row stop differing only by order. Red that also appears on the button that *opens* the
 * question, or on anything merely important, stops meaning "this is the irreversible step" — and
 * a design system spreads a colour one plausible call site at a time.
 *
 * The allowlist is honest in two parts, because either alone can be gamed:
 *
 * 1. **Every use carries `data-confirm-step`** on the same element — the author states, in the
 *    DOM, that this button is the second press of a two-press action.
 * 2. **Every file that uses it is listed below with the confirm row it belongs to.** A new file
 *    fails until a reviewer reads the reason and adds it; the marker alone is self-declared.
 *
 * A use is any `<Button …>` opening tag or `buttonVariants({ … })` call whose text contains the
 * string literal `danger`, so a ternary (`variant={x ? 'danger' : 'ghost'}`) counts too.
 */
const CONFIRM_ROWS: Record<string, { uses: number; row: string }> = {
  "src/views/automations/ui/AutomationScheduleActions.tsx": {
    uses: 1,
    row: "Remove a schedule — shown only after the trash icon was pressed, beside Cancel.",
  },
  "src/features/agent-activity/ui/CompanionMemories.tsx": {
    uses: 1,
    row: "Remove or reset companion memories — the confirmation page, beside Cancel.",
  },
  "src/views/docs-vault/ui/parts/DeleteDocDialog.tsx": {
    uses: 1,
    row: "Delete a document — the alert dialog opened by the page's delete door or the palette, beside Cancel.",
  },
};

const ROOT = process.cwd();

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** The opening tag, ended by brace depth so a `=>` inside a prop does not end it early. */
function openingTag(source: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < source.length; i += 1) {
    const c = source[i];
    if (quote) {
      if (c === quote && source[i - 1] !== "\\") quote = null;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth += 1;
    else if (c === "}") depth -= 1;
    else if (c === ">" && depth === 0) return source.slice(from, i);
  }
  return source.slice(from, from + 2000);
}

const DANGER = /(['"`])danger\1/;

export function dangerUses(raw: string): { marked: number; unmarked: number } {
  const source = stripComments(raw);
  let marked = 0;
  let unmarked = 0;
  for (const m of source.matchAll(/<Button\b/g)) {
    const tag = openingTag(source, m.index ?? 0);
    if (!DANGER.test(tag)) continue;
    if (/\bdata-confirm-step\b/.test(tag)) marked += 1;
    else unmarked += 1;
  }
  for (const m of source.matchAll(/buttonVariants\(\{[^}]*\}\)/g)) {
    if (DANGER.test(m[0])) unmarked += 1; // a class string cannot carry the marker
  }
  return { marked, unmarked };
}

function productionFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === "node_modules" || name === ".next") continue;
        walk(p);
      } else if (/\.tsx?$/.test(name) && !/\.(test|spec|stories)\.tsx?$/.test(name)) out.push(p);
    }
  };
  walk(join(ROOT, "src"));
  walk(join(ROOT, "app"));
  return out.filter((f) => relative(ROOT, f) !== "src/shared/ui/button.tsx");
}

describe("Button danger is the confirm step only", () => {
  it("detects a marked use, an unmarked use, a ternary and a class-string use", () => {
    expect(dangerUses('<Button variant="danger" data-confirm-step onClick={() => go()}>x</Button>')).toEqual({ marked: 1, unmarked: 0 });
    expect(dangerUses('<Button variant="danger">x</Button>')).toEqual({ marked: 0, unmarked: 1 });
    expect(dangerUses("<Button variant={on ? 'danger' : 'ghost'}>x</Button>")).toEqual({ marked: 0, unmarked: 1 });
    expect(dangerUses("cn(buttonVariants({ variant: 'danger' }))")).toEqual({ marked: 0, unmarked: 1 });
    expect(dangerUses('<Button variant="ghost">danger zone</Button>')).toEqual({ marked: 0, unmarked: 0 });
  });

  it("every use is marked and sits in a listed confirm row", () => {
    const found: Record<string, number> = {};
    const unmarked: string[] = [];
    for (const f of productionFiles()) {
      const { marked, unmarked: bad } = dangerUses(readFileSync(f, "utf8"));
      const rel = relative(ROOT, f);
      if (marked + bad > 0) found[rel] = marked + bad;
      if (bad > 0) unmarked.push(`${rel} (${bad})`);
    }
    expect(Object.keys(found).length, "found no danger use at all — the scan is broken or the list should be empty").toBeGreaterThan(0);
    expect(unmarked, "variant=\"danger\" without data-confirm-step — red is only for the second press of an irreversible action").toEqual([]);
    expect(
      found,
      "a file uses Button danger outside the listed confirm rows — add it to CONFIRM_ROWS with the row it confirms, or use outline/ghost",
    ).toEqual(Object.fromEntries(Object.entries(CONFIRM_ROWS).map(([f, v]) => [f, v.uses])));
  });
});
