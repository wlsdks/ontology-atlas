import { describe, expect, it } from "vitest";
import { WRITER_CASES } from "../fixtures/frontmatter-writer-cases.mjs";
import { parseFrontmatter as parseRenderer } from "@/shared/lib/vault-document/parse-frontmatter";
import { parseFrontmatter as parseScripts } from "../../scripts/lib/parse-frontmatter.mjs";
import {
  buildMarkdown as buildMcpMarkdown,
  parseFrontmatter as parseMcpFrontmatter,
  serializeFrontmatter as serializeMcpFrontmatter,
} from "../../mcp/src/parser.mjs";
import {
  buildMarkdown as buildCliMarkdown,
  parseFrontmatter as parseCliFrontmatter,
} from "../../cli/src/lib/mcp-bridge/parse-frontmatter.mjs";

/**
 * The CLI arm proves the CLI's writer reaches the canonical one (`mcp/src/parser.mjs`), not that two
 * files agree. `serializeFrontmatter` is not imported from the CLI because its runtime never calls it.
 * Parser parity is covered by `parse-frontmatter.contract.test.ts`.
 */

describe("frontmatter writer contract — MCP and CLI agree", () => {
  for (const c of WRITER_CASES) {
    it(c.name, () => {
      expect(buildMcpMarkdown(c.input)).toBe(c.expected);
      expect(buildCliMarkdown(c.input)).toBe(c.expected);

      // The serializer is what buildMarkdown embeds, so the shared frontmatter block
      // must appear verbatim inside both surfaces' output.
      const serialized = serializeMcpFrontmatter(c.input.frontmatter);
      expect(buildMcpMarkdown(c.input)).toContain(serialized);
      expect(buildCliMarkdown(c.input)).toContain(serialized);
      expect(parseMcpFrontmatter(c.expected)).toEqual(parseCliFrontmatter(c.expected));
    });
  }
});

/**
 * Round trip: `parse(build(x))` must equal `x`, including after repeated saves; the parser and
 * writer contracts each watch only one direction.
 */
const ROUND_TRIP_CASES: Array<{ name: string; frontmatter: Record<string, unknown> }> = [
  { name: "quoted mapping keys and nested strings", frontmatter: { 'a:b': 'Top', labels: { 'x,y': '001', flag: 'false', empty: '', "owner's": 'Literal', '한글:키': 'Value' } } },
  { name: "literal escape sequences and control characters stay distinct", frontmatter: { labels: { 'key\\name': 'C:\\new\\tools, x', 'actual\nkey\t': 'actual\nvalue\t' } } },
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
          expect(parseRenderer(markdown).frontmatter).toEqual(c.frontmatter);
          expect(parseScripts(markdown).frontmatter).toEqual(c.frontmatter);
        }
      }
    });
  }
});
