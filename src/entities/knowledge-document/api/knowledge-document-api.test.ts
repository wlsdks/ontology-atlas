import { afterEach, describe, expect, it } from "vitest";
import {
  DEMO_SESSION_STORAGE_KEY,
  persistDemoSession,
} from "@/shared/lib/demo-session";
import { DEMO_ACCOUNT_ID } from "@/shared/mocks/demo-data";
import {
  listKnowledgeDocuments,
  subscribeKnowledgeDocuments,
} from "./knowledge-document-api";

/**
 * 데모 세션 fallback 회귀 테스트. 이전엔 `/admin/knowledge/documents/?account=stress-lab`
 * 가 "문서가 없습니다" 로 떠서 데모 운영 흐름이 막혀 있었다. list/subscribe
 * 두 진입점 모두 DEMO_ACCOUNT_ID 안에서만 seeded 문서를 돌려주고, 다른
 * account 에서는 빈 배열.
 */

afterEach(() => {
  window.localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
});

function setDemoSession() {
  persistDemoSession({
    uid: "demo-uid",
    email: null,
    displayName: null,
    provider: "demo",
  });
}

describe("listKnowledgeDocuments (demo fallback)", () => {
  it("데모 세션 + 데모 account → seeded 문서 목록", async () => {
    setDemoSession();
    const docs = await listKnowledgeDocuments(DEMO_ACCOUNT_ID);
    expect(docs.length).toBeGreaterThan(0);
  });

  it("데모 세션 + 미지정 account → seeded 문서 목록", async () => {
    setDemoSession();
    const docs = await listKnowledgeDocuments(null);
    expect(docs.length).toBeGreaterThan(0);
  });

  it("데모 세션 + 다른 account → 빈 배열", async () => {
    setDemoSession();
    await expect(listKnowledgeDocuments("other-lab")).resolves.toEqual([]);
  });
});

describe("subscribeKnowledgeDocuments (demo fallback)", () => {
  it("데모 세션이면 seeded 문서 1회 emit + no-op unsub", async () => {
    setDemoSession();
    const received: unknown[] = [];
    const unsub = subscribeKnowledgeDocuments(DEMO_ACCOUNT_ID, (docs) => {
      received.push(docs);
    });
    await Promise.resolve();
    expect(received).toHaveLength(1);
    const list = received[0] as unknown[];
    expect(list.length).toBeGreaterThan(0);
    expect(() => unsub()).not.toThrow();
  });

  it("데모 세션 + 다른 account → 빈 배열 emit", async () => {
    setDemoSession();
    const received: unknown[] = [];
    const unsub = subscribeKnowledgeDocuments("other-lab", (docs) => {
      received.push(docs);
    });
    await Promise.resolve();
    expect(received).toEqual([[]]);
    unsub();
  });
});
