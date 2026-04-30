import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { fromFirestoreApiKey } from "./mapper";

describe("fromFirestoreApiKey", () => {
  it("Timestamp → Date 변환 + 기본값 채움", () => {
    const created = Timestamp.fromDate(new Date("2026-04-22T09:00:00Z"));
    const used = Timestamp.fromDate(new Date("2026-04-22T10:00:00Z"));
    const revoked = Timestamp.fromDate(new Date("2026-04-22T11:00:00Z"));
    const result = fromFirestoreApiKey("k1", {
      accountId: "stark",
      name: "CI bot",
      keyHash: "abc123",
      keyPrefix: "nk_a3b1",
      scope: "account-rw",
      createdAt: created,
      createdBy: "admin@example.com",
      lastUsedAt: used,
      usageCount: 42,
      revokedAt: revoked,
    });

    expect(result.id).toBe("k1");
    expect(result.accountId).toBe("stark");
    expect(result.name).toBe("CI bot");
    expect(result.keyHash).toBe("abc123");
    expect(result.keyPrefix).toBe("nk_a3b1");
    expect(result.createdAt).toEqual(created.toDate());
    expect(result.lastUsedAt).toEqual(used.toDate());
    expect(result.usageCount).toBe(42);
    expect(result.revokedAt).toEqual(revoked.toDate());
  });

  it("선택 필드 누락 시 안전한 기본값", () => {
    const result = fromFirestoreApiKey("k2", { accountId: "x", name: "n" });
    expect(result.keyHash).toBe("");
    expect(result.keyPrefix).toBe("");
    expect(result.lastUsedAt).toBeUndefined();
    expect(result.usageCount).toBe(0);
    expect(result.revokedAt).toBeNull();
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it("name 누락 시 id 로 fallback", () => {
    const result = fromFirestoreApiKey("fallback-id", { accountId: "x" });
    expect(result.name).toBe("fallback-id");
  });
});
