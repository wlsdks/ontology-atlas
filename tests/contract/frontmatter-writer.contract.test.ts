import { describe, expect, it } from "vitest";
import { WRITER_CASES } from "../fixtures/frontmatter-writer-cases.mjs";
import {
  buildMarkdown as buildMcpMarkdown,
  parseFrontmatter as parseMcpFrontmatter,
  serializeFrontmatter as serializeMcpFrontmatter,
} from "../../mcp/src/parser.mjs";
import {
  buildMarkdown as buildCliMarkdown,
  parseFrontmatter as parseCliFrontmatter,
  serializeFrontmatter as serializeCliFrontmatter,
} from "../../cli/src/lib/parse-frontmatter.mjs";

/**
 * Writer contract — MCP write tools and CLI add/import write the same markdown.
 *
 * The packages are published separately, so this test is the effective shared
 * contract for serializeFrontmatter/buildMarkdown. Parser parity is covered by
 * parse-frontmatter.contract.test.ts; this file catches write-shape drift.
 */

describe("frontmatter writer contract — MCP and CLI agree", () => {
  for (const c of WRITER_CASES) {
    it(c.name, () => {
      expect(buildMcpMarkdown(c.input)).toBe(c.expected);
      expect(buildCliMarkdown(c.input)).toBe(c.expected);

      expect(serializeMcpFrontmatter(c.input.frontmatter)).toBe(
        serializeCliFrontmatter(c.input.frontmatter),
      );
      expect(parseMcpFrontmatter(c.expected)).toEqual(parseCliFrontmatter(c.expected));
    });
  }
});

/**
 * **The round trip closes** — `parse(build(x)) === x`.
 *
 * Two defects lived because this contract did not exist (measured 2026-07-28):
 *
 * 1. The serializer escaped `"` while the parser did not unescape. Every time
 *    `patch_concept` re-serialised frontmatter the backslashes **doubled** (three
 *    round trips: 1 → 2 → 4). Repeated saving was corruption growth.
 * 2. Inline lists and objects were split on commas unconditionally, so a comma
 *    inside a value truncated the data (`labels: { ko: "map, search" }` → `"map"`).
 *
 * Why the existing matrix missed them: the parser contract watched only
 * **input → parse result**, and the writer contract only **input → string**. Joining
 * them — "does writing and reading back give the same thing" — was in neither's
 * range.
 *
 * Why three round trips: some defects pass on the first pass while **accumulating**.
 * Defect 1 above did exactly that.
 */
const ROUND_TRIP_CASES: Array<{ name: string; frontmatter: Record<string, unknown> }> = [
  { name: "따옴표 든 값 — 이스케이프가 누적되지 않는다", frontmatter: { kind: "capability", title: 'say "hello"' } },
  { name: "배열 항목 안의 콤마", frontmatter: { kind: "capability", tags: ["a, b", "c"] } },
  { name: "객체 값 안의 콤마", frontmatter: { kind: "capability", labels: { ko: "지도, 검색", en: "Map" } } },
  { name: "역슬래시 든 값", frontmatter: { kind: "capability", title: "C:\\path, x" } },
  { name: "따옴표와 콤마 혼합", frontmatter: { kind: "capability", labels: { ko: '지도, "검색"', en: "Map" } } },
  { name: "콜론 든 값", frontmatter: { kind: "capability", title: "a: b" } },
];

describe("왕복 계약 — 쓰고 다시 읽으면 같다 (누적 오염 차단)", () => {
  for (const c of ROUND_TRIP_CASES) {
    it(c.name, () => {
      for (const [label, build, parse] of [
        ["mcp", buildMcpMarkdown, parseMcpFrontmatter],
        ["cli", buildCliMarkdown, parseCliFrontmatter],
      ] as const) {
        let current = c.frontmatter;
        // Three passes — catches the kind that passes once while accumulating.
        for (let round = 1; round <= 3; round += 1) {
          const markdown = build({ frontmatter: current, body: "본문" });
          current = parse(markdown).frontmatter as Record<string, unknown>;
          expect(current, `${label} round ${round}`).toEqual(c.frontmatter);
        }
      }
    });
  }
});
