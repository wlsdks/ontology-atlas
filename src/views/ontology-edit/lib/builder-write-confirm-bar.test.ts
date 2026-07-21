import { describe, expect, it } from "vitest";
import {
  buildBuilderSessionDiffLines,
  resolveBuilderWriteConfirmAction,
  resolveBuilderWriteConfirmStatus,
} from "./builder-write-confirm-bar";

describe("resolveBuilderWriteConfirmStatus", () => {
  it("읽기 전용 소스면 readOnlySource — draft·관계 유무와 무관 최우선(거짓 약속 방지)", () => {
    expect(
      resolveBuilderWriteConfirmStatus({
        readOnlySource: true,
        hasPendingRelation: true,
        draftNodes: 3,
        draftEdges: 2,
        hasUnnamedDraft: true,
      }),
    ).toBe("readOnlySource");
  });

  it("대기 중인 관계가 있으면 relationPending — draft 상태 무관 최우선", () => {
    expect(
      resolveBuilderWriteConfirmStatus({
        readOnlySource: false,
        hasPendingRelation: true,
        draftNodes: 3,
        draftEdges: 2,
        hasUnnamedDraft: true,
      }),
    ).toBe("relationPending");
  });

  it("draft 없으면 clean", () => {
    expect(
      resolveBuilderWriteConfirmStatus({
        readOnlySource: false,
        hasPendingRelation: false,
        draftNodes: 0,
        draftEdges: 0,
        hasUnnamedDraft: false,
      }),
    ).toBe("clean");
  });

  it("이름 없는 draft 가 있으면 draftNeedsName", () => {
    expect(
      resolveBuilderWriteConfirmStatus({
        readOnlySource: false,
        hasPendingRelation: false,
        draftNodes: 1,
        draftEdges: 0,
        hasUnnamedDraft: true,
      }),
    ).toBe("draftNeedsName");
  });

  it("모든 draft 에 이름이 있으면 draftReady", () => {
    expect(
      resolveBuilderWriteConfirmStatus({
        readOnlySource: false,
        hasPendingRelation: false,
        draftNodes: 1,
        draftEdges: 1,
        hasUnnamedDraft: false,
      }),
    ).toBe("draftReady");
  });
});

describe("resolveBuilderWriteConfirmAction", () => {
  it("읽기 전용 소스면 connectSource — draft·관계 있어도 vault 연결로 유도", () => {
    expect(
      resolveBuilderWriteConfirmAction({
        readOnlySource: true,
        hasPendingRelation: true,
        readyDraftNodeId: "ephemeral-2",
        firstDraftNodeId: "ephemeral-1",
      }),
    ).toEqual({ type: "connectSource" });
  });

  it("대기 관계 우선 — 기존 RelationWriteConfirm 흐름(confirmPendingRelation) 재사용", () => {
    expect(
      resolveBuilderWriteConfirmAction({
        readOnlySource: false,
        hasPendingRelation: true,
        readyDraftNodeId: "ephemeral-1",
        firstDraftNodeId: "ephemeral-1",
      }),
    ).toEqual({ type: "confirmRelation" });
  });

  it("이름 있는 draft 가 있으면 saveDraft", () => {
    expect(
      resolveBuilderWriteConfirmAction({
        readOnlySource: false,
        hasPendingRelation: false,
        readyDraftNodeId: "ephemeral-2",
        firstDraftNodeId: "ephemeral-1",
      }),
    ).toEqual({ type: "saveDraft", nodeId: "ephemeral-2" });
  });

  it("이름 있는 draft 가 없으면 첫 draft 를 열어 이름부터 채우게(openDraft)", () => {
    expect(
      resolveBuilderWriteConfirmAction({
        readOnlySource: false,
        hasPendingRelation: false,
        readyDraftNodeId: null,
        firstDraftNodeId: "ephemeral-1",
      }),
    ).toEqual({ type: "openDraft", nodeId: "ephemeral-1" });
  });

  it("아무 draft 도 없으면 none", () => {
    expect(
      resolveBuilderWriteConfirmAction({
        readOnlySource: false,
        hasPendingRelation: false,
        readyDraftNodeId: null,
        firstDraftNodeId: null,
      }),
    ).toEqual({ type: "none" });
  });
});

describe("buildBuilderSessionDiffLines", () => {
  it("이름 없는(needsName) draft 는 파일 경로가 없어 제외한다", () => {
    const lines = buildBuilderSessionDiffLines({
      draftPreviews: [
        {
          id: "1",
          kind: "capability",
          title: "Agent Brief",
          kindLabel: "역량",
          path: "capabilities/agent-brief.md",
          needsName: false,
        },
        {
          id: "2",
          kind: "element",
          title: "(이름 필요)",
          kindLabel: "요소",
          path: "이름 입력 후 경로 생성",
          needsName: true,
        },
      ],
      pendingRelation: null,
    });
    expect(lines).toEqual([
      { changeType: "add", path: "capabilities/agent-brief.md" },
    ]);
  });

  it("대기 중인 관계가 있으면 source 파일에 대한 relation 변경 줄이 추가된다", () => {
    const lines = buildBuilderSessionDiffLines({
      draftPreviews: [],
      pendingRelation: { sourceSlug: "capabilities/product-owner-operating-system" },
    });
    expect(lines).toEqual([
      { changeType: "relation", path: "capabilities/product-owner-operating-system.md" },
    ]);
  });

  it("draft 도 관계도 없으면 빈 배열 — '쓰기 전엔 아무 파일도 안 바뀐다' 계약", () => {
    expect(
      buildBuilderSessionDiffLines({ draftPreviews: [], pendingRelation: null }),
    ).toEqual([]);
  });
});
