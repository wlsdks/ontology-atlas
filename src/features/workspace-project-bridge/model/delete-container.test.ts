import { afterEach, describe, expect, it } from "vitest";
import {
  DEMO_SESSION_STORAGE_KEY,
  persistDemoSession,
} from "@/shared/lib/demo-session";
import {
  deleteProjectFromContainer,
  deleteProjectsAdaptive,
} from "./delete-container";

afterEach(() => {
  window.localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
});

describe("deleteProjectFromContainer 가드", () => {
  it("accountId 가 비어있으면 throw", async () => {
    await expect(
      deleteProjectFromContainer(null, "general", "iam"),
    ).rejects.toThrow(/accountId/);
  });

  it("데모 세션이면 throw", async () => {
    persistDemoSession({
      uid: "u",
      email: null,
      displayName: null,
      provider: "demo",
    });
    await expect(
      deleteProjectFromContainer("u", "general", "iam"),
    ).rejects.toThrow(/데모/);
  });

  it("projectId 또는 slug 가 비어있으면 throw", async () => {
    await expect(
      deleteProjectFromContainer("u", "", "iam"),
    ).rejects.toThrow(/projectId/);
    await expect(
      deleteProjectFromContainer("u", "general", ""),
    ).rejects.toThrow(/projectId/);
  });
});

describe("deleteProjectsAdaptive 가드", () => {
  it("컨테이너 컨텍스트 + accountId 누락 → throw", async () => {
    await expect(
      deleteProjectsAdaptive(["a"], { workspaceProjectId: "general" }),
    ).rejects.toThrow(/accountId/);
  });

  it("컨테이너 컨텍스트 + 데모 세션 → throw", async () => {
    persistDemoSession({
      uid: "u",
      email: null,
      displayName: null,
      provider: "demo",
    });
    await expect(
      deleteProjectsAdaptive(["a"], {
        accountId: "u",
        workspaceProjectId: "general",
      }),
    ).rejects.toThrow(/데모/);
  });

  it("빈 slug 배열은 no-op", async () => {
    await expect(
      deleteProjectsAdaptive([], {
        accountId: "u",
        workspaceProjectId: "general",
      }),
    ).resolves.toBeUndefined();
  });
});
