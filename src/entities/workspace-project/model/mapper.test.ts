import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { fromFirestoreWorkspaceProject } from "./mapper";

describe("fromFirestoreWorkspaceProject", () => {
  it("Timestamp 를 Date 로 변환하고 기본값을 채운다", () => {
    const created = Timestamp.fromDate(new Date("2026-04-20T10:00:00Z"));
    const updated = Timestamp.fromDate(new Date("2026-04-21T10:00:00Z"));
    const result = fromFirestoreWorkspaceProject("general", {
      accountId: "stark",
      name: "General",
      description: "기본 프로젝트 컨테이너",
      isPublic: false,
      order: 0,
      createdAt: created,
      updatedAt: updated,
    });
    expect(result.id).toBe("general");
    expect(result.accountId).toBe("stark");
    expect(result.name).toBe("General");
    expect(result.description).toBe("기본 프로젝트 컨테이너");
    expect(result.isPublic).toBe(false);
    expect(result.order).toBe(0);
    expect(result.createdAt).toEqual(created.toDate());
    expect(result.updatedAt).toEqual(updated.toDate());
  });

  it("누락된 선택 필드는 undefined, 이름은 id 로 폴백", () => {
    const result = fromFirestoreWorkspaceProject("fallback", {
      accountId: "x",
    });
    expect(result.name).toBe("fallback");
    expect(result.description).toBeUndefined();
    expect(result.isPublic).toBeUndefined();
    expect(result.order).toBeUndefined();
    expect(result.metadata).toBeUndefined();
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it("metadata 는 객체면 보존", () => {
    const result = fromFirestoreWorkspaceProject("m", {
      accountId: "x",
      metadata: { icon: "🦁", color: "#5e6ad2" },
    });
    expect(result.metadata).toEqual({ icon: "🦁", color: "#5e6ad2" });
  });

  it("metadata 가 객체가 아니면 undefined", () => {
    const result = fromFirestoreWorkspaceProject("m", {
      accountId: "x",
      metadata: "not-an-object",
    });
    expect(result.metadata).toBeUndefined();
  });
});
