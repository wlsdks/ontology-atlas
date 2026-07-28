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
  normalizeLocaleLabels as localeMcp,
} from "../../mcp/src/schema.mjs";
import {
  buildFrontmatter as buildCli,
  missingExpectedFields as missingCli,
  folderForKind as folderCli,
  normalizeLocaleLabels as localeCli,
} from "../../cli/src/lib/schema.mjs";
import { KIND_EXPECTED_EXTRAS } from "@/shared/lib/validate-vault-document";

/**
 * 2-way + 1 cross-check vault schema contract:
 *
 *   - mcp/src/schema.mjs (AI agent surface — `add_concept`)
 *   - cli/src/lib/schema.mjs (developer CLI — `node $ATLAS/cli/src/index.mjs add`)
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

// 어권별 표시 이름 (소유자 지시 2026-07-24) — MCP(agent)와 CLI(개발자)가
// 같은 정규화를 해야 vault 에 같은 키가 남는다. 한쪽만 고치면 여기서 깨진다.
describe("display_<locale> 정규화 2-way contract", () => {
  const cases = [
    { ko: "결제", en: "Payments" },
    { ko: "  결제  ", en: "" },
    { kor: "무시", en: "Payments" },
    {},
  ];
  it.each(cases)("normalizeLocaleLabels matches across packages (%o)", (input) => {
    expect(localeMcp(input)).toEqual(localeCli(input));
  });

  it("emits display_<locale> in both builders identically", () => {
    const args = {
      slug: "domains/payment",
      kind: "domain",
      title: "결제",
      ...localeMcp({ ko: "결제", en: "Payments" }),
    };
    expect(buildMcp(args)).toEqual(buildCli(args));
    expect(buildMcp(args)).toMatchObject({ display_ko: "결제", display_en: "Payments" });
  });
});
