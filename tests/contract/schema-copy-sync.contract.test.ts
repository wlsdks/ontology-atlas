import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **The CLI's and MCP's schema copies must be byte-identical** (hygiene sweep,
 * 2026-08-13).
 *
 * `mcp/src/schema.mjs` (canonical) and `cli/src/lib/schema.mjs` are a **deliberate
 * duplicate** — neither imports the other. There is no npm publication and therefore
 * no shared package, and each must be embedded in its own execution entry point (the
 * spawned MCP server, the directly executed CLI). Import-graph tools cannot see this
 * coupling (with no call between them they read as two independent files), so a
 * divergence was **caught by no check at all**.
 *
 * Measured in the 2026-08-13 hygiene sweep: the two files were completely identical
 * at 578 lines / 24,226 bytes. Yet siblings in the same relationship (absorb,
 * parse-frontmatter, interop-format) each had a dedicated sync contract and
 * **schema.mjs alone did not**. With two copies and no gate, diverging is the
 * default — this is the code version of the discipline this repository already
 * learned from the skill copies (`agents:check`'s skill-copy).
 *
 * On a divergence: **mcp is canonical** (`AGENTS.md` — the single source for the
 * schema is `mcp/src/schema.mjs`). If mcp was edited, copy it to cli; if only cli was
 * edited, put that change into mcp first.
 */
describe("schema.mjs 사본 동기화", () => {
  const canonical = join(process.cwd(), "mcp", "src", "schema.mjs");
  const copy = join(process.cwd(), "cli", "src", "lib", "schema.mjs");

  it("두 사본이 바이트까지 같다", () => {
    const canonicalBody = readFileSync(canonical, "utf-8");
    const copyBody = readFileSync(copy, "utf-8");

    /*
     * Idling guard: two empty files are also "identical". This schema carries all five
     * kinds and every relation key across tens of thousands of bytes — its substance is
     * confirmed first.
     */
    expect(
      canonicalBody.length,
      "정본 스키마가 비어 있다 — 이 계약이 공회전한다",
    ).toBeGreaterThan(10_000);

    if (canonicalBody !== copyBody) {
      // Reports where they diverge, rather than making a person eyeball a 24KB diff.
      const canonicalLines = canonicalBody.split("\n");
      const copyLines = copyBody.split("\n");
      const firstDiff = canonicalLines.findIndex((line, i) => line !== copyLines[i]);
      expect.fail(
        `cli/src/lib/schema.mjs 가 정본(mcp/src/schema.mjs)과 어긋났다 — ` +
          `첫 차이는 ${firstDiff + 1}번째 줄. 정본은 mcp 쪽이다: ` +
          `mcp 를 고쳤으면 cli 로 복사하고, cli 만 고쳤으면 그 변경을 mcp 에 먼저 넣어라.\n` +
          `  mcp: ${JSON.stringify(canonicalLines[firstDiff] ?? "(파일 끝)")}\n` +
          `  cli: ${JSON.stringify(copyLines[firstDiff] ?? "(파일 끝)")}`,
      );
    }
  });
});
