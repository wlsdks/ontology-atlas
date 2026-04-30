/**
 * API Key — 외부 클라이언트 (CLI · CI · MCP server) 가 `/api/v1/docs` 같은
 * HTTP 엔드포인트로 워크스페이스에 push 할 수 있게 하는 인증 토큰.
 *
 * 경로: `accounts/{accountId}/apiKeys/{keyId}`
 *
 * 보안:
 *  - keyHash: SHA-256(plaintext) 만 저장. 평문은 발급 직후 한 번 UI 에 노출.
 *  - keyPrefix: 키의 처음 8자. 사용자가 어떤 키인지 식별할 수 있게 UI 표시용.
 *  - revokedAt: revoke 후 audit 보존을 위해 삭제 안 함, revokedAt set 으로
 *    soft-delete.
 */
export interface ApiKey {
  id: string;
  accountId: string;
  /** 사용자 식별용 라벨 (예: "CI bot", "MCP from laptop"). */
  name: string;
  /** SHA-256(plaintext key) 16진수. */
  keyHash: string;
  /** 평문 키의 처음 8자 — UI 표시용 (예: "nk_a3b1…"). */
  keyPrefix: string;
  /** v1 단일 scope. 미래 per-container/action 분리 예약. */
  scope: "account-rw";
  createdAt: Date;
  /** 발급한 admin 이메일. */
  createdBy: string;
  lastUsedAt?: Date;
  usageCount: number;
  /** revoke 됐으면 timestamp, 아니면 null. */
  revokedAt: Date | null;
}

/** 발급 시 입력. id/createdAt 은 API 가 부여, keyHash/keyPrefix 는 평문에서 생성. */
export type ApiKeyInput = Omit<
  ApiKey,
  "id" | "createdAt" | "lastUsedAt" | "usageCount" | "revokedAt"
>;
