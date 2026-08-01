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
 * 구축 규격의 「텍스트 정본」 게이트.
 *
 * `mcp/src/construction-rules.mjs` 의 헤더가 스스로 이 파일을 지목하며 *"이
 * 게이트가 생기기 전까지 이 파일은 정본이 아니라 제안"* 이라고 적어 두었다.
 * 실제로 그랬다 — 네 문자열은 한동안 소비처가 0건이었고, 아무도 안 읽는
 * 문장은 규격이 아니다.
 *
 * 그래서 이 파일이 재는 것은 문구의 품질이 아니라 **도달과 단일성** 둘이다:
 * LLM 이 실제로 읽는 자리에 도착했는가, 그리고 도착한 경로가 import 인가
 * 손 복제인가. 후자를 재지 않으면 "single source" 는 주석에만 있는 말이 된다.
 */

const INDEX_SOURCE = readFileSync(
  resolve(__dirname, "../../mcp/src/index.js"),
  "utf-8",
);

/** 정본에서만 나오는, 손으로 다시 칠 리 없는 구절. */
const RULES_FINGERPRINT = "count alone is not evidence of";

/**
 * 줄바꿈은 계약이 아니다 — 뜻이 계약이다. 정본은 하드랩된 문장이라 한 구절이
 * 줄을 걸치면 `toContain` 이 깨지는데, 그건 규격이 바뀐 게 아니라 폭이 바뀐
 * 것이다. 공백을 접어서 비교한다.
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
    // 도구 설명은 LLM 이 **호출 직전에** 읽는 유일한 텍스트라, 그 순간 가장
    // 어기기 쉬운 규칙(파일 이름으로 노드를 만드는 것)이 여기 실려야 한다.
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
  // 같은 `mcp/` 패키지라 진짜 import 가 가능하다. 가능한데도 복제했다면 그건
  // 관습이 아니라 사고다 — 두 벌은 반드시 갈라지고, 갈라진 쪽이 기본값이 된다.
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
    // 상수를 바꾸면 문장이 따라 움직여야 한다. 소스에 리터럴 참조가 있는지로
    // 확인 — 숫자만 비교하면 우연히 같은 값을 하드코딩해도 통과한다.
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

  // 이 규격에서 숫자는 목표가 아니라 확인 요구선이다. 아래 문장들이 사라지면
  // 남는 것은 「N 미만으로 유지하라」이고, 그건 모델이 빈 버킷 두 개로
  // 통과시키는 지표다 — 카운슬이 모든 형태로 기각한 바로 그것.
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
    // 실측상 방향이 양쪽 다 틀리는 신호다 — `topology-kind-color-*` ×4 는 정당한
    // 형제였고, 실제로 망가진 92는 접두사가 하나도 겹치지 않았다.
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
 * 브릿지 노드 — 2026-08-01 원장 확장.
 *
 * step 4 는 **이미** 브릿지 만들기를 정확히 지시하고 있었다. 빠진 것은 절차가
 * 아니라 **이름**이라, LLM 이 「이런 종류의 노드를 만들어도 된다」를 개념으로
 * 집지 못했다. 그래서 이 블록이 지키는 것은 ① 이름이 있는가 ② 자격 조건 넷이
 * 함께 있는가 둘이다 — 자격 없는 브릿지 권장은 빈 버킷 승인이고, 그건 이
 * 규격 전체가 막으려는 바로 그 Goodhart 함정이다.
 */
describe("브릿지 노드 — 이름과 자격 조건은 함께 간다", () => {
  it("이름이 있다", () => {
    expect(flat(CONSTRUCTION_RULES_EN)).toContain("BRIDGE NODE");
  });

  it("자격 조건 넷이 전부 있다", () => {
    const rules = flat(CONSTRUCTION_RULES_EN);
    // ① 공유하는 행동을 명명한다 — 자리만 나누는 것은 브릿지가 아니다
    expect(rules).toContain("names a shared BEHAVIOR");
    expect(rules).toMatch(/"Group A"/);
    expect(rules).toContain("they are empty buckets");
    // ② 한 문장으로 쓸 수 있어야 만든다
    expect(rules).toContain("state that behavior in ONE sentence");
    // ③ 브릿지 자신도 형제와 의미 배타적
    expect(rules).toContain("bridge itself passes (a) against its own siblings");
    // ④ 만든 뒤 실제로 재부모화 — 빈 채로 남으면 그게 빈 버킷
    expect(rules).toContain("reparent the children afterwards");
    expect(rules).toContain("reported for retirement");
  });

  it("넷을 못 채우면 아무것도 만들지 않는다는 출구가 붙어 있다", () => {
    // 이 문장이 없으면 「브릿지를 만들어라」만 남고, 그게 빈 버킷 생산 지시다.
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
    // 조건 넷은 정본에 있고 여기서는 가리키기만 한다 — 두 곳에 적으면 갈라진다.
    expect(message).toContain("the construction rules list the four conditions");
    expect(message).not.toContain("names a shared BEHAVIOR");
    expect(message).not.toContain("ONE sentence");
  });
});
