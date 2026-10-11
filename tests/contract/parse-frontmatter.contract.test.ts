import { describe, expect, it } from "vitest";
import { CASES } from "../fixtures/frontmatter-cases.mjs";
import { parseFrontmatter as parseTs } from "@/shared/lib/vault-document/parse-frontmatter";
import { parseFrontmatter as parseMcp } from "../../mcp/src/parser.mjs";
import { parseFrontmatter as parseScripts } from "../../scripts/lib/parse-frontmatter.mjs";
import { parseFrontmatter as parseCli } from "../../cli/src/lib/parse-frontmatter.mjs";

/**
 * The frontmatter parser ships in four packages that cannot share a module, so the same fixture
 * matrix runs through all four: src/shared/lib, mcp/src, scripts/lib and cli/src/lib.
 */

const PARSERS = {
  ts: parseTs,
  "mcp/parser.mjs": parseMcp as typeof parseTs,
  "scripts/lib/parse-frontmatter.mjs": parseScripts as typeof parseTs,
  "cli/src/lib/parse-frontmatter.mjs": parseCli as typeof parseTs,
};

describe("frontmatter parser contract — 4 implementations agree", () => {
  for (const [parserName, parse] of Object.entries(PARSERS)) {
    describe(parserName, () => {
      for (const c of CASES) {
        it(c.name, () => {
          expect(parse(c.input)).toEqual(c.expected);
        });
      }

      it("객체 메타키가 상속된 스키마 필드를 만들지 않는다", () => {
        const parsed = parse(
          "---\n__proto__:\n  kind: domain\n  title: Forged\nsafe: value\n---\n",
        );
        expect(Object.getPrototypeOf(parsed.frontmatter)).toBe(Object.prototype);
        expect(Object.prototype.hasOwnProperty.call(parsed.frontmatter, "kind")).toBe(false);
        expect(parsed.frontmatter.kind).toBeUndefined();
      });
    });
  }
});
