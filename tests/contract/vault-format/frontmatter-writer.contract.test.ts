import { describe, expect, it } from "vitest";
import { WRITER_CASES } from "../../fixtures/frontmatter-writer-cases.mjs";
import { parseFrontmatter as parseRenderer } from "@/shared/lib/vault-document/parse-frontmatter";
import { parseFrontmatter as parseScripts } from "../../../scripts/lib/parse-frontmatter.mjs";
import {
  buildMarkdown,
  parseFrontmatter as parseCodec,
  serializeFrontmatter,
} from "@/shared/lib/vault-document/frontmatter-codec.mjs";
/**
 * The writer the document-patch preview uses (`frontmatter-codec.mjs`) against fixed cases; the
 * cases state the bytes any writer must produce. Parser parity is covered by
 * `parse-frontmatter.contract.test.ts`.
 */

describe("frontmatter writer contract", () => {
  for (const c of WRITER_CASES) {
    it(c.name, () => {
      expect(buildMarkdown(c.input)).toBe(c.expected);

      // The serializer is what buildMarkdown embeds, so the frontmatter block
      // must appear verbatim inside its output.
      const serialized = serializeFrontmatter(c.input.frontmatter);
      expect(buildMarkdown(c.input)).toContain(serialized);
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
      let current = c.frontmatter;
      // Three passes — catches the kind that passes once while accumulating.
      for (let round = 1; round <= 3; round += 1) {
        const markdown = buildMarkdown({ frontmatter: current, body: "본문" });
        current = parseCodec(markdown).frontmatter as Record<string, unknown>;
        expect(current, `round ${round}`).toEqual(c.frontmatter);
        expect(parseRenderer(markdown).frontmatter).toEqual(c.frontmatter);
        expect(parseScripts(markdown).frontmatter).toEqual(c.frontmatter);
      }
    });
  }
});
