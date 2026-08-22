import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHAT_RULES_DELTA_EN,
  CONSTRUCTION_RULES_EN,
  ELEMENT_NAMING_RULE_BATCH_EN,
  ELEMENT_NAMING_RULE_EN,
  denseParentActionMessage,
} from "../../mcp/src/construction-rules.mjs";
import { NODE_ELIGIBILITY_GATE } from "../../mcp/src/schema.mjs";

/**
 * The "text is authoritative" gate for the construction rules.
 *
 * The header of `mcp/src/construction-rules.mjs` names this file itself, saying
 * *"until this gate exists, this file is a proposal, not the source of truth"*.
 * That was accurate — the four strings had zero consumers for a while, and a
 * sentence nobody reads is not a spec.
 *
 * So what this file measures is not wording quality but **reach and singularity**:
 * did it arrive where the LLM actually reads, and did it arrive by import or by
 * hand-copying. Without measuring the latter, "single source" is a phrase that
 * lives only in a comment.
 */

const INDEX_SOURCE = readFileSync(
  resolve(__dirname, "../../mcp/src/index.js"),
  "utf-8",
);

/** Phrases that occur only in the source of truth and would not be retyped by hand. */
const RULES_FINGERPRINT = "count alone is not evidence of";

/**
 * Line breaks are not the contract; the meaning is. The source is hard-wrapped, so
 * a phrase spanning a line break breaks `toContain` — that is a width change, not a
 * spec change. Whitespace is folded before comparing.
 */
function flat(text: string): string {
  return text.replace(/\s+/g, " ");
}
const NAMING_FINGERPRINT = "an element names a CONCEPT a capability uses";
const BATCH_FINGERPRINT = "Rows whose `title` is a bare file path";

describe("구축 규격 텍스트 — LLM 이 읽는 자리에 도달한다", () => {
  it("SERVER_INSTRUCTIONS 가 규격 전문을 interpolate 한다", () => {
    expect(INDEX_SOURCE).toContain("${CONSTRUCTION_RULES_EN}");
  });

  it("add_concept · add_concepts description 이 명명 규칙을 붙인다", () => {
    // A tool description is the only text an LLM reads **immediately before calling**,
    // so the rule easiest to break at that moment (creating nodes from filenames) must
    // be carried here.
    expect(INDEX_SOURCE).toContain("ELEMENT_NAMING_RULE_EN");
    expect(INDEX_SOURCE).toContain("ELEMENT_NAMING_RULE_BATCH_EN");
  });

  it("세 상수를 정말 import 한다", () => {
    expect(INDEX_SOURCE).toMatch(
      /import \{[\s\S]*?CONSTRUCTION_RULES_EN[\s\S]*?\} from '\.\/construction-rules\.mjs';/,
    );
  });
});

describe("정본 단일성 — 파생이지 사본이 아니다", () => {
  // It is the same `mcp/` package, so a real import is possible. Copying when import
  // is available is an accident, not a convention — two copies always diverge, and
  // the diverged one becomes the default.
  it.each([
    ["CONSTRUCTION_RULES_EN", RULES_FINGERPRINT],
    ["ELEMENT_NAMING_RULE_EN", NAMING_FINGERPRINT],
    ["ELEMENT_NAMING_RULE_BATCH_EN", BATCH_FINGERPRINT],
  ])("%s 의 문장이 index.js 에 리터럴로 복제돼 있지 않다", (_name, fingerprint) => {
    expect(INDEX_SOURCE).not.toContain(fingerprint);
  });

  it("지문 문장은 정본 쪽에는 실재한다 — 지문이 썩으면 위 검사가 조용히 통과한다", () => {
    expect(flat(CONSTRUCTION_RULES_EN)).toContain(RULES_FINGERPRINT);
    expect(ELEMENT_NAMING_RULE_EN).toContain(NAMING_FINGERPRINT);
    expect(ELEMENT_NAMING_RULE_BATCH_EN).toContain(BATCH_FINGERPRINT);
  });
});

describe("값 정본 — 숫자는 schema.mjs 에서 온다", () => {
  it("부트스트랩 트리거가 하드코딩이 아니라 interpolate 된다", () => {
    const { domain_to_capability: d2c, capability_to_element: c2e } =
      NODE_ELIGIBILITY_GATE.BOOTSTRAP_FANOUT_TRIGGER;
    expect(CONSTRUCTION_RULES_EN).toContain(`about ${d2c} capabilities`);
    expect(CONSTRUCTION_RULES_EN).toContain(`about ${c2e} elements`);
    // Changing the constant must move the sentence with it. Verified by looking for a
    // literal reference in the source — comparing only numbers passes even when the
    // same value was hard-coded by coincidence.
    const source = readFileSync(
      resolve(__dirname, "../../mcp/src/construction-rules.mjs"),
      "utf-8",
    );
    expect(source).toContain(
      "${NODE_ELIGIBILITY_GATE.BOOTSTRAP_FANOUT_TRIGGER.domain_to_capability}",
    );
    expect(source).toContain(
      "${NODE_ELIGIBILITY_GATE.BOOTSTRAP_FANOUT_TRIGGER.capability_to_element}",
    );
  });
});

describe("Goodhart 방지 문장이 살아 있다", () => {
  it("capability 근거는 path, graph 자식은 element slug 로 분리한다", () => {
    const rules = flat(CONSTRUCTION_RULES_EN);
    expect(rules.length).toBeGreaterThan(0);
    expect(rules).toContain("one canonical implementation entry point in `path:`");
    expect(rules).toContain("`elements:` contains only slugs of real element nodes");
    expect(rules).not.toContain("the path itself, which counts");
    expect(rules).not.toContain("file path straight into `elements:`");
  });

  // In this spec a number is a verification threshold, not a target. Remove the
  // sentences below and what remains is "keep it under N", a metric a model satisfies
  // with two empty buckets — exactly what the council rejected in every form.
  it("상한이 아니라 트리거라고 명시한다", () => {
    expect(CONSTRUCTION_RULES_EN).toContain("NOT a limit");
    expect(CONSTRUCTION_RULES_EN).toContain("There is no maximum number of children");
  });

  it("「그냥 두라」 갈래가 있다", () => {
    expect(flat(CONSTRUCTION_RULES_EN)).toContain("create NOTHING");
  });

  it("쓰기를 막지 않는다고 못박는다", () => {
    expect(CONSTRUCTION_RULES_EN).toContain("does not block writes");
  });

  it("「N 미만으로 유지」 형태의 문구가 없다", () => {
    for (const text of [
      CONSTRUCTION_RULES_EN,
      ELEMENT_NAMING_RULE_EN,
      ELEMENT_NAMING_RULE_BATCH_EN,
      CHAT_RULES_DELTA_EN,
    ]) {
      expect(text).not.toMatch(/keep (?:it |them |the count )?under \d/i);
      expect(text).not.toMatch(/at most \d+ (?:children|capabilities|elements)/i);
    }
  });

  it("접두사를 조건이 아니라 힌트로 말한다", () => {
    // Measurement shows this signal is wrong in both directions —
    // `topology-kind-color-*` ×4 were legitimate siblings, and the 92 that were
    // actually broken shared no prefix at all.
    expect(flat(CONSTRUCTION_RULES_EN)).toContain("do NOT treat this as the condition");
    expect(CONSTRUCTION_RULES_EN).toContain("THIS IS THE TEST");
  });
});

describe("언어 경계 — 모델이 읽는 문자열은 영어 단일", () => {
  it.each([
    ["CONSTRUCTION_RULES_EN", CONSTRUCTION_RULES_EN],
    ["ELEMENT_NAMING_RULE_EN", ELEMENT_NAMING_RULE_EN],
    ["ELEMENT_NAMING_RULE_BATCH_EN", ELEMENT_NAMING_RULE_BATCH_EN],
    ["CHAT_RULES_DELTA_EN", CHAT_RULES_DELTA_EN],
  ])("%s 에 한글이 없다", (_name, text) => {
    expect(text).not.toMatch(/[가-힣]/);
  });
});

/**
 * Bridge nodes — decision ledger extension, 2026-08-01.
 *
 * Step 4 **already** instructed creating bridges precisely. What was missing was
 * not the procedure but the **name**, so the LLM could not grasp "this kind of node
 * may be created" as a concept. What this block guards is therefore ① that the name
 * exists and ② that the four qualifying conditions accompany it — recommending a
 * bridge without qualification is approving an empty bucket, exactly the Goodhart
 * trap this whole spec exists to block.
 */
describe("브릿지 노드 — 이름과 자격 조건은 함께 간다", () => {
  it("이름이 있다", () => {
    expect(flat(CONSTRUCTION_RULES_EN)).toContain("BRIDGE NODE");
  });

  it("자격 조건 넷이 전부 있다", () => {
    const rules = flat(CONSTRUCTION_RULES_EN);
    // ① Name the shared behaviour — merely sharing a location is not a bridge
    expect(rules).toContain("names a shared BEHAVIOR");
    expect(rules).toMatch(/"Group A"/);
    expect(rules).toContain("they are empty buckets");
    // ② Create it only if it can be stated in one sentence
    expect(rules).toContain("state that behavior in ONE sentence");
    // ③ The bridge itself must be semantically exclusive of its siblings
    expect(rules).toContain("bridge itself passes (a) against its own siblings");
    // ④ Actually reparent after creating it — left empty, it is the empty bucket
    expect(rules).toContain("reparent the children afterwards");
    expect(rules).toContain("reported for retirement");
  });

  it("넷을 못 채우면 아무것도 만들지 않는다는 출구가 붙어 있다", () => {
    // Without this sentence only "create a bridge" remains, which is an instruction to
    // manufacture empty buckets.
    expect(flat(CONSTRUCTION_RULES_EN)).toContain(
      "IF you cannot satisfy all four: create NOTHING",
    );
  });

  it("밀집 경고가 브릿지를 지목하되 자격 조건을 다시 읊지 않는다", () => {
    const message = flat(
      denseParentActionMessage({
        parentSlug: "capabilities/x",
        count: 9,
        childKind: "element",
        trigger: 6,
        basis: "bootstrap",
        evidence: "a single session filled this parent",
      }),
    );
    expect(message).toContain("BRIDGE NODE");
    // The four conditions live in the source of truth and are only pointed at here —
    // written in two places they diverge.
    expect(message).toContain("the construction rules list the four conditions");
    expect(message).not.toContain("names a shared BEHAVIOR");
    expect(message).not.toContain("ONE sentence");
  });
});
