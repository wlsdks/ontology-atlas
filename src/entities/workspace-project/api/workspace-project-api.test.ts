import { afterEach, describe, expect, it } from "vitest";
import {
  DEMO_SESSION_STORAGE_KEY,
  persistDemoSession,
} from "@/shared/lib/demo-session";
import {
  ensureDefaultWorkspaceProject,
  listWorkspaceProjects,
  subscribeWorkspaceProjects,
} from "./workspace-project-api";

/**
 * API skeleton 의 "early return" 분기만 검증한다. Firestore 실제 write 경로는
 * Phase 4 UI 통합 테스트에서 emulator 로 커버 예정.
 */

afterEach(() => {
  window.localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
});

describe("ensureDefaultWorkspaceProject", () => {
  it("accountId 가 비어있으면 no-op (Firestore 접근 없음)", async () => {
    await expect(ensureDefaultWorkspaceProject(null)).resolves.toBeUndefined();
    await expect(ensureDefaultWorkspaceProject("")).resolves.toBeUndefined();
    await expect(ensureDefaultWorkspaceProject("   ")).resolves.toBeUndefined();
  });

  it("데모 세션에서는 no-op", async () => {
    persistDemoSession({
      uid: "demo-uid",
      email: "demo@example.com",
      displayName: "demo",
      provider: "demo",
    });
    await expect(ensureDefaultWorkspaceProject("demo-uid")).resolves.toBeUndefined();
  });
});

describe("listWorkspaceProjects", () => {
  it("accountId 가 비어있으면 빈 배열", async () => {
    await expect(listWorkspaceProjects(null)).resolves.toEqual([]);
    await expect(listWorkspaceProjects(undefined)).resolves.toEqual([]);
  });

  it("데모 세션에서는 빈 배열", async () => {
    persistDemoSession({
      uid: "demo-uid",
      email: null,
      displayName: null,
      provider: "demo",
    });
    await expect(listWorkspaceProjects("demo-uid")).resolves.toEqual([]);
  });
});

describe("subscribeWorkspaceProjects", () => {
  it("accountId 가 비어있으면 빈 배열 콜백 + no-op unsubscribe", async () => {
    const received: unknown[] = [];
    const unsub = subscribeWorkspaceProjects(null, (projects) => {
      received.push(projects);
    });
    await Promise.resolve();
    expect(received).toEqual([[]]);
    expect(typeof unsub).toBe("function");
    expect(() => unsub()).not.toThrow();
  });

  it("데모 세션에서는 빈 배열 콜백", async () => {
    persistDemoSession({
      uid: "demo-uid",
      email: null,
      displayName: null,
      provider: "demo",
    });
    const received: unknown[] = [];
    const unsub = subscribeWorkspaceProjects("demo-uid", (projects) => {
      received.push(projects);
    });
    await Promise.resolve();
    expect(received).toEqual([[]]);
    unsub();
  });
});
