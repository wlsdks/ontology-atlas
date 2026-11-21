import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Raw form elements outside the primitive layer cannot exceed the ceiling, and new files start at 0 so
 * the primitive carries name enforcement and error wiring (aria-invalid, describedby, role=alert).
 * `src/shared/ui/` is excluded as their home; walks all of `src/`, comments stripped.
 */

const ROOT = process.cwd();

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Terminates an opening tag by brace depth, handling multi-line tags (same as the icon ratchet). */
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

interface FieldScan {
  /** Per-file counts of text-family elements (plain `<input>`, `<textarea>`). */
  text: Map<string, number>;
  /** Per-file counts of checkbox, radio, and range. */
  special: Map<string, number>;
}

export function scanFieldSource(rel: string, raw: string, acc: FieldScan): void {
  const source = stripComments(raw);
  for (const m of source.matchAll(/<(input|textarea)\b/g)) {
    const tag = openingTag(source, m.index ?? 0);
    const type = /type="([a-z]+)"/.exec(tag)?.[1];
    const bucket =
      m[1] === "input" && type !== undefined && ["checkbox", "radio", "range"].includes(type)
        ? acc.special
        : acc.text;
    bucket.set(rel, (bucket.get(rel) ?? 0) + 1);
  }
}

function scanProduction(): FieldScan {
  const acc: FieldScan = { text: new Map(), special: new Map() };
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === "node_modules" || name === ".next") continue;
        walk(p);
        continue;
      }
      if (!name.endsWith(".tsx") || name.endsWith(".test.tsx")) continue;
      const rel = path.relative(ROOT, p);
      if (rel.startsWith("src/shared/ui/")) continue;
      scanFieldSource(rel, readFileSync(p, "utf8"), acc);
    }
  };
  for (const root of ["src", "app"]) walk(path.join(ROOT, root));
  return acc;
}

/**
 * Text-family ceiling: existing sites comply with the value layer and carry no repayment duty, but
 * cannot grow; if they shrink, the ceiling comes down with them.
 */
const TEXT_CAP: ReadonlyArray<readonly [file: string, count: number]> = [
  ["src/features/docs-vault-local/ui/WebManualConnectPanel.tsx", 1],
  ["src/features/project-edit/ui/DependencyPicker.tsx", 1],
  ["src/features/project-edit/ui/MarkdownField.tsx", 1],
  ["src/features/project-edit/ui/project-form-parts.tsx", 2],
  ["src/features/project-quick-edit/ui/ProjectQuickEditPanel.tsx", 4],
  ["src/views/docs-vault/ui/parts/doc-frontmatter/QuickPatchSection.tsx", 1],
  ["src/views/docs-vault/ui/parts/DocsSidebarBody.tsx", 1],
  ["src/views/home/ui/create/OntologyBootstrapForm.tsx", 1],
  ["src/views/project-detail/ui/ProjectActions.tsx", 1],
  ["src/views/project-detail/ui/construction-review/ConstructionReviewPanel.tsx", 3],
  ["src/widgets/app-settings-menu/ui/model-connections/KeyDraftForm.tsx", 1],
  ["src/widgets/app-settings-menu/ui/model-connections/LocalRunnerRow.tsx", 1],
  ["src/widgets/atlas-git-panel/ui/ActionDock.tsx", 1],
  ["src/widgets/atlas-git-panel/ui/RemoteControls.tsx", 1],
  ["src/widgets/docs-quick-drawer/ui/DocsQuickDrawer.tsx", 1],
  ["src/widgets/docs-vault/ui/DocsVaultEditor.tsx", 1],
  ["src/widgets/docs-vault/ui/DocsVaultUnifiedPalette.tsx", 1],
  ["src/widgets/search-palette/ui/SearchPalette.tsx", 1],
  ["src/widgets/topology-index-panel/ui/TopologyIndexPanel.tsx", 1],
  ["src/widgets/topology-index-panel/ui/TopologyRealmLedger.tsx", 1],
  ["src/widgets/vault-agent-panel/ui/composer/AgentComposer.tsx", 2],
];

/**
 * Registered special types — they cannot grow without evidence. checkbox is 0
 * everywhere after migration, radio is 0. The single range is the product of a
 * **rejected** promotion to Slider (1 consumer; the condition for revisiting is a PR
 * introducing a second range consumer outside settings, at which point the `w-28`
 * label coupling is unwound).
 */
const SPECIAL_REGISTERED: ReadonlyArray<readonly [file: string, count: number, why: string]> = [
  [
    "src/widgets/app-settings-menu/ui/settings-primitives.tsx",
    1,
    "Slider(type=range) — its only consumers are 2 settings sheets, so promotion to shared was rejected (design-system council, 2026-08-15). Promote it in the PR that adds a second consuming surface.",
  ],
];

describe("form adoption ratchet", () => {
  const scan = scanProduction();
  const textLedger = new Map(TEXT_CAP);
  const specialLedger = new Map(
    SPECIAL_REGISTERED.map(([file, count]) => [file, count] as const),
  );

  it("the detector does not idle — the denominator exists and the ledger files exist", () => {
    const total = [...scan.text.values()].reduce((a, b) => a + b, 0);
    expect(total, "could not count a single raw form element — the worker died").toBeGreaterThan(20);
    for (const [file] of [...TEXT_CAP, ...SPECIAL_REGISTERED]) {
      expect(statSync(path.join(ROOT, file)).isFile(), `${file} does not exist`).toBe(true);
    }
  });

  it("raw text-type <input>/<textarea> cannot exceed the cap — new files use Input/Textarea", () => {
    const over: string[] = [];
    for (const [file, count] of scan.text) {
      const cap = textLedger.get(file) ?? 0;
      if (count > cap) over.push(`${file}: ${count} > cap ${cap}`);
    }
    expect(
      over,
      "do not write new raw text fields — Input/Textarea (shared/ui/fields/input.tsx) owns name enforcement and error wiring.",
    ).toEqual([]);
  });

  it("checkbox/radio are 0 and range has a single registration", () => {
    const over: string[] = [];
    for (const [file, count] of scan.special) {
      const cap = specialLedger.get(file) ?? 0;
      if (count > cap) over.push(`${file}: ${count} > registered ${cap}`);
    }
    expect(
      over,
      "raw checkbox uses Checkbox (shared/ui/fields/checkbox.tsx). Creating radio/range needs the design-system council convened first.",
    ).toEqual([]);
  });

  it("reclaimed caps come down — a ledger more generous than the measurement is not a ratchet", () => {
    const stale: string[] = [];
    for (const [file, cap] of TEXT_CAP) {
      const actual = scan.text.get(file) ?? 0;
      if (actual < cap) stale.push(`${file}: cap ${cap} > measured ${actual} — lower the cap`);
    }
    for (const [file, cap] of SPECIAL_REGISTERED) {
      const actual = scan.special.get(file) ?? 0;
      if (actual < cap) stale.push(`${file}: registered ${cap} > measured ${actual}`);
    }
    expect(stale).toEqual([]);
  });

  /* ── Resident probes (/gate-probe: passing is not evidence) ── */
  it("probe: classification, comments and multi-line tags are all counted correctly", () => {
    const probe = (body: string): FieldScan => {
      const acc: FieldScan = { text: new Map(), special: new Map() };
      scanFieldSource("probe.tsx", body, acc);
      return acc;
    };
    expect(probe('<input type="text" />').text.get("probe.tsx")).toBe(1);
    expect(probe("<textarea rows={3} />").text.get("probe.tsx")).toBe(1);
    expect(probe('<input\n  type="checkbox"\n  checked={a ? b : c}\n/>').special.get("probe.tsx")).toBe(1);
    expect(probe('<input type="range" />').special.get("probe.tsx")).toBe(1);
    // An input with no type is text-family.
    expect(probe("<input value={v} />").text.get("probe.tsx")).toBe(1);
    // Mentions inside comments are not counted.
    expect(probe('// <input type="text" /> 를 설명\nconst a = 1;').text.size).toBe(0);
  });
});
