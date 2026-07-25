import { beforeEach, describe, expect, it } from "vitest";

import type { StudioChange } from "./build-studio-changes";
import {
  DRAFT_MAX_AGE_MS,
  clearStudioDraft,
  listStudioDrafts,
  readStudioDraft,
  saveStudioDraft,
} from "./studio-draft-store";

const target = (id: string) => ({ id, title: id, kind: "capability", ref: `capabilities/${id}` });

const ADD: StudioChange = { op: "add", relation: "isA", target: target("parser") };
const REMOVE: StudioChange = { op: "remove", relation: "dependsOn", target: target("mcp") };

describe("studio-draft-store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("초안이 없으면 빈 배열 — 처음 여는 노드가 남의 편집을 물려받지 않는다", () => {
    expect(readStudioDraft("capability:cli")).toEqual([]);
    expect(listStudioDrafts()).toEqual([]);
  });

  it("저장한 초안을 그대로 되읽는다 (새로고침·재진입 복원 경로)", () => {
    saveStudioDraft("capability:cli", "CLI Developer Entry", [ADD, REMOVE], 1000);

    expect(readStudioDraft("capability:cli", 1001)).toEqual([ADD, REMOVE]);
  });

  it("노드마다 따로 보관한다 — 산책해도 각자의 초안이 남는다", () => {
    saveStudioDraft("capability:cli", "CLI", [ADD], 1000);
    saveStudioDraft("capability:mcp", "MCP", [REMOVE], 1001);

    expect(readStudioDraft("capability:cli", 1002)).toEqual([ADD]);
    expect(readStudioDraft("capability:mcp", 1002)).toEqual([REMOVE]);
  });

  it("빈 변경으로 저장하면 항목을 지운다 — 되돌린 초안이 목록에 유령으로 남지 않는다", () => {
    saveStudioDraft("capability:cli", "CLI", [ADD], 1000);
    saveStudioDraft("capability:cli", "CLI", [], 1002);

    expect(readStudioDraft("capability:cli", 1003)).toEqual([]);
    expect(listStudioDrafts(1003)).toEqual([]);
  });

  it("clearStudioDraft 는 저장 성공 후 그 노드만 비운다", () => {
    saveStudioDraft("capability:cli", "CLI", [ADD], 1000);
    saveStudioDraft("capability:mcp", "MCP", [REMOVE], 1001);

    clearStudioDraft("capability:cli", 1002);

    expect(readStudioDraft("capability:cli", 1003)).toEqual([]);
    expect(readStudioDraft("capability:mcp", 1003)).toEqual([REMOVE]);
  });

  it("목록은 최근 수정 순 — '작업중이던 것' 은 방금 만진 게 위로", () => {
    saveStudioDraft("capability:a", "A", [ADD], 1000);
    saveStudioDraft("capability:b", "B", [ADD], 3000);
    saveStudioDraft("capability:c", "C", [ADD], 2000);

    expect(listStudioDrafts(3001).map((d) => d.focalId)).toEqual([
      "capability:b",
      "capability:c",
      "capability:a",
    ]);
  });

  it("목록 항목은 이름과 변경 수를 들고 있어 그래프 없이도 그릴 수 있다", () => {
    saveStudioDraft("capability:cli", "CLI Developer Entry", [ADD, REMOVE], 1000);

    expect(listStudioDrafts(1001)).toEqual([
      { focalId: "capability:cli", title: "CLI Developer Entry", count: 2, updatedAt: 1000 },
    ]);
  });

  it("오래된 초안은 읽을 때 만료된다 — 몇 달 전 잔해가 되살아나지 않는다", () => {
    saveStudioDraft("capability:old", "Old", [ADD], 1000);
    const afterExpiry = 1000 + DRAFT_MAX_AGE_MS + 1;

    expect(readStudioDraft("capability:old", afterExpiry)).toEqual([]);
    expect(listStudioDrafts(afterExpiry)).toEqual([]);
  });

  it("깨진 JSON 이 들어 있어도 던지지 않고 빈 상태로 회복한다", () => {
    window.localStorage.setItem("ontology-atlas:studio-drafts:v1", "{not json");

    expect(readStudioDraft("capability:cli")).toEqual([]);
    expect(listStudioDrafts()).toEqual([]);
  });

  it("모양이 맞지 않는 항목은 조용히 버린다 (스키마 진화 내성)", () => {
    window.localStorage.setItem(
      "ontology-atlas:studio-drafts:v1",
      JSON.stringify({
        "capability:bad": { changes: "nope", updatedAt: 1000, title: "Bad" },
        "capability:good": { changes: [ADD], updatedAt: 1000, title: "Good" },
      }),
    );

    expect(readStudioDraft("capability:bad", 1001)).toEqual([]);
    expect(readStudioDraft("capability:good", 1001)).toEqual([ADD]);
  });
});
