import type { VaultIssueCode } from "./validate-vault-document";

/**
 * validator warning code → 이미 로컬라이즈된 평문 문자열 사전. next-intl
 * 의 `t()` 결과를 호출부(DocFrontmatterBlock)가 만들어 넘긴다 — 이 모듈은
 * next-intl 을 직접 참조하지 않는 순수 함수라 스텁 dict 만으로 단위
 * 테스트가 가능하다.
 */
export type VaultIssuePlainMessageDict = Partial<Record<VaultIssueCode, string>>;

/**
 * validator 의 machine code(`missing-expected-field` 등)를 UI 가 그대로
 * 노출하지 않도록 평문으로 바꾼다. dict 에 없는(알 수 없는) code 는 조용히
 * 누락하지 않고 원본 code 문자열을 그대로 반환한다 — 새 코드가 추가됐는데
 * dict 갱신을 깜빡해도 화면에서 흔적이 남는다(silent drop 금지).
 */
export function mapVaultIssueCodeToPlainMessage(
  code: string,
  dict: VaultIssuePlainMessageDict,
): string {
  return (dict as Record<string, string | undefined>)[code] ?? code;
}
