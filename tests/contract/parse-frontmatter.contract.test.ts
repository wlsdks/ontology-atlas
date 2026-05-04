import { describe, expect, it } from "vitest";
import { CASES } from "../fixtures/frontmatter-cases.mjs";
import { parseFrontmatter as parseTs } from "@/shared/lib/parse-frontmatter";
import { parseFrontmatter as parseMcp } from "../../mcp/src/parser.mjs";
import { parseFrontmatter as parseScripts } from "../../scripts/lib/parse-frontmatter.mjs";
import { parseFrontmatter as parseCli } from "../../cli/src/lib/parse-frontmatter.mjs";

/**
 * 3-way contract — vault frontmatter parser 가 3 곳에 산다 (런타임 ts /
 * MCP 패키지 mjs / 빌드 스크립트 mjs). mcp/ 는 별도 npm publish 의도라
 * 물리적 단일 모듈로 묶을 수 없으므로, 같은 fixture 매트릭스를 셋이 모두
 * 통과하도록 강제하는 게 effective 단일화.
 *
 * 한 쪽 구현이 drift 하면 이 test 가 즉시 fail.
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
    });
  }
});
