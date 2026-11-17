import { WIKI_DIR, WIKI_SOURCES_DIR } from '@/shared/lib/library/wiki-page-schema';
import { MAP_CONCEPT_KINDS } from '@/shared/lib/vault-folder/vault-shape';

export interface ResetCandidateDoc {
  path: string;
  frontmatter?: Record<string, unknown> | null;
}

/** `document` is authorable narrative; it leaves with the concepts it describes. */
const NARRATIVE_CONCEPT_KIND = 'document';

const KEPT_TOP_FOLDERS: ReadonlySet<string> = new Set([WIKI_DIR, WIKI_SOURCES_DIR, 'planning']);
const KEPT_ROOT_FILES: ReadonlySet<string> = new Set(['README.md', 'AGENTS.md', 'CLAUDE.md']);

function isKeptPath(path: string): boolean {
  const segments = path.split('/');
  if (segments.some((segment) => segment.startsWith('.'))) return true;
  if (segments.length === 1) return KEPT_ROOT_FILES.has(segments[0]!);
  return KEPT_TOP_FOLDERS.has(segments[0]!);
}

function isConceptKind(kind: unknown): boolean {
  if (typeof kind !== 'string') return false;
  const trimmed = kind.trim();
  return MAP_CONCEPT_KINDS.has(trimmed) || trimmed === NARRATIVE_CONCEPT_KIND;
}

/** The vault-relative paths a reset moves: authorable-kind Markdown outside the kept places. */
export function conceptDocumentPaths(docs: ReadonlyArray<ResetCandidateDoc>): string[] {
  return docs
    .filter((doc) => doc.path.endsWith('.md') && !isKeptPath(doc.path) && isConceptKind(doc.frontmatter?.kind))
    .map((doc) => doc.path);
}
