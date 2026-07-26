import { describe, expect, it } from "vitest";
import { planStudioCommit } from "./plan-studio-commit";
import type { StudioChange } from "./build-studio-changes";
import type { StudioRelation } from "./build-studio-item";
import type { StudioWriteTarget } from "./resolve-write-target";

const EMPTY_REFS: Record<StudioRelation, string[]> = {
  isA: [],
  dependsOn: [],
  contains: [],
  relates: [],
};

const REFUND = { id: "capability:refund", title: "Refund", kind: "capability", ref: "capabilities/refund" };
const ADD_DEPENDS: StudioChange[] = [{ op: "add", relation: "dependsOn", target: REFUND }];

/** 자기를 인용한 *남의* 문서만 가진 개념 — vault 의 67% 가 이 모양이다(도그푸드 실측). */
const MISSING: StudioWriteTarget = {
  status: "missing",
  slug: "elements/payment-gateway",
  title: "payment-gateway",
  kind: "element",
  domainValue: "checkout",
};

const EXISTING: StudioWriteTarget = { status: "existing", slug: "capabilities/card-payment" };

describe("planStudioCommit", () => {
  it("변경이 없으면 아무 파일도 건드리지 않는다", () => {
    expect(planStudioCommit({ writeTarget: EXISTING, changes: [], baseRefs: EMPTY_REFS })).toEqual({
      op: "nothing",
    });
  });

  it("자기 문서가 있으면 그 문서의 관계 배열만 고친다", () => {
    const plan = planStudioCommit({
      writeTarget: EXISTING,
      changes: ADD_DEPENDS,
      baseRefs: { ...EMPTY_REFS, dependsOn: ["capabilities/ledger"] },
    });
    expect(plan).toEqual({
      op: "update-frontmatter",
      slug: "capabilities/card-payment",
      updates: { dependencies: ["capabilities/ledger", "capabilities/refund"] },
    });
  });

  /**
   * ── 이 파일이 존재하는 이유 (2026-07-26 재현) ──────────────────────────
   *
   * 공방에서 `payment-gateway`(자기 `.md` 없음)를 열고 "Refund 에 기대요" 를
   * 저장했더니, 실제로 바뀐 파일은 `capabilities/card-payment.md` 였다 —
   * `dependencies: [capabilities/refund]` 가 **Card Payment 의 문서**에 앉았다.
   * 지도는 그때부터 "Card Payment 가 Refund 에 기댄다" 고 말한다. 사용자가 한
   * 적 없는 주장이고, 성공 토스트까지 떴으며, 되돌리려면 남의 문서를 손으로
   * 고쳐야 한다.
   */
  it("자기 문서가 없으면 절대 frontmatter 를 고치지 않는다 — 먼저 동의를 묻는다", () => {
    const plan = planStudioCommit({
      writeTarget: MISSING,
      changes: ADD_DEPENDS,
      baseRefs: EMPTY_REFS,
    });
    expect(plan).toEqual({ op: "consent-required", target: MISSING });
    // 회귀 차단의 핵심 — 동의 전에는 어떤 경로로도 쓰기가 나오지 않는다.
    expect(plan.op).not.toBe("update-frontmatter");
    expect(plan.op).not.toBe("create-document");
  });

  it("동의를 받으면 그 개념 자신의 문서를 만들고, 관계를 거기에 싣는다", () => {
    const plan = planStudioCommit({
      writeTarget: MISSING,
      changes: ADD_DEPENDS,
      baseRefs: EMPTY_REFS,
      approvedKind: "element",
    });
    expect(plan.op).toBe("create-document");
    if (plan.op !== "create-document") return;
    // 새 문서는 **기존 인용이 이미 가리키는 경로**에 앉는다 — 다른 곳에 만들면
    // 그 인용은 여전히 허공을 가리킨다.
    expect(plan.slug).toBe("elements/payment-gateway");
    expect(plan.draft).toEqual({
      kind: "element",
      title: "payment-gateway",
      domainValue: "checkout",
      definition: "",
      relations: [{ type: "dependsOn", candidate: REFUND }],
    });
    expect(plan.addedCount).toBe(1);
  });

  it("동의 시 고른 종류가 새 문서의 kind 가 된다", () => {
    const plan = planStudioCommit({
      writeTarget: { ...MISSING, kind: null },
      changes: ADD_DEPENDS,
      baseRefs: EMPTY_REFS,
      approvedKind: "capability",
    });
    expect(plan.op === "create-document" && plan.draft.kind).toBe("capability");
  });

  /**
   * 문서가 없는 개념에는 "고칠 기존 관계" 가 있을 수 없다 — 그 관계는 전부 남의
   * 문서에 적혀 있어 이 화면에서 편집 대상이 아니다. 혹시 초안에 섞여 들어와도
   * 새 문서에는 새로 이은 것만 실린다.
   */
  it("문서를 만들 때는 새로 이은 관계만 싣는다", () => {
    const mixed: StudioChange[] = [
      ...ADD_DEPENDS,
      { op: "remove", relation: "contains", target: REFUND },
    ];
    const plan = planStudioCommit({
      writeTarget: MISSING,
      changes: mixed,
      baseRefs: EMPTY_REFS,
      approvedKind: "element",
    });
    expect(plan.op === "create-document" && plan.draft.relations).toEqual([
      { type: "dependsOn", candidate: REFUND },
    ]);
  });
});
