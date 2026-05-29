/**
 * 온톨로지 노드를 vault `.md` 문자열로 직렬화 — `parseFrontmatter` 의 역방향.
 *
 * 원래 `src/views/ontology-edit/ui/OntologyEditPage.tsx` 안에 있던 빌더 전용
 * 함수를 S1.0(ontology-first/topology-as-ontology 재구성)에서 entity 레이어로
 * 추출. 토폴로지(`views/home`)·빌더(`views/ontology-edit`) 양쪽이 cross-view
 * import 없이 같은 직렬화를 재사용하기 위함. 동작은 추출 전과 동일하게 유지
 * (slug·kind·title frontmatter + `# title` 본문) — 풍부한 frontmatter(domain,
 * 관계 키)·기존 본문 보존이 필요한 *기존 노드 편집*은 별도 patch 경로가 담당.
 */
export function buildVaultMarkdown(args: {
  kind: string;
  title: string;
  slug: string;
}): string {
  const lines = ["---"];
  lines.push(`slug: ${args.slug}`);
  lines.push(`kind: ${args.kind}`);
  // title 에 콜론 / 따옴표 들어갈 수 있으니 안전하게 quote.
  const safeTitle =
    /[:#\[\]{}"',&|*!%@`]/.test(args.title)
      ? `"${args.title.replace(/"/g, '\\"')}"`
      : args.title;
  lines.push(`title: ${safeTitle}`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${args.title}`);
  lines.push("");
  return lines.join("\n");
}
