import { afterEach, describe, expect, it } from "vitest";
import {
  DEMO_SESSION_STORAGE_KEY,
  persistDemoSession,
} from "@/shared/lib/demo-session";
import { upsertProjectInContainer } from "./upsert-container";

const MIN_INPUT = {
  slug: "iam",
  name: "IAM",
  category: "platform",
  status: "developing",
  description: "",
  position: { x: 0, y: 0 },
} as const;

afterEach(() => {
  window.localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
});

describe("upsertProjectInContainer 가드", () => {
  it("accountId 가 비어있으면 throw", async () => {
    await expect(
      upsertProjectInContainer({
        accountId: "",
        projectId: "general",
        input: MIN_INPUT,
      }),
    ).rejects.toThrow(/accountId/);
    await expect(
      upsertProjectInContainer({
        accountId: null,
        projectId: "general",
        input: MIN_INPUT,
      }),
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
      upsertProjectInContainer({
        accountId: "u",
        projectId: "general",
        input: MIN_INPUT,
      }),
    ).rejects.toThrow(/데모/);
  });

  it("projectId 가 비어있으면 throw", async () => {
    await expect(
      upsertProjectInContainer({
        accountId: "u",
        projectId: "",
        input: MIN_INPUT,
      }),
    ).rejects.toThrow(/projectId/);
    await expect(
      upsertProjectInContainer({
        accountId: "u",
        projectId: "   ",
        input: MIN_INPUT,
      }),
    ).rejects.toThrow(/projectId/);
  });

  it("slug 가 비어있으면 throw", async () => {
    await expect(
      upsertProjectInContainer({
        accountId: "u",
        projectId: "general",
        input: { ...MIN_INPUT, slug: "" },
      }),
    ).rejects.toThrow(/slug/);
  });
});
