import { describe, expect, it } from "vitest";
import {
  BUILD_FM_CASES,
  MISSING_FIELDS_CASES,
  FOLDER_CASES,
  FLAT_SLUG_CASES,
} from "../fixtures/vault-schema-cases.mjs";
import {
  buildFrontmatter as buildMcp,
  missingExpectedFields as missingMcp,
  folderForKind as folderMcp,
  normalizeLocaleLabels as localeMcp,
  NODE_ELIGIBILITY_GATE as gateMcp,
  flatSlugIssue as flatSlugMcp,
  generateNodeUid as generateUidMcp,
  nodeUidIssue as uidIssueMcp,
  mergeNodeIdentityHistory as mergeIdentityMcp,
  VAULT_KINDS,
  VAULT_KIND_SCHEMA,
} from "../../mcp/src/schema.mjs";
import {
  buildFrontmatter as buildCli,
  missingExpectedFields as missingCli,
  folderForKind as folderCli,
  normalizeLocaleLabels as localeCli,
  NODE_ELIGIBILITY_GATE as gateCli,
  flatSlugIssue as flatSlugCli,
  generateNodeUid as generateUidCli,
  nodeUidIssue as uidIssueCli,
  mergeNodeIdentityHistory as mergeIdentityCli,
  VAULT_KIND_SCHEMA as VAULT_KIND_SCHEMA_CLI,
} from "../../cli/src/lib/schema.mjs";
import { KIND_EXPECTED_EXTRAS } from "@/shared/lib/validate-vault-document";
import { PRODUCT_DISCIPLINE } from "@/features/vault-agent/model/system-prompt";
import {
  CHAT_RULES_DELTA_EN,
  CONSTRUCTION_RULES_EN,
  META_MODEL_RULES_EN,
} from "../../mcp/src/construction-rules.mjs";
import { KNOWN_VAULT_KINDS } from "../../mcp/src/validate.mjs";

/**
 * 2-way + 1 cross-check vault schema contract:
 *
 *   - mcp/src/schema.mjs (AI agent surface — `add_concept`)
 *   - cli/src/lib/schema.mjs (developer CLI — `node $ATLAS/cli/src/index.mjs add`)
 *   - KIND_EXPECTED_EXTRAS in src/shared/lib/validate-vault-document.ts
 *     (web/UI advisory)
 *
 * Both schemas must produce the same frontmatter shape and the same missing-field
 * decision; drift on either side fails this test immediately. The UI dictionary is
 * cross-checked for the same requiredExtras.
 */

describe("vault kind schema contract — mcp & cli agree", () => {
  describe("node UID — immutable identity format", () => {
    it("두 생성문이 lowercase UUIDv4를 로컬 발급한다", () => {
      const mcpUid = generateUidMcp();
      const cliUid = generateUidCli();

      expect(uidIssueMcp(mcpUid)).toBeNull();
      expect(uidIssueCli(cliUid)).toBeNull();
      expect(mcpUid).not.toBe(cliUid);
    });

    it.each([
      ["missing", undefined],
      ["blank", ""],
      ["uppercase", "01890F3E-7B5D-4C0A-8F14-123456789ABC"],
      ["not v4", "01890f3e-7b5d-7c0a-8f14-123456789abc"],
      ["not uuid", "node-12"],
    ])("%s UID를 양쪽에서 같은 invalid로 판정한다", (_name, uid) => {
      expect(uidIssueMcp(uid)).toBeTruthy();
      expect(uidIssueCli(uid)).toBe(uidIssueMcp(uid));
    });

    it("유효한 lowercase UUIDv4는 양쪽에서 통과한다", () => {
      const uid = "01890f3e-7b5d-4c0a-8f14-123456789abc";
      expect(uidIssueMcp(uid)).toBeNull();
      expect(uidIssueCli(uid)).toBeNull();
    });

    it("merge는 survivor UID를 보존하고 source identity history를 흡수한다", () => {
      const from = {
        uid: "01890f3e-7b5d-4c0a-8f14-123456789abc",
        merged_uids: ["11890f3e-7b5d-4c0a-8f14-123456789abc"],
      };
      const into = {
        uid: "21890f3e-7b5d-4c0a-8f14-123456789abc",
        merged_uids: ["31890f3e-7b5d-4c0a-8f14-123456789abc"],
      };
      const expected = {
        survivorUid: into.uid,
        absorbedUids: [from.uid, ...from.merged_uids],
        merged_uids: [from.uid, ...from.merged_uids, ...into.merged_uids].sort(),
      };
      expect(mergeIdentityMcp(from, into)).toEqual(expected);
      expect(mergeIdentityCli(from, into)).toEqual(expected);
    });
  });

  it("capability path 는 양쪽 쓰기 경로의 정본 구현 근거다", () => {
    expect(VAULT_KIND_SCHEMA.capability.optional.length).toBeGreaterThan(0);
    expect(VAULT_KIND_SCHEMA_CLI.capability.optional.length).toBeGreaterThan(0);
    expect(VAULT_KIND_SCHEMA.capability.optional).toContain("path");
    expect(VAULT_KIND_SCHEMA_CLI.capability.optional).toContain("path");
    expect(VAULT_KIND_SCHEMA_CLI.capability.optional).toEqual(
      VAULT_KIND_SCHEMA.capability.optional,
    );
    expect(VAULT_KIND_SCHEMA_CLI.capability.preferredOrder).toEqual(
      VAULT_KIND_SCHEMA.capability.preferredOrder,
    );
    expect(VAULT_KIND_SCHEMA.capability.preferredOrder.indexOf("path")).toBeGreaterThan(
      VAULT_KIND_SCHEMA.capability.preferredOrder.indexOf("elements"),
    );
  });

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

  describe("flatSlugIssue — 슬러그는 평평한 식별자다 (2026-08-01 판정)", () => {
    // The two packages must agree, or `add_concept` and the CLI's `add` become different doors.
    for (const c of FLAT_SLUG_CASES) {
      it(`${c.name} (mcp)`, () => {
        const issue = flatSlugMcp(c.kind, c.slug);
        if (c.expected === null) expect(issue).toBeNull();
        else expect(issue).toBeTruthy();
      });
      it(`${c.name} (cli)`, () => {
        const issue = flatSlugCli(c.kind, c.slug);
        if (c.expected === null) expect(issue).toBeNull();
        else expect(issue).toBeTruthy();
      });
      it(`${c.name} (mcp == cli)`, () => {
        expect(flatSlugMcp(c.kind, c.slug)).toBe(flatSlugCli(c.kind, c.slug));
      });
    }
  });

  describe("UI KIND_EXPECTED_EXTRAS aligns with mcp/cli requiredExtras", () => {
    // The UI dictionary must produce the same missing-fields decision as mcp.
    // Both capability and element expect ['domain'].
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

// Per-locale display names (owner instruction, 2026-07-24) — MCP (agents) and the
// CLI (developers) must normalise identically or the vault ends up with different
// keys. Fixing only one side breaks here.
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
      uid: "31890f3e-7b5d-4c0a-8f14-123456789abc",
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
 * The **value authority** for the node qualification gate (2026-07-31 council —
 * `docs/DECISIONS.md`).
 *
 * The spec is split three ways — values, logic, text — and this is the value gate.
 * The logic lives in `commitDoc` (`mcp/src/vault.mjs`) and the text in
 * `mcp/src/construction-rules.mjs`. The two packages share 0 cross-imports, so even
 * constants can only exist as literal copies, and two copies with no gate means
 * drift is the default.
 */
describe("노드 자격 게이트 상수 — mcp & cli 값 정본이 같다", () => {
  it("두 패키지가 같은 임계값을 들고 있다", () => {
    expect(gateMcp).toEqual(gateCli);
  });

  it("잠긴 값들", () => {
    // Unresolved references are reported from the first one — an unresolved item is not
    // a "small child" but a different category (evidence), so there is no tolerable count.
    expect(gateMcp.NOTICE_THRESHOLD).toBe(1);
    // Fires once at the threshold and then only at multiples. Repeating on every write
    // makes the reader filter the channel out.
    expect(gateMcp.NOTICE_REPEAT_MULTIPLE).toBe(10);
    expect(gateMcp.BULK_PROVENANCE_SIBLING_TRIGGER).toBe(5);
    expect(gateMcp.REFERENCE_SAMPLE_LIMIT).toBe(5);
  });

  // Correction record 2026-07-31 — the researched starting range, promoted from
  // po-evidence's literature and measurement review. It is a trigger, not a hard cap,
  // and it steps aside once a vault has grown enough to produce its own p90.
  it("부트스트랩 트리거는 8/6 이고 project→domain 은 없다", () => {
    expect(gateMcp.BOOTSTRAP_FANOUT_TRIGGER).toEqual({
      domain_to_capability: 8,
      capability_to_element: 6,
    });
    // Deliberately empty because the sample is meaningless. A value appearing here was invented without evidence.
    expect(gateMcp.BOOTSTRAP_FANOUT_TRIGGER).not.toHaveProperty("project_to_domain");
    expect(gateMcp.MIN_PARENTS_FOR_LIVE_PERCENTILE).toBe(10);
    // The threshold that keeps fully-resolved broad parents (schema.org CreativeWork
    // shape) untouched. Without it the density warning fires on every legitimate large
    // fan-out, and a channel that cries is filtered out — which is how a fan-out cap
    // returns through the side door.
    expect(gateMcp.DENSE_PARENT_RESOLUTION_FLOOR).toBe(0.7);
  });

  it("중첩 상수도 얼어 있다 — Object.freeze 는 얕다", () => {
    expect(Object.isFrozen(gateMcp.BOOTSTRAP_FANOUT_TRIGGER)).toBe(true);
  });

  it("어떤 값도 자식 수 상한이 아니다 — 상한은 카운슬이 모든 형태로 기각했다", () => {
    // What this test protects is the *meaning*, not the number. A name of the "keep it
    // under N" kind appearing in this block is the fan-out cap returning under a new
    // name, and a model will satisfy that metric with two empty buckets.
    for (const key of Object.keys(gateMcp)) {
      expect(key).not.toMatch(/MAX|LIMIT_PER|CAP|CHILDREN/i);
    }
  });
});

/**
 * Three-way check on the construction-rules text — the mcp authority against the
 * in-app chat prompt.
 *
 * It lives here because it is the same kind of work this file already does: `src/`
 * and `mcp/` are separate packages, so cross-imports are physically impossible and,
 * like the schema, the text can only exist as literal copies.
 *
 * Two copies with no gate means drift is the default — and here that is not a
 * hypothesis but what actually happened in this file. `system-prompt.ts`'s header
 * said *"must move atomically with schema.mjs"* with nothing enforcing it, and the
 * kind hierarchy had quietly diverged (project's ownership scope, and a missing
 * `vault-readme` warning — measured 2026-07-31). A comment is not a contract; a test
 * is.
 */
describe("구축 규격 텍스트 3-way — mcp 정본 ↔ 앱 채팅 프롬프트", () => {
  it("절차 전문이 바이트 그대로 실려 있다", () => {
    expect(PRODUCT_DISCIPLINE).toContain(CONSTRUCTION_RULES_EN);
  });

  it("채팅 전용 차분도 바이트 그대로 실려 있다", () => {
    expect(PRODUCT_DISCIPLINE).toContain(CHAT_RULES_DELTA_EN);
  });

  it("차분의 핵심 — 도구를 부르기 전에 사람에게 먼저 말한다", () => {
    // MCP returns structured warnings to a program; chat speaks to a person. Without
    // this sentence the app quietly restructures the user's ontology and records it
    // only where the user will not look.
    expect(CHAT_RULES_DELTA_EN).toContain("say so in the conversation first");
    expect(PRODUCT_DISCIPLINE).toContain("say so in the conversation first");
  });

  it("meta-model 경계가 바이트 그대로 실려 있고 authorable/reserved를 구분한다", () => {
    expect(PRODUCT_DISCIPLINE).toContain(META_MODEL_RULES_EN);
    // The schema decides project's ownership scope. A prompt saying "domains only"
    // stops the agent proposing a capability or element directly under it.
    expect(VAULT_KIND_SCHEMA.project.arrayDefaults).toEqual([
      "domains",
      "capabilities",
      "elements",
    ]);
    expect(VAULT_KINDS).toEqual([
      "project",
      "domain",
      "capability",
      "element",
      "document",
    ]);
    expect(PRODUCT_DISCIPLINE).toContain("Atlas has five authorable kinds");
    // `vault-readme` is generated-only and no agent may propose it. The MCP guidance
    // carried this warning; the chat prompt did not.
    expect(KNOWN_VAULT_KINDS).toContain("vault-readme");
    expect(PRODUCT_DISCIPLINE).toContain("`vault-readme` is a reserved reader kind");
  });

  it("element 를 파일 목록과 혼동하지 않고 구조 감사는 실제 부모를 읽는다", () => {
    const discipline = PRODUCT_DISCIPLINE.replace(/\s+/g, " ");
    expect(discipline).toContain(
      "A bare path is evidence for an element role, not a concept by itself",
    );
    expect(discipline).toContain(
      "folder, package, team, workflow, technology, or README heading is",
    );
    expect(PRODUCT_DISCIPLINE).toContain(
      "For a structure audit, census and list results only choose suspects",
    );
    expect(PRODUCT_DISCIPLINE).toContain(
      "read each suspect parent with `get_concept` or `get_concepts`",
    );
    expect(PRODUCT_DISCIPLINE).toContain(
      "Spend at most three rounds gathering audit evidence",
    );
    expect(PRODUCT_DISCIPLINE).not.toContain(
      "element — a concrete piece: a library, an API, a schema, a file",
    );
  });

  it("모델이 읽는 프롬프트에 한글이 없다 — 화면 문구와 다른 채널이다", () => {
    expect(PRODUCT_DISCIPLINE).not.toMatch(/[가-힣]/);
  });
});
