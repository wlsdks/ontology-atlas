import { describe, expect, it } from "vitest";
import { generateApiKeyPlaintext, sha256Hex } from "./sha256";

describe("sha256Hex", () => {
  it("같은 입력은 같은 해시 (deterministic)", async () => {
    const a = await sha256Hex("hello");
    const b = await sha256Hex("hello");
    expect(a).toBe(b);
  });

  it("표준 SHA-256 결과 (RFC 시험 벡터)", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("빈 문자열도 처리", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("generateApiKeyPlaintext", () => {
  it("nk_ prefix + base64url body", () => {
    const key = generateApiKeyPlaintext();
    expect(key.startsWith("nk_")).toBe(true);
    expect(key).toMatch(/^nk_[A-Za-z0-9_-]+$/);
  });

  it("매 호출마다 다른 값 (충돌 확률 매우 낮음)", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 50; i += 1) keys.add(generateApiKeyPlaintext());
    expect(keys.size).toBe(50);
  });
});
