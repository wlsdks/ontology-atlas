import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **Source files are text** — one NUL byte and the file disappears.
 *
 * **What happened (reviewed 2026-08-08).** Grepping `DocsVaultEditor.tsx`
 * returned **0 hits for a string that plainly existed**. The cause was a composite
 * key on line 204 of that file:
 *
 * ```
 * `${autocomplete.query}` + NUL + `${autocomplete.active}`   // NUL = U+0000
 * ```
 *
 * Using a character that cannot appear in a slug as a separator is a reasonable
 * idea. The problem is the price — **one NUL and git treats the file as binary**:
 *
 * | What is lost | What that means |
 * |---|---|
 * | `git diff` | The PR view shows only `Bin 38024 -> 38709 bytes` — **review is impossible** |
 * | `grep` · `ripgrep` | They skip binaries by default and answer **0 hits, silently** |
 *
 * The second is the worse one. The failure arrives as "nothing found" rather than
 * an error, so both people and agents read it as "that code does not exist" — and
 * this repository's audits and rules all rest on grep.
 *
 * **This gate caught its own author the moment it was switched on.** Writing this
 * file, the example above was **copied from the original** and brought the NUL
 * straight into the comment; the gate's first run reported itself as a violation.
 * It is indistinguishable from a space by eye, which is the evidence that "just be
 * careful" is not a countermeasure — so this rule is kept by a check, not by human
 * attention.
 *
 * **Inventory before switching on** (`design.md`, "always measure before enabling
 * a rule"): scanning 1,906 files caught **5**, all the same pattern (a separator
 * in a composite or sort key): `DocsVaultEditor.tsx`, `duplicate-pairs.ts`,
 * `interop-format.mjs`, `detect-drift.mjs`, `reconcile-imports.mjs`. Small enough
 * to clear in one PR, so the rule was enabled (it does not become noise).
 *
 * There are two replacements. For **Set/Map keys**, `JSON.stringify([...])` —
 * printable and unambiguous (a space separator makes `["a b","c"]` and
 * `["a","b c"]` the same key). For **sort keys**, compare **field by field**
 * instead of concatenating — NUL sorts below every character, so field order is
 * the originally intended order, and the dogfood vault's interop export (71 nodes,
 * 154 relations) was **byte-identical** before and after the repair.
 */

const ROOTS = ["src", "app", "cli", "mcp", "scripts", "tests"] as const;
const EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js", ".json", ".css", ".md"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "output", ".codegraph"]);

function sourceFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (EXTENSIONS.has(path.slice(path.lastIndexOf(".")))) found.push(path);
    }
  };
  for (const root of ROOTS) walk(root);
  return found;
}

describe("소스는 텍스트다 — git 과 grep 이 볼 수 있어야 한다", () => {
  it("어떤 소스 파일도 NUL 바이트를 갖지 않는다", () => {
    const files = sourceFiles();
    // Idling guard — with an empty list, the "0 violations" below proves nothing.
    expect(files.length, "스캔한 파일이 없다 — 경로 목록이 낡았다").toBeGreaterThan(1_000);

    const offenders = files.filter((file) => readFileSync(file).includes(0x00));
    expect(
      offenders,
      "NUL 이 하나라도 있으면 git 이 그 파일을 바이너리로 본다 — PR 에서 diff 가 " +
        "안 보이고(리뷰 불가) grep 이 조용히 0건을 답한다. 합성 키는 " +
        "JSON.stringify([...]) 로, 정렬은 이어 붙이지 말고 필드 순서대로 비교하라.",
    ).toEqual([]);
  });
});
