import type { VaultDoc } from '../model/types';

export interface RelatedDocMatch {
  doc: VaultDoc;
  score: number;
  reasons: string[];
}

interface MatchInput {
  projectSlug: string;
  /** The project's real name (e.g. "Demo Reactor"), used for title and body matching. */
  projectName?: string;
  /** Hub/container identifiers. Usually the same as projectSlug, but a hub can differ. */
  aliases?: string[];
}

/**
 * The top N documents in the vault most related to a project.
 *
 * Signals, strongest to weakest:
 *  1. frontmatter `projects: [slug]` contains it exactly — 100
 *  2. body wikilink `[[project:slug]]` (folded into linksOut as `project:slug`) — 60
 *  3. body mentions the `/project/{slug}` path — 40
 *  4. title contains projectName exactly — 25
 *  5. tag equals projectSlug — 15
 *  6. excerpt contains projectName — 10
 *
 * Sorted by score descending, ties by slug. Scores of zero or less are dropped.
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
    // 1. frontmatter `projects` — a string or a string array.
    const fmProjects = extractProjectList(d.frontmatter);
    for (const p of fmProjects) {
      if (aliasesLc.includes(p.toLowerCase())) {
        score += 100;
        reasons.push('frontmatter.projects');
        break;
      }
    }
    for (const alias of aliases) {
      if (d.linksOut.includes(`project:${alias}`)) {
        score += 60;
        reasons.push('wikilink');
        break;
      }
    }
    for (const alias of aliases) {
      if (d.excerpt.includes(`/project/${alias}`)) {
        score += 40;
        reasons.push('project-url');
        break;
      }
    }
    if (nameLc && d.title.toLowerCase().includes(nameLc)) {
      score += 25;
      reasons.push('title');
    }
    if (nameLc && d.excerpt.toLowerCase().includes(nameLc)) {
      score += 10;
      reasons.push('excerpt');
    }
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
