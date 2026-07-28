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
import {
  normalizeVaultSource,
  readVaultSourceShape,
  restoreVaultSourceShape,
} from "./parse-frontmatter";

export function replaceVaultBody(source: string, nextBody: string): string {
  // BOM 이 붙어 있으면 `raw.startsWith("---")` 가 false 가 되어 **frontmatter
  // 블록이 통째로 사라진 파일**이 저장된다(관계·kind 전부 소실). 파서가
  // 2026-07-28 에 BOM/CRLF 를 읽게 되면서 그 문서가 실제로 노드가 됐고, 그래서
  // 이 경로가 처음으로 도달 가능해졌다.
  //
  // 원래 파일이 쓰던 줄바꿈·BOM 은 **그대로 되돌린다** — 읽기 편의 때문에 남의
  // 파일 전체를 diff 로 만들지 않는다.
  const shape = readVaultSourceShape(source);
  const raw = normalizeVaultSource(source);
  const body = nextBody.replace(/^\s+/, "").replace(/\s+$/, "");
  const emit = (text: string) => restoreVaultSourceShape(text, shape);
  if (raw.startsWith("---")) {
    const end = raw.indexOf("\n---", 3);
    if (end !== -1) {
      // frontmatter 블록 = raw[0 .. end+4) = `---\n...\n---` (닫는 --- 포함).
      const frontmatter = raw.slice(0, end + 4);
      return emit(body === "" ? `${frontmatter}\n` : `${frontmatter}\n\n${body}\n`);
    }
  }
  return body === "" ? "" : emit(`${body}\n`);
}
