import { describe, expect, it } from "vitest";
import { CASES } from "../../fixtures/frontmatter-cases.mjs";
import { parseFrontmatter as parseTs } from "@/shared/lib/vault-document/parse-frontmatter";
import { parseFrontmatter as parseMcp } from "../../../mcp/src/parser.mjs";
import { parseFrontmatter as parseScripts } from "../../../scripts/lib/parse-frontmatter.mjs";

/**
 * The frontmatter parser ships in three packages that cannot share a module, so the same fixture
 * matrix runs through all three: src/shared/lib, mcp/src and scripts/lib.
 */

const PARSERS = {
  ts: parseTs,
  "mcp/parser.mjs": parseMcp as typeof parseTs,
  "scripts/lib/parse-frontmatter.mjs": parseScripts as typeof parseTs,
};

describe("frontmatter parser contract — 3 implementations agree", () => {
  for (const [parserName, parse] of Object.entries(PARSERS)) {
    describe(parserName, () => {
      for (const c of CASES) {
        it(c.name, () => {
          expect(parse(c.input)).toEqual(c.expected);
        });
      }

      it("object meta keys do not create inherited schema fields", () => {
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
