import type { VaultIssueCode } from "./validate-vault-document";

/**
 * Validator warning code → an already-localised plain sentence. The caller builds
 * this from `t()`; keeping next-intl out of this module makes it a pure function
 * a test can drive with a stub dictionary.
 */
export type VaultIssuePlainMessageDict = Partial<Record<VaultIssueCode, string>>;

/** Turns a machine code (`missing-expected-field` and friends) into plain words. An unknown code returns itself, so a code whose dictionary entry was forgotten leaves a visible trace on screen. */
export function mapVaultIssueCodeToPlainMessage(
  code: string,
  dict: VaultIssuePlainMessageDict,
): string {
  return (dict as Record<string, string | undefined>)[code] ?? code;
}
