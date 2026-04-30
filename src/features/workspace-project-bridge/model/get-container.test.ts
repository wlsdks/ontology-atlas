import { afterEach, describe, expect, it } from "vitest";
import {
  DEMO_SESSION_STORAGE_KEY,
  persistDemoSession,
} from "@/shared/lib/demo-session";
import {
  getProjectFromContainer,
  listProjectsForContainer,
} from "./get-container";

afterEach(() => {
  window.localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
});

describe("getProjectFromContainer 가드", () => {
  it("accountId 없으면 null", async () => {
    await expect(getProjectFromContainer(null, "general", "iam")).resolves.toBeNull();
    await expect(getProjectFromContainer("", "general", "iam")).resolves.toBeNull();
  });
  it("slug 없으면 null", async () => {
    await expect(getProjectFromContainer("u", "general", "")).resolves.toBeNull();
  });
  it("데모 세션이면 null", async () => {
    persistDemoSession({ uid: "u", email: null, displayName: null, provider: "demo" });
    await expect(getProjectFromContainer("u", "general", "iam")).resolves.toBeNull();
  });
});

describe("listProjectsForContainer 가드", () => {
  it("accountId 없으면 빈 배열", async () => {
    await expect(listProjectsForContainer(null, "general")).resolves.toEqual([]);
  });
  it("데모 세션이면 빈 배열", async () => {
    persistDemoSession({ uid: "u", email: null, displayName: null, provider: "demo" });
    await expect(listProjectsForContainer("u", "general")).resolves.toEqual([]);
  });
});
