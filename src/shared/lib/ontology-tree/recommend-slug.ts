/**
 * title → kebab-case slug 추천. frontmatter `id` 키 + 노드 canonical id 후보.
 *
 * 규칙:
 *   - 한글은 음역 X. lower-case 후 그대로 보존 (한글 slug 도 valid).
 *   - 영문 + 숫자 + 한글 + `-` 만 남김. 그 외 (특수문자, 공백) → `-`.
 *   - 연속 `-` 압축 → 단일 `-`.
 *   - 양 끝 `-` trim.
 *   - 빈 문자열 / 전부 invalid → 빈 문자열.
 *
 * frontmatter id 정규식 (`^[a-z0-9]+(-[a-z0-9]+)*$`) 와 다른 점: 한글 허용. UI 가
 * 추천만 하고 사용자가 override 가능 — 한글 그대로 쓰거나 영문으로 바꾸거나 선택.
 */
export function recommendDocumentSlug(title: string): string {
  if (!title) return "";
  const lower = title.trim().toLowerCase();
  if (lower === "") return "";

  // 영문 / 숫자 / 한글 (가-힣) / `-` 외 모두 `-` 로.
  const replaced = lower.replace(/[^a-z0-9가-힣-]+/g, "-");
  // 연속 `-` 압축.
  const collapsed = replaced.replace(/-+/g, "-");
  // 양 끝 `-` trim.
  return collapsed.replace(/^-+|-+$/g, "");
}
