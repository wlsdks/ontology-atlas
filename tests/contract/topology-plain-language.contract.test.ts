import { describe, expect, it } from "vitest";
import koMessages from "../../messages/ko.json";

const topology = koMessages.topology;

describe("topology Korean plain-language contract", () => {
  it("names graph facts as stable noun groups instead of implementation metaphors", () => {
    expect(koMessages.edgeTypesPlain).toMatchObject({
      contains: "하위 항목",
      belongs_to: "상위 항목",
      depends_on: "필요한 항목",
      describes: "근거 문서",
      related_to: "관련 항목",
      is_a: "상위 개념",
    });
    expect(koMessages.fullDetailA1.metric).toMatchObject({
      contains: "하위 항목",
      dependsOn: "필요한 항목",
    });
  });

  it("uses target-plus-result actions in the compact project inspector", () => {
    expect(topology.nodeDatasheet).toMatchObject({
      actionsGroupLabel: "선택한 항목에서 할 일",
      actionDocument: "문서 열기",
      actionEditRelations: "관계 편집",
      actionCopyHandoff: "AI에게 줄 항목 정보 복사",
      actionAskAgent: "AI에게 물어보기",
      openFullDetail: "자세히 보기",
      sourceRelationsShow: "관계 자세히 보기",
      sourceRelationsHide: "관계 간단히 보기",
      sourceAction_use_current_evidence: "AI에게 줄 프로젝트 정보 복사",
      handoffCopied: "AI에게 줄 정보를 복사했어요. 대화창에 붙여넣으세요.",
    });
    expect(topology.realm.enterAction).toBe("이 영역만 보기");
  });

  it("does not expose internal handoff or measurement wording in the inspected labels", () => {
    const inspected = JSON.stringify({
      nodeDatasheet: topology.nodeDatasheet,
      realm: topology.realm,
      edgeTypesPlain: koMessages.edgeTypesPlain,
      fullDetailA1: koMessages.fullDetailA1,
    });
    for (const internalTerm of ["인계문", "핸드오프", "담는 것", "속한 곳", "기대는 곳", "이것만 보기", "전체 상세"]) {
      expect(inspected).not.toContain(internalTerm);
    }
  });
});
