/**
 * SHA-256 헬퍼 — API key plaintext → hex 해시. Web Crypto SubtleCrypto 기반
 * 이라 브라우저·node>=20 양쪽에서 동작.
 *
 * Crypto API 가 없는 환경 (구버전 jsdom 등) 에선 throw — 의도적. 데모
 * fallback 안 함, 보안 모듈이라 실패는 명시적이어야 함.
 */
export async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("Web Crypto SubtleCrypto unavailable in this environment.");
  }
  const buffer = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * 새 API key plaintext 생성. 32 byte 무작위 → base64url. `nk_` prefix 로
 * narnia 키임을 식별.
 *
 * `crypto.getRandomValues` 만 사용 — predictable PRNG 금지.
 */
export function generateApiKeyPlaintext(): string {
  if (typeof crypto === "undefined" || !crypto.getRandomValues) {
    throw new Error("crypto.getRandomValues unavailable in this environment.");
  }
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // base64url (URL-safe, padding 제거)
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const base64 = btoa(binary);
  const urlSafe = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `nk_${urlSafe}`;
}
