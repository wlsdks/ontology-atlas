import { describe, expect, it } from "vitest";
import {
  BUILD_FM_CASES,
  MISSING_FIELDS_CASES,
  FOLDER_CASES,
} from "../fixtures/vault-schema-cases.mjs";
import {
  buildFrontmatter as buildMcp,
  missingExpectedFields as missingMcp,
  folderForKind as folderMcp,
} from "../../mcp/src/schema.mjs";
import {
  buildFrontmatter as buildCli,
  missingExpectedFields as missingCli,
  folderForKind as folderCli,
} from "../../cli/src/lib/schema.mjs";
import { KIND_EXPECTED_EXTRAS } from "@/shared/lib/validate-vault-document";

/**
 * 2-way + 1 cross-check vault schema contract:
 *
 *   - mcp/src/schema.mjs (AI agent surface — `add_concept`)
 *   - cli/src/lib/schema.mjs (developer CLI — `ontology-atlas add`)
 *   - src/shared/lib/validate-vault-document.ts 의 KIND_EXPECTED_EXTRAS
 *     (web/UI advisory)
 *
 * 양 schema 가 같은 frontmatter 모양을 만들고 같은 missing-field 결정을
 * 내려야 한다. 한 쪽 drift 시 이 test 가 즉시 fail. UI 측 dict 도 같은
 * requiredExtras 들고 있는지 cross-check.
 */

describe("vault kind schema contract — mcp & cli agree", () => {
  describe("buildFrontmatter", () => {
    for (const c of BUILD_FM_CASES) {
      it(`${c.name} (mcp)`, () => {
        expect(buildMcp(c.input)).toEqual(c.expected);
      });
      it(`${c.name} (cli)`, () => {
        expect(buildCli(c.input)).toEqual(c.expected);
      });
    }
  });

  describe("missingExpectedFields", () => {
    for (const c of MISSING_FIELDS_CASES) {
      it(`${c.name} (mcp)`, () => {
        expect(missingMcp(c.kind, c.frontmatter)).toEqual(c.expected);
      });
      it(`${c.name} (cli)`, () => {
        expect(missingCli(c.kind, c.frontmatter)).toEqual(c.expected);
      });
    }
  });

  describe("folderForKind", () => {
    for (const c of FOLDER_CASES) {
      it(`${c.kind} (mcp)`, () => {
        expect(folderMcp(c.kind)).toBe(c.expected);
      });
      it(`${c.kind} (cli)`, () => {
        expect(folderCli(c.kind)).toBe(c.expected);
      });
    }
  });

  describe("UI KIND_EXPECTED_EXTRAS aligns with mcp/cli requiredExtras", () => {
    // UI dict 가 mcp 의 missing-fields 결정과 같은 결과를 내야 한다.
    // capability/element 둘 다 ['domain'] 을 expected 로 둔다.
    it("capability requires domain", () => {
      expect(KIND_EXPECTED_EXTRAS.capability).toEqual(["domain"]);
      expect(missingMcp("capability", { slug: "x", kind: "capability", title: "X" })).toEqual([
        "domain",
      ]);
    });
    it("element requires domain", () => {
      expect(KIND_EXPECTED_EXTRAS.element).toEqual(["domain"]);
      expect(missingMcp("element", { slug: "x", kind: "element", title: "X" })).toEqual([
        "domain",
      ]);
    });
    it("project / domain / document have no extras", () => {
      expect(KIND_EXPECTED_EXTRAS.project).toEqual([]);
      expect(KIND_EXPECTED_EXTRAS.domain).toEqual([]);
      expect(KIND_EXPECTED_EXTRAS.document).toEqual([]);
    });
  });
});
