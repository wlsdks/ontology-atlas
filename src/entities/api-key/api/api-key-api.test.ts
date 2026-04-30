import { afterEach, describe, expect, it } from "vitest";
import {
  DEMO_SESSION_STORAGE_KEY,
  persistDemoSession,
} from "@/shared/lib/demo-session";
import {
  generateApiKey,
  listApiKeys,
  revokeApiKey,
  subscribeApiKeys,
} from "./api-key-api";

afterEach(() => {
  window.localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
});

describe("generateApiKey 가드", () => {
  it("accountId 누락 → throw", async () => {
    await expect(
      generateApiKey({ accountId: "", name: "test", createdBy: "a@b" }),
    ).rejects.toThrow(/accountId/);
  });

  it("name 공백 → throw", async () => {
    await expect(
      generateApiKey({ accountId: "x", name: "  ", createdBy: "a@b" }),
    ).rejects.toThrow(/이름/);
  });

  it("데모 세션 → throw", async () => {
    persistDemoSession({
      uid: "demo-uid",
      email: null,
      displayName: null,
      provider: "demo",
    });
    await expect(
      generateApiKey({ accountId: "x", name: "test", createdBy: "a@b" }),
    ).rejects.toThrow(/데모/);
  });
});

describe("listApiKeys / subscribeApiKeys / revokeApiKey 가드", () => {
  it("listApiKeys: accountId 없음 → 빈 배열", async () => {
    await expect(listApiKeys(null)).resolves.toEqual([]);
  });

  it("listApiKeys: 데모 세션 → 빈 배열", async () => {
    persistDemoSession({
      uid: "demo-uid",
      email: null,
      displayName: null,
      provider: "demo",
    });
    await expect(listApiKeys("x")).resolves.toEqual([]);
  });

  it("subscribeApiKeys: accountId 없음 → 빈 배열 콜백 + no-op unsubscribe", async () => {
    const received: unknown[] = [];
    const unsub = subscribeApiKeys(null, (keys) => received.push(keys));
    await Promise.resolve();
    expect(received).toEqual([[]]);
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("revokeApiKey: 데모 세션 → throw", async () => {
    persistDemoSession({
      uid: "demo-uid",
      email: null,
      displayName: null,
      provider: "demo",
    });
    await expect(revokeApiKey("x", "k1")).rejects.toThrow(/데모/);
  });

  it("revokeApiKey: keyId 없음 → throw", async () => {
    await expect(revokeApiKey("x", "")).rejects.toThrow(/keyId/);
  });
});
