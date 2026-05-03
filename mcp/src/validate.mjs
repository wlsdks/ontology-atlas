/**
 * MCP 도구 입력 validation helpers.
 *
 * UI 와 parity 유지: src/views/ontology-edit/lib/is-untitled-title.ts 의
 * Inspector 검증과 같은 룰 — 비-empty, trim 후 비-empty 강제. AI agent 가
 * silent pollution (untitled / blank-title 노드) 만들지 못하게.
 */

/**
 * vault frontmatter 의 title 으로 안전한 값인지 판정.
 * 비-string, undefined, null, 빈 문자열, 공백-only 모두 reject.
 *
 * 사용처: addConcept (필수 입력), patchConcept (frontmatter 에 title 포함 시).
 *
 * @param {unknown} value
 * @returns {value is string}
 */
export function isValidVaultTitle(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
