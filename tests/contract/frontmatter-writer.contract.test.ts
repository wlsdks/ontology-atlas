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
