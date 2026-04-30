import type { VaultDoc, VaultMode } from './types';

export interface RelationshipRadarSuggestion {
  doc: VaultDoc;
  score: number;
  linked: boolean;
  reasons: string[];
  sharedTags: string[];
}

interface RelationshipRadarOptions {
  audience?: VaultMode | 'all';
  limit?: number;
  dismissedSlugs?: Set<string>;
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'this',
  'that',
  '문서',
  '설계',
  '계획',
  '프로젝트',
]);

export function findRelationshipRadarSuggestions(
  docs: VaultDoc[],
  selectedSlug: string | null,
  options: RelationshipRadarOptions = {},
): RelationshipRadarSuggestion[] {
  if (!selectedSlug) return [];
  const selected = docs.find((doc) => doc.slug === selectedSlug);
  if (!selected) return [];

  const dismissed = options.dismissedSlugs ?? new Set<string>();
  const selectedTokens = tokenizeDoc(selected);
  const selectedProjects = extractProjectRefs(selected);
  const out: RelationshipRadarSuggestion[] = [];

  for (const candidate of docs) {
    if (candidate.slug === selected.slug || dismissed.has(candidate.slug)) continue;

    const reasons: string[] = [];
    let score = 0;
    const linked =
      selected.linksOut.includes(candidate.slug) ||
      candidate.linksOut.includes(selected.slug);

    if (linked) {
      score += 72;
      reasons.push('이미 연결됨');
    }

    const sharedTags = selected.tags.filter((tag) => candidate.tags.includes(tag));
    if (sharedTags.length > 0) {
      score += Math.min(36, sharedTags.length * 12);
      reasons.push(`공통 태그 ${sharedTags.length}`);
    }

    const candidateProjects = extractProjectRefs(candidate);
    const sharedProjects = [...selectedProjects].filter((project) =>
      candidateProjects.has(project),
    );
    if (sharedProjects.length > 0) {
      score += Math.min(40, sharedProjects.length * 20);
      reasons.push('같은 프로젝트');
    }

    const candidateTokens = tokenizeDoc(candidate);
    const sharedTokens = [...selectedTokens].filter((token) =>
      candidateTokens.has(token),
    );
    if (sharedTokens.length > 0) {
      score += Math.min(32, sharedTokens.length * 4);
      reasons.push(`공통 키워드 ${Math.min(sharedTokens.length, 8)}`);
    }

    if (
      options.audience &&
      options.audience !== 'all' &&
      (candidate.mode === options.audience || candidate.mode === 'both')
    ) {
      score += 8;
    }

    if (score > 0) {
      out.push({
        doc: candidate,
        score,
        linked,
        reasons,
        sharedTags,
      });
    }
  }

  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.linked !== b.linked) return a.linked ? -1 : 1;
    return a.doc.slug.localeCompare(b.doc.slug, 'ko');
  });
  return out.slice(0, options.limit ?? 5);
}

function tokenizeDoc(doc: VaultDoc): Set<string> {
  const raw = `${doc.title} ${doc.description ?? ''} ${doc.excerpt}`;
  const tokens = raw
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/g)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
  return new Set(tokens.slice(0, 80));
}

function extractProjectRefs(doc: VaultDoc): Set<string> {
  const out = new Set<string>();
  const raw = doc.frontmatter.projects ?? doc.frontmatter.project;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string' && item.trim()) out.add(item.trim());
    }
  } else if (typeof raw === 'string') {
    for (const item of raw.split(/\s*,\s*/)) {
      if (item) out.add(item);
    }
  }
  for (const link of doc.linksOut) {
    if (link.startsWith('project:')) out.add(link.slice('project:'.length));
    if (link.startsWith('projects/')) out.add(link.slice('projects/'.length));
  }
  return out;
}
