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
  NODE_ELIGIBILITY_GATE as gateMcp,
  VAULT_KIND_SCHEMA,
} from "../../mcp/src/schema.mjs";
import {
  buildFrontmatter as buildCli,
  missingExpectedFields as missingCli,
  folderForKind as folderCli,
  normalizeLocaleLabels as localeCli,
  NODE_ELIGIBILITY_GATE as gateCli,
} from "../../cli/src/lib/schema.mjs";
import { KIND_EXPECTED_EXTRAS } from "@/shared/lib/validate-vault-document";
import { PRODUCT_DISCIPLINE } from "@/features/vault-agent/model/system-prompt";
import {
  CHAT_RULES_DELTA_EN,
  CONSTRUCTION_RULES_EN,
} from "../../mcp/src/construction-rules.mjs";
import { KNOWN_VAULT_KINDS } from "../../mcp/src/validate.mjs";

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

/**
 * 노드 자격 게이트의 「값 정본」 (2026-07-31 카운슬 — `docs/DECISIONS.md`).
 *
 * 규격은 값 · 로직 · 텍스트 셋으로 쪼개져 있고 여기가 값 쪽 게이트다. 로직은
 * `mcp/src/vault.mjs` 의 `commitDoc`, 텍스트는 `mcp/src/construction-rules.mjs`
 * 가 갖는다. 두 패키지는 cross-import 가 0건이라 상수도 리터럴 사본으로만
 * 존재할 수 있고, 사본이 둘인데 게이트가 없으면 어긋나는 쪽이 기본값이다.
 */
describe("노드 자격 게이트 상수 — mcp & cli 값 정본이 같다", () => {
  it("두 패키지가 같은 임계값을 들고 있다", () => {
    expect(gateMcp).toEqual(gateCli);
  });

  it("잠긴 값들", () => {
    // 미해소 참조는 한 건부터 말한다 — 해소되지 않는 항목은 '작은 자식'이
    // 아니라 다른 범주(evidence)라서, 봐줄 수 있는 개수라는 게 없다.
    expect(gateMcp.NOTICE_THRESHOLD).toBe(1);
    // 문턱 돌파 1회 + 배수만. 매 쓰기마다 반복하면 읽는 쪽이 채널을 거른다.
    expect(gateMcp.NOTICE_REPEAT_MULTIPLE).toBe(10);
    expect(gateMcp.BULK_PROVENANCE_SIBLING_TRIGGER).toBe(5);
    expect(gateMcp.REFERENCE_SAMPLE_LIMIT).toBe(5);
  });

  // 2026-07-31 정정 레코드 — 근거(po-evidence)의 문헌·실측 조사에서 승격된
  // 「연구된 시작 범위」. 하드 캡이 아니라 트리거이며, 볼트가 자기 p90 을 낼 만큼
  // 자라면 그 순간부터 이 값은 물러난다.
  it("부트스트랩 트리거는 8/6 이고 project→domain 은 없다", () => {
    expect(gateMcp.BOOTSTRAP_FANOUT_TRIGGER).toEqual({
      domain_to_capability: 8,
      capability_to_element: 6,
    });
    // 표본이 무의미해서 일부러 비운 자리다. 값이 생겼다면 근거 없이 지어낸 것이다.
    expect(gateMcp.BOOTSTRAP_FANOUT_TRIGGER).not.toHaveProperty("project_to_domain");
    expect(gateMcp.MIN_PARENTS_FOR_LIVE_PERCENTILE).toBe(10);
    // 전부 해소된 넓은 부모(schema.org CreativeWork 형)를 건드리지 않게 하는 문턱.
    // 이게 없으면 밀집 경고가 정당한 대팬아웃마다 울고, 우는 채널은 걸러진다 —
    // 그것이 팬아웃 상한이 옆문으로 돌아오는 경로다.
    expect(gateMcp.DENSE_PARENT_RESOLUTION_FLOOR).toBe(0.7);
  });

  it("중첩 상수도 얼어 있다 — Object.freeze 는 얕다", () => {
    expect(Object.isFrozen(gateMcp.BOOTSTRAP_FANOUT_TRIGGER)).toBe(true);
  });

  it("어떤 값도 자식 수 상한이 아니다 — 상한은 카운슬이 모든 형태로 기각했다", () => {
    // 이 테스트가 지키는 것은 숫자가 아니라 *뜻* 이다. 「N 미만으로 유지」류의
    // 이름이 이 블록에 생기면 그건 팬아웃 상한이 이름만 바꿔 돌아온 것이고,
    // 모델은 빈 버킷 두 개로 그 지표를 통과시킨다.
    for (const key of Object.keys(gateMcp)) {
      expect(key).not.toMatch(/MAX|LIMIT_PER|CAP|CHILDREN/i);
    }
  });
});

/**
 * 구축 규격 텍스트의 3-way — mcp 정본 ↔ 앱 안 채팅 프롬프트.
 *
 * 이 파일이 이미 하는 일과 같은 종류라 여기 산다: `src/` 와 `mcp/` 는 별도
 * 패키지라 cross-import 가 물리적으로 불가능하고, 그래서 스키마가 그랬듯
 * 텍스트도 리터럴 사본으로만 존재할 수 있다.
 *
 * 사본이 둘인데 게이트가 없으면 어긋나는 쪽이 기본값이다 — 그리고 이건 가정이
 * 아니라 이 파일에서 실제로 일어난 일이다. `system-prompt.ts` 의 헤더가
 * *"schema.mjs 와 원자적으로 움직여야 한다"* 고 적어 놓고 강제 장치가 없어서
 * kind 위계가 조용히 갈라져 있었다(project 소유 범위 · `vault-readme` 경고
 * 누락, 2026-07-31 실측). 주석은 계약이 아니다. 테스트가 계약이다.
 */
describe("구축 규격 텍스트 3-way — mcp 정본 ↔ 앱 채팅 프롬프트", () => {
  it("절차 전문이 바이트 그대로 실려 있다", () => {
    expect(PRODUCT_DISCIPLINE).toContain(CONSTRUCTION_RULES_EN);
  });

  it("채팅 전용 차분도 바이트 그대로 실려 있다", () => {
    expect(PRODUCT_DISCIPLINE).toContain(CHAT_RULES_DELTA_EN);
  });

  it("차분의 핵심 — 도구를 부르기 전에 사람에게 먼저 말한다", () => {
    // MCP 는 구조화된 warnings 를 프로그램에 돌려주지만 채팅은 사람에게 말한다.
    // 이 문장이 빠지면 앱이 사용자 온톨로지를 조용히 재구성하고 사용자가 안 볼
    // 곳에만 기록하게 된다.
    expect(CHAT_RULES_DELTA_EN).toContain("say so in the conversation first");
    expect(PRODUCT_DISCIPLINE).toContain("say so in the conversation first");
  });

  it("kind 위계가 스키마와 어긋나지 않는다 — 실제로 갈라졌던 두 지점", () => {
    // project 의 소유 범위는 스키마가 정한다. 프롬프트가 「domains 만」이라고
    // 말하면 에이전트는 capability/element 직속을 제안하지 않는다.
    expect(VAULT_KIND_SCHEMA.project.arrayDefaults).toEqual([
      "domains",
      "capabilities",
      "elements",
    ]);
    expect(PRODUCT_DISCIPLINE).toContain("Owns domains, capabilities, and elements");
    // `vault-readme` 는 자동 생성 전용이라 어떤 에이전트도 제안하면 안 된다.
    // MCP 안내문에는 이 경고가 있었고 채팅 프롬프트에는 없었다.
    expect(KNOWN_VAULT_KINDS).toContain("vault-readme");
    expect(PRODUCT_DISCIPLINE).toContain("`vault-readme` is reserved");
  });

  it("모델이 읽는 프롬프트에 한글이 없다 — 화면 문구와 다른 채널이다", () => {
    expect(PRODUCT_DISCIPLINE).not.toMatch(/[가-힣]/);
  });
});
