/**
 * 온톨로지 노드를 vault `.md` 문자열로 직렬화 — `parseFrontmatter` 의 역방향.
 *
 * 원래 은퇴한 ERD 빌더(구 `src/views/ontology-edit`) 안에 있던 직렬화 함수를
 * S1.0(ontology-first/topology-as-ontology 재구성)에서 entity 레이어로 추출.
 * 여러 view 가 cross-view import 없이 같은 vault `.md` 직렬화를 재사용하기
 * 위함(현재는 docs-vault·스튜디오 쓰기 경로). 동작은 추출 전과 동일하게 유지
 * (slug·kind·title frontmatter + `# title` 본문) — 풍부한 frontmatter(domain,
 * 관계 키)·기존 본문 보존이 필요한 *기존 노드 편집*은 별도 patch 경로가 담당.
 */

import { slugify } from "@/shared/lib/slugify";

function quoteYamlScalar(v: string): string {
  // 콜론 / 따옴표 등 YAML 특수문자가 있으면 안전하게 quote + escape.
  return /[:#\[\]{}"',&|*!%@`]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}

export function buildVaultMarkdown(args: {
  kind: string;
  title: string;
  slug: string;
  /** capability/element 처럼 부모 도메인이 있는 노드의 `domain:` 키. 생략 시
   *  emit 안 함 — 추출 전(빌더)과 byte-identical 출력 보장. */
  domain?: string;
  /**
   * 어권별 표시 이름 (소유자 지시 2026-07-24) — `{ ko: "결제", en: "Payments" }`
   * → `display_ko:` / `display_en:` 키. 생략하면 emit 안 함(기존 출력 불변).
   * `title` 은 검색/매칭의 단일 진실원이라 그대로 둔다.
   */
  localeLabels?: Record<string, string>;
}): string {
  const lines = ["---"];
  lines.push(`slug: ${args.slug}`);
  lines.push(`kind: ${args.kind}`);
  const domain = args.domain?.trim();
  if (domain) lines.push(`domain: ${quoteYamlScalar(domain)}`);
  lines.push(`title: ${quoteYamlScalar(args.title)}`);
  for (const [locale, value] of Object.entries(args.localeLabels ?? {})) {
    if (!/^[a-z]{2}$/.test(locale)) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    lines.push(`display_${locale}: ${quoteYamlScalar(trimmed)}`);
  }
  lines.push("---");
  lines.push("");
  lines.push(`# ${args.title}`);
  lines.push("");
  return lines.join("\n");
}

/**
 * kind → vault 폴더(복수형). dogfood vault 와 빌더 저장 경로 규칙을 단일화 —
 * capability→capabilities, element→elements, domain→domains, project→projects,
 * 그 외는 `${kind}s`.
 */
export function vaultFolderForKind(kind: string): string {
  switch (kind) {
    case "capability":
      return "capabilities";
    case "element":
      return "elements";
    case "domain":
      return "domains";
    case "project":
      return "projects";
    default:
      return `${kind}s`;
  }
}

/**
 * 새 온톨로지 노드의 vault 문서(slug + markdown)를 만든다 — S2(토폴로지에서
 * 노드 생성)의 순수 모델. slug = `${폴더}/${slugify(title)}`. title 이 비거나
 * slug 로 환원 불가하면 throw. createDoc(slug, markdown) 으로 디스크에 쓴다.
 */
export function buildNewNodeDoc(args: {
  title: string;
  kind: string;
  domain?: string;
  localeLabels?: Record<string, string>;
}): { slug: string; markdown: string } {
  const title = args.title.trim();
  if (!title) throw new Error("title must not be empty");
  const tail = slugify(title);
  if (!tail) throw new Error("title produced an empty slug");
  const slug = `${vaultFolderForKind(args.kind)}/${tail}`;
  const markdown = buildVaultMarkdown({
    kind: args.kind,
    title,
    slug,
    domain: args.domain,
    localeLabels: args.localeLabels,
  });
  return { slug, markdown };
}
