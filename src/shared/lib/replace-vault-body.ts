/**
 * 노드 md 의 frontmatter 블록은 그대로 두고 본문(prose)만 교체 —
 * `parseFrontmatter` 의 역방향.
 *
 * S4(문서 = 노드 설명): 온톨로지 노드의 본문이 곧 그 노드의 *설명*이다. 설명을
 * 편집해 저장할 때 frontmatter(slug/kind/domain/관계 키)를 손실 없이 보존해야
 * 한다. `applyFrontmatterUpdates` 가 본문을 보존하며 frontmatter 만 바꾸는 것과
 * 짝 — 이쪽은 frontmatter 를 보존하며 본문만 바꾼다.
 *
 * frontmatter 블록(`---\n...\n---`)이 없으면 전체가 본문 → 전체 교체.
 * 본문 앞뒤 공백은 정리하고 `---\n...\n---\n\n<body>\n` 형식으로 직렬화
 * (buildVaultMarkdown / applyFrontmatterUpdates 와 같은 구분자 규칙).
 */
export function replaceVaultBody(raw: string, nextBody: string): string {
  const body = nextBody.replace(/^\s+/, "").replace(/\s+$/, "");
  if (raw.startsWith("---")) {
    const end = raw.indexOf("\n---", 3);
    if (end !== -1) {
      // frontmatter 블록 = raw[0 .. end+4) = `---\n...\n---` (닫는 --- 포함).
      const frontmatter = raw.slice(0, end + 4);
      return body === "" ? `${frontmatter}\n` : `${frontmatter}\n\n${body}\n`;
    }
  }
  return body === "" ? "" : `${body}\n`;
}
