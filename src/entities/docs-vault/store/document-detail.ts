import { countWhitespaceWords } from '@/shared/lib/vault-document/count-whitespace-words';
import {
  buildExcerpt,
  extractHeadings,
  parseFrontmatter,
} from '@/shared/lib/vault-document/parse-frontmatter';
import type { VaultDoc, VaultHeading } from '../model/vault-manifest';

export interface VaultDocDetail {
  headings: VaultHeading[];
  excerpt: string;
  wordCount: number;
}

export type DocumentRef = Pick<VaultDoc, 'slug' | 'path' | 'mtime'>;

export function deriveDocumentDetail(raw: string): VaultDocDetail {
  const { body } = parseFrontmatter(raw);
  /* A fresh copy: a V8 substring keeps its whole parent alive, so a cached excerpt would pin its file. */
  return structuredClone({
    headings: extractHeadings(body),
    excerpt: buildExcerpt(body),
    wordCount: countWhitespaceWords(body),
  });
}
