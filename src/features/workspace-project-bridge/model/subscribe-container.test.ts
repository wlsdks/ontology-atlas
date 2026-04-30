import { afterEach, describe, expect, it } from "vitest";
import {
  DEMO_SESSION_STORAGE_KEY,
  persistDemoSession,
} from "@/shared/lib/demo-session";
import { subscribeProjectsForContainer } from "./subscribe-container";

/**
 * Firestore 실제 구독 경로는 emulator 없이 단위 테스트 불가. 여기서는
 * 가드 분기 (accountId 없음 · 데모 세션) 만 검증.
 */

afterEach(() => {
  window.localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
});

describe("subscribeProjectsForContainer 가드", () => {
  it("accountId 없으면 빈 배열 콜백 + no-op unsubscribe", async () => {
    const received: unknown[] = [];
    const unsub = subscribeProjectsForContainer(null, "general", (projects) => {
      received.push(projects);
    });
    await Promise.resolve();
    expect(received).toEqual([[]]);
    expect(typeof unsub).toBe("function");
    expect(() => unsub()).not.toThrow();
  });

  it("데모 세션이면 빈 배열 콜백", async () => {
    persistDemoSession({
      uid: "demo-uid",
      email: null,
      displayName: null,
      provider: "demo",
    });
    const received: unknown[] = [];
    const unsub = subscribeProjectsForContainer("demo-uid", "general", (projects) => {
      received.push(projects);
    });
    await Promise.resolve();
    expect(received).toEqual([[]]);
    unsub();
  });

  it("projectId 가 비어 있으면 'general' 로 폴백 (데모 세션으로 단락)", async () => {
    persistDemoSession({
      uid: "demo-uid",
      email: null,
      displayName: null,
      provider: "demo",
    });
    const received: unknown[] = [];
    const unsub = subscribeProjectsForContainer("demo-uid", null, (projects) => {
      received.push(projects);
    });
    await Promise.resolve();
    expect(received).toEqual([[]]);
    unsub();
  });
});
