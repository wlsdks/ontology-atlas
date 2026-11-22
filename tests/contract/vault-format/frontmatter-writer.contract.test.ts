import { describe, expect, it } from "vitest";
import { WRITER_CASES } from "../../fixtures/frontmatter-writer-cases.mjs";
import { parseFrontmatter as parseRenderer } from "@/shared/lib/vault-document/parse-frontmatter";
import { parseFrontmatter as parseScripts } from "../../../scripts/lib/parse-frontmatter.mjs";
import {
  buildMarkdown as buildMcpMarkdown,
  parseFrontmatter as parseMcpFrontmatter,
  serializeFrontmatter as serializeMcpFrontmatter,
} from "../../../mcp/src/parser.mjs";
/**
 * The canonical writer (`mcp/src/parser.mjs`) against fixed cases. Parser parity is covered by
 * `parse-frontmatter.contract.test.ts`.
 */

describe("frontmatter writer contract", () => {
  for (const c of WRITER_CASES) {
    it(c.name, () => {
      expect(buildMcpMarkdown(c.input)).toBe(c.expected);

      // The serializer is what buildMarkdown embeds, so the frontmatter block
      // must appear verbatim inside its output.
      const serialized = serializeMcpFrontmatter(c.input.frontmatter);
      expect(buildMcpMarkdown(c.input)).toContain(serialized);
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
  { name: "a value with quotes: escapes do not accumulate", frontmatter: { kind: "capability", title: 'say "hello"' } },
  { name: "a comma inside an array item", frontmatter: { kind: "capability", tags: ["a, b", "c"] } },
  { name: "a comma inside an object value", frontmatter: { kind: "capability", labels: { ko: "지도, 검색", en: "Map" } } },
  { name: "a value with a backslash", frontmatter: { kind: "capability", title: "C:\\path, x" } },
  { name: "a mix of quotes and commas", frontmatter: { kind: "capability", labels: { ko: '지도, "검색"', en: "Map" } } },
  { name: "a value with a colon", frontmatter: { kind: "capability", title: "a: b" } },
];

describe("round trip contract: what is written reads back the same (blocks accumulated contamination)", () => {
  for (const c of ROUND_TRIP_CASES) {
    it(c.name, () => {
      for (const [label, build, parse] of [
        ["mcp", buildMcpMarkdown, parseMcpFrontmatter],
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
