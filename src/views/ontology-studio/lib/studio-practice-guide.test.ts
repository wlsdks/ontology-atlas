import { describe, expect, it } from "vitest";

import {
  planPracticeCleanup,
  practiceStep,
  practiceStepIndex,
  type PracticeArtifact,
} from "./studio-practice-guide";

describe("practiceStep", () => {
  it("asks for a name while the draft has none", () => {
    expect(practiceStep({ title: "", relationCount: 0, saved: false })).toBe("name");
  });

  it("treats whitespace as no name — a blank title cannot be saved", () => {
    expect(practiceStep({ title: "   \n ", relationCount: 2, saved: false })).toBe("name");
  });

  it("asks for a relation once the node has a name", () => {
    expect(practiceStep({ title: "결제", relationCount: 0, saved: false })).toBe("relate");
  });

  it("asks to save once name and one relation exist", () => {
    expect(practiceStep({ title: "결제", relationCount: 1, saved: false })).toBe("save");
  });

  it("is done only after the write landed", () => {
    expect(practiceStep({ title: "결제", relationCount: 1, saved: true })).toBe("done");
  });

  /**
   * 이 테스트가 이 파일의 존재 이유다 — **단계는 지시가 아니라 관측이다.**
   * 사용자가 관계를 먼저 잇고 이름을 나중에 지어도 안내는 상태를 따라간다.
   * 스크립트가 상태를 앞지르면 안내가 거짓말이 되고, 거짓말하는 안내는 없는
   * 안내보다 나쁘다.
   */
  it("follows the user when they work out of order", () => {
    expect(practiceStep({ title: "", relationCount: 3, saved: false })).toBe("name");
  });

  it("orders the steps for a progress caption", () => {
    expect(practiceStepIndex("name")).toBe(1);
    expect(practiceStepIndex("done")).toBe(4);
  });
});

describe("planPracticeCleanup", () => {
  const base: PracticeArtifact = {
    slug: "capabilities/practice-node",
    title: "연습 노드",
    createdOriginSlug: null,
    touchedOrigin: null,
  };

  it("deletes just the practice node when nothing else was created", () => {
    expect(planPracticeCleanup(base)).toEqual({
      deleteSlugs: ["capabilities/practice-node"],
      detach: null,
    });
  });

  it("also deletes an origin document the practice itself materialized", () => {
    expect(
      planPracticeCleanup({ ...base, createdOriginSlug: "domains/practice-origin" }),
    ).toEqual({
      deleteSlugs: ["capabilities/practice-node", "domains/practice-origin"],
      detach: null,
    });
  });

  /**
   * 되돌리기가 새 노드만 지우면 **출발 노드에 남은 참조가 깨진 링크로 살아남는다**
   * — 실습이 볼트를 더럽히고 끝나는 셈이라 실습의 약속을 정면으로 깬다.
   */
  it("detaches the reference it appended to a pre-existing origin, keeping that document", () => {
    expect(
      planPracticeCleanup({
        ...base,
        touchedOrigin: {
          slug: "domains/billing",
          frontmatterKey: "contains",
          ref: "practice-node",
        },
      }),
    ).toEqual({
      deleteSlugs: ["capabilities/practice-node"],
      detach: {
        slug: "domains/billing",
        frontmatterKey: "contains",
        ref: "practice-node",
      },
    });
  });

  it("does not detach from a document it is deleting anyway", () => {
    expect(
      planPracticeCleanup({
        ...base,
        createdOriginSlug: "domains/practice-origin",
        touchedOrigin: {
          slug: "domains/practice-origin",
          frontmatterKey: "contains",
          ref: "practice-node",
        },
      }),
    ).toEqual({
      deleteSlugs: ["capabilities/practice-node", "domains/practice-origin"],
      detach: null,
    });
  });
});
