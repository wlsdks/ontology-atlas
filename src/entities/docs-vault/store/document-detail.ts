import { countWhitespaceWords } from '@/shared/lib/vault-document/count-whitespace-words';
import {
  buildExcerpt,
  extractHeadings,
  parseFrontmatter,
} from '@/shared/lib/vault-document/parse-frontmatter';
import type { VaultDoc, VaultHeading } from '../model/types';

/** What a surface shows about one document beyond the spine, read when the surface shows it. */
export interface VaultDocDetail {
  headings: VaultHeading[];
  excerpt: string;
  wordCount: number;
}

/** The document a detail is asked for: its file and the stamp of the version the page holds. */
export type DocumentRef = Pick<VaultDoc, 'slug' | 'path' | 'mtime'>;

/** Runs the extractors `buildMdEntry` runs, so a detail equals the manifest's inline fields. */
export function deriveDocumentDetail(raw: string): VaultDocDetail {
  const { body } = parseFrontmatter(raw);
  /* A fresh copy: a V8 substring keeps its whole parent alive, so a cached excerpt would pin its file. */
  return structuredClone({
    headings: extractHeadings(body),
    excerpt: buildExcerpt(body),
    wordCount: countWhitespaceWords(body),
  });
}
