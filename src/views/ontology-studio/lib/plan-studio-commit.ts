/**
 * 공방의 저장이 **어떤 파일 조작인지** 를 결정하는 단 하나의 순수 함수.
 *
 * 왜 함수로 뽑았나 — 이 결정은 사용자 디스크를 바꾸고, 틀리면 되돌리기가 비싸다.
 * 예전엔 페이지 안에서 `evidenceIds[0]` 하나로 결정했고, 그 값이 남의 문서일 수
 * 있다는 사실이 판정에 반영되지 않아 사용자가 A 에 대해 적은 관계가 B 의
 * frontmatter 에 앉았다. 결정을 순수 함수로 고정해 두면 "문서 없는 개념의 저장이
 * 남의 문서를 건드리지 않는다" 를 UI 없이 테스트로 못 박을 수 있다.
 *
 * IO 는 하지 않는다 — 무엇을 쓸지만 정하고, 실제 쓰기(또는 MCP 패킷 복사)는
 * 호출자가 한다.
 */

import { BEARING_FRONTMATTER_KEY, type StudioRelation } from "./build-studio-item";
import { planRelationRefUpdates, type StudioChange } from "./build-studio-changes";
import type { CreateCandidate, CreateDraft, CreateNodeKind } from "./build-create-node";
import type { StudioWriteTarget } from "./resolve-write-target";

export type StudioMissingTarget = Extract<StudioWriteTarget, { status: "missing" }>;

export type StudioCommitPlan =
  /** 기록할 변경이 없다. */
  | { op: "nothing" }
  /**
   * 이 개념에는 자기 문서가 없다 — 문서를 만들어도 되는지 먼저 물어야 한다.
   * 동의(=kind 선택) 없이는 어떤 파일도 만들지 않는다.
   */
  | { op: "consent-required"; target: StudioMissingTarget }
  /** 동의를 받았다 — 관계를 실은 새 문서 하나로 실체화한다. */
  | { op: "create-document"; slug: string; draft: CreateDraft; addedCount: number }
  /** 자기 문서가 있다 — 그 문서의 관계 배열만 고친다. */
  | {
      op: "update-frontmatter";
      /** 디스크에 쓸 경로 (로컬 볼트 기준). */
      slug: string;
      /** 복사해 주는 MCP 명령이 부를 이름 (에이전트 볼트 뿌리 기준). */
      agentSlug: string;
      updates: Record<string, string[]>;
    };

/**
 * 아직 문서가 없는 개념을 **하나의 새 문서로** 실체화하는 초안. 관계까지 같이
 * 실어 한 번에 쓴다 — 문서를 만든 뒤 따로 frontmatter 를 고치면 중간 상태가
 * 디스크에 남고, 실패 지점이 둘로 늘어난다.
 */
export function buildMaterializeDraft(
  target: StudioMissingTarget,
  approvedKind: CreateNodeKind,
  additions: ReadonlyArray<{ relation: StudioRelation; candidate: CreateCandidate }>,
): CreateDraft {
  return {
    kind: approvedKind,
    title: target.title,
    domainValue: target.domainValue,
    definition: "",
    relations: additions.map((a) => ({ type: a.relation, candidate: a.candidate })),
  };
}

export function planStudioCommit(input: {
  writeTarget: StudioWriteTarget;
  changes: readonly StudioChange[];
  /** 자기 문서의 현재 관계 배열. 문서가 없으면 전부 빈 배열이어야 한다. */
  baseRefs: Record<StudioRelation, string[]>;
  /** 사용자가 문서 생성에 동의하며 고른 종류. null/미지정 = 아직 동의 없음. */
  approvedKind?: CreateNodeKind | null;
}): StudioCommitPlan {
  const { writeTarget, changes, baseRefs, approvedKind } = input;
  if (changes.length === 0) return { op: "nothing" };

  if (writeTarget.status === "missing") {
    if (!approvedKind) return { op: "consent-required", target: writeTarget };
    // 문서가 없는 개념에는 고칠 관계도 없다 — 새로 잇는 것만 남는다.
    const additions = changes.filter(
      (c): c is Extract<StudioChange, { op: "add" }> => c.op === "add",
    );
    return {
      op: "create-document",
      slug: writeTarget.slug,
      draft: buildMaterializeDraft(
        writeTarget,
        approvedKind,
        additions.map((c) => ({ relation: c.relation, candidate: c.target as CreateCandidate })),
      ),
      addedCount: additions.length,
    };
  }

  const planned = planRelationRefUpdates(baseRefs, changes);
  const updates: Record<string, string[]> = {};
  for (const relation of ["isA", "dependsOn", "contains", "relates"] as StudioRelation[]) {
    const next = planned[relation];
    if (next) updates[BEARING_FRONTMATTER_KEY[relation]] = next;
  }
  return {
    op: "update-frontmatter",
    slug: writeTarget.slug,
    agentSlug: writeTarget.agentSlug,
    updates,
  };
}
