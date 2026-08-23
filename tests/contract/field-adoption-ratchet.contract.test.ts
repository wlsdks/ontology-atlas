import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Form adoption ratchet — **raw form elements outside the primitive layer cannot
 * exceed the ceiling.**
 *
 * **Why** (ratified by the system seat 2026-08-15, docs/DECISIONS.md). A behaviour
 * layer now exists (`Input`/`Textarea`/`Checkbox` in src/shared/ui). Existing direct
 * `fieldClass` call sites are **not debt** (they comply with the value layer, and a
 * ledger declared closed is not reopened). This ratchet enforces one thing: **raw
 * form elements in a new file are 0 from day one** — so that when an agent assembles
 * from this system alone, the primitive carries the name enforcement and the error
 * wiring (aria-invalid, describedby, role=alert).
 *
 * `type="checkbox"` is at **0 everywhere** after migration (6 places → Checkbox),
 * radio was already 0, and range has one settings Slider registered with its
 * evidence.
 *
 * Reach: `src/shared/ui/` is excluded — the primitive layer is the legitimate home
 * of native elements, and spec changes to that layer are guarded by design.md's
 * "to change the spec" list. Same exhaustive walk as dialog-adoption (no hand
 * lists), counted after comments are stripped.
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
 * The text-family ceiling — the founding inventory of 2026-08-15 (38 places across
 * 25 files). **A ceiling, not debt**: existing sites comply with the value layer and
 * carry no obligation to repay; they simply cannot grow. If they shrink, the ceiling
 * comes down with them.
 */
const TEXT_CAP: ReadonlyArray<readonly [file: string, count: number]> = [
  ["src/features/docs-vault-local/ui/WebManualConnectPanel.tsx", 1],
  ["src/features/project-edit/ui/DependencyPicker.tsx", 1],
  ["src/features/project-edit/ui/MarkdownField.tsx", 1],
  ["src/features/project-edit/ui/ProjectForm.tsx", 2],
  ["src/features/project-quick-edit/ui/ProjectQuickEditPanel.tsx", 4],
  ["src/views/docs-vault/ui/parts/DocFrontmatterBlock.tsx", 1],
  ["src/views/docs-vault/ui/parts/DocsSidebarBody.tsx", 1],
  ["src/views/home/ui/CreateNodeForm.tsx", 2],
  ["src/views/home/ui/InlineFieldEdit.tsx", 1],
  ["src/views/home/ui/OntologyBootstrapForm.tsx", 1],
  ["src/views/ontology-insights/ui/tabs/MeaningGapSection.tsx", 1],
  ["src/views/project-detail/ui/ProjectDetailPage.tsx", 1],
  ["src/views/project-detail/ui/construction-review/ConstructionReviewPanel.tsx", 3],
  ["src/widgets/app-settings-menu/ui/AiConnectionPanel.tsx", 2],
  ["src/widgets/atlas-git-panel/ui/AtlasGitPanel.tsx", 2],
  ["src/widgets/docs-quick-drawer/ui/DocsQuickDrawer.tsx", 1],
  ["src/widgets/docs-vault/ui/DocsVaultEditor.tsx", 1],
  ["src/widgets/docs-vault/ui/DocsVaultUnifiedPalette.tsx", 1],
  ["src/widgets/search-palette/ui/SearchPalette.tsx", 1],
  ["src/widgets/topology-index-panel/ui/TopologyIndexPanel.tsx", 1],
  ["src/widgets/topology-index-panel/ui/TopologyRealmLedger.tsx", 1],
  ["src/widgets/vault-agent-panel/ui/VaultAgentPanel.tsx", 2],
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
    "Slider(type=range) — 소비자가 설정 시트 2곳뿐이라 shared 승격 반려(2026-08-15 체계석). 두 번째 소비 표면이 생기면 그 PR 에서 승격한다.",
  ],
];

describe("폼 채택 래칫", () => {
  const scan = scanProduction();
  const textLedger = new Map(TEXT_CAP);
  const specialLedger = new Map(
    SPECIAL_REGISTERED.map(([file, count]) => [file, count] as const),
  );

  it("탐지기가 공회전하지 않는다 — 분모가 실재하고 장부 파일이 실재한다", () => {
    const total = [...scan.text.values()].reduce((a, b) => a + b, 0);
    expect(total, "raw 폼 원소를 하나도 못 세었다 — 워커가 죽었다").toBeGreaterThan(20);
    for (const [file] of [...TEXT_CAP, ...SPECIAL_REGISTERED]) {
      expect(statSync(path.join(ROOT, file)).isFile(), `${file} 이 실재하지 않는다`).toBe(true);
    }
  });

  it("텍스트류 raw <input>/<textarea> 는 상한을 넘지 못한다 — 새 파일은 Input/Textarea 로", () => {
    const over: string[] = [];
    for (const [file, count] of scan.text) {
      const cap = textLedger.get(file) ?? 0;
      if (count > cap) over.push(`${file}: ${count} > 상한 ${cap}`);
    }
    expect(
      over,
      "raw 텍스트 필드를 새로 쓰지 마라 — Input/Textarea(shared/ui/input.tsx)가 이름 강제와 오류 배선을 소유한다.",
    ).toEqual([]);
  });

  it("checkbox/radio 는 0 이고 range 는 등재 하나뿐이다", () => {
    const over: string[] = [];
    for (const [file, count] of scan.special) {
      const cap = specialLedger.get(file) ?? 0;
      if (count > cap) over.push(`${file}: ${count} > 등재 ${cap}`);
    }
    expect(
      over,
      "raw checkbox 는 Checkbox(shared/ui/checkbox.tsx)를 쓴다. radio/range 신설은 체계석 소집이 먼저다.",
    ).toEqual([]);
  });

  it("상한의 회수분은 내린다 — 실측보다 후한 장부는 래칫이 아니다", () => {
    const stale: string[] = [];
    for (const [file, cap] of TEXT_CAP) {
      const actual = scan.text.get(file) ?? 0;
      if (actual < cap) stale.push(`${file}: 상한 ${cap} > 실측 ${actual} — 상한을 내려라`);
    }
    for (const [file, cap] of SPECIAL_REGISTERED) {
      const actual = scan.special.get(file) ?? 0;
      if (actual < cap) stale.push(`${file}: 등재 ${cap} > 실측 ${actual}`);
    }
    expect(stale).toEqual([]);
  });

  /* ── Resident probes (/gate-probe: passing is not evidence) ── */
  it("프로브: 분류·주석·다행 태그가 전부 옳게 계수된다", () => {
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
