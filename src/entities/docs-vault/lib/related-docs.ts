import type { VaultDoc } from '../model/types';

export interface RelatedDocMatch {
  doc: VaultDoc;
  score: number;
  reasons: string[];
}

interface MatchInput {
  projectSlug: string;
  /** 프로젝트의 실제 이름 (예: "Arc Reactor"). 제목/본문 matching 에 사용. */
  projectName?: string;
  /** 허브/컨테이너 식별 (예: "reactor"). 보통 projectSlug 와 같지만 hub 는 별도일 수 있음. */
  aliases?: string[];
}

/**
 * vault 전체 문서에서 주어진 프로젝트와 관련도 높은 문서 top N 을 반환.
 *
 * 매칭 신호 (강 → 약):
 *  1. 프론트매터 `projects: [slug]` 에 정확히 포함 — 100 점
 *  2. 본문 wikilink `[[project:slug]]` (linksOut 에 `project:slug` 로 편입돼 있음) — 60 점
 *  3. 본문에 `/project/{slug}` 경로 언급 — 40 점
 *  4. 제목에 projectName 정확 포함 — 25 점
 *  5. excerpt 에 projectName 포함 — 10 점
 *  6. 태그에 projectSlug 동일 — 15 점
 *
 * 최종 score 내림차순, 동점이면 slug 알파벳. 점수 0 이하는 제외.
 */
export function findRelatedDocs(
  docs: VaultDoc[],
  input: MatchInput,
  limit = 5,
): RelatedDocMatch[] {
  const slug = input.projectSlug;
  const name = input.projectName;
  const aliases = [slug, ...(input.aliases ?? [])];
  const aliasesLc = aliases.map((a) => a.toLowerCase());
  const nameLc = name?.toLowerCase();
  const out: RelatedDocMatch[] = [];
  for (const d of docs) {
    const reasons: string[] = [];
    let score = 0;
    // 1. frontmatter projects 배열 — v5 이후 확장 필드. 문자열 또는 문자열[].
    const fmProjects = extractProjectList(d.frontmatter);
    for (const p of fmProjects) {
      if (aliasesLc.includes(p.toLowerCase())) {
        score += 100;
        reasons.push('frontmatter.projects');
        break;
      }
    }
    // 2. linksOut 에 project:{alias} 포함
    for (const alias of aliases) {
      if (d.linksOut.includes(`project:${alias}`)) {
        score += 60;
        reasons.push('wikilink');
        break;
      }
    }
    // 3. 본문 excerpt 에 /project/{slug}
    for (const alias of aliases) {
      if (d.excerpt.includes(`/project/${alias}`)) {
        score += 40;
        reasons.push('project-url');
        break;
      }
    }
    // 4. 제목 정확 포함
    if (nameLc && d.title.toLowerCase().includes(nameLc)) {
      score += 25;
      reasons.push('title');
    }
    // 5. excerpt 에 projectName
    if (nameLc && d.excerpt.toLowerCase().includes(nameLc)) {
      score += 10;
      reasons.push('excerpt');
    }
    // 6. 태그
    for (const tag of d.tags) {
      if (aliasesLc.includes(tag.toLowerCase())) {
        score += 15;
        reasons.push('tag');
        break;
      }
    }
    if (score > 0) {
      out.push({ doc: d, score, reasons });
    }
  }
  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.doc.slug.localeCompare(b.doc.slug, 'ko');
  });
  return out.slice(0, limit);
}

function extractProjectList(fm: Record<string, unknown>): string[] {
  const raw = fm.projects ?? fm.project;
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === 'string');
  }
  if (typeof raw === 'string') {
    return raw.split(/\s*,\s*/).filter(Boolean);
  }
  return [];
}
