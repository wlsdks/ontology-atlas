import { describe, expect, it } from "vitest";
import CASES from "../../fixtures/frontmatter-cases.json";
import { parseFrontmatter as parseTs } from "@/shared/lib/vault-document/parse-frontmatter";
import { parseFrontmatter as parseCodec } from "@/shared/lib/vault-document/frontmatter-codec.mjs";
import { parseFrontmatter as parseScripts } from "../../../scripts/lib/parse-frontmatter.mjs";

/**
 * The frontmatter parser ships in three places that cannot share a module, so the same fixture
 * matrix runs through all of them: src/shared/lib/vault-document (the screens), the same folder's
 * frontmatter-codec.mjs (the one the document-patch preview writes with) and scripts/lib. The
 * matrix is tests/fixtures/frontmatter-cases.json, the one source of truth; the Rust reader runs it
 * too, in src-tauri/crates/vault-document/tests/frontmatter_cases.rs. A case is added there and
 * nowhere else.
 */

const PARSERS = {
  ts: parseTs,
  "src/shared/lib/vault-document/frontmatter-codec.mjs": parseCodec as typeof parseTs,
  "scripts/lib/parse-frontmatter.mjs": parseScripts as typeof parseTs,
};

describe("frontmatter parser contract — every implementation agrees", () => {
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
