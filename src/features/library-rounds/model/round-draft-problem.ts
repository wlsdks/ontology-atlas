import type { RoundUndone } from '@/entities/library-round';
import { parseFrontmatter } from '@/shared/lib/vault-document/parse-frontmatter';

export type RoundDraftProblem = Pick<RoundUndone, 'reason' | 'key'>;

const FORBIDDEN_KEYS = new Set(['kind']);
/**
 * A page's links to concepts. Its writer adds them; a round only carries them as it found them
 * (`docs/records/decisions/2026-11-19-wiki-page-describes-at-any-status-afd11e09-c68a-465a-83fa-d8abd8cabdfc.md`).
 */
const LINK_KEYS = ['describes', 'relation_notes'] as const;

const normalized = (text: string) => text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');

function frontmatterKeys(text: string): { key: string; line: string }[] | null {
  const raw = normalized(text);
  const end = raw.startsWith('---') ? raw.indexOf('\n---', 3) : -1;
  if (end === -1) return null;
  const keys: { key: string; line: string }[] = [];
  for (const line of raw.slice(4, end).split('\n')) {
    if (/^\s*(-(\s|$)|#)/.test(line)) continue;
    const at = line.indexOf(':');
    const key = at < 0 ? '' : line.slice(0, at).trim().normalize('NFC').toLowerCase();
    if (key) keys.push({ key, line });
  }
  return keys;
}

/**
 * The link key a round added, changed or dropped against `before`, the page as the round found it
 * (`null` for a new page). Values are compared as parsed, so re-serialising the same links is not a
 * change; a link key spelled any other way is, since no reader would see it as the same key.
 */
function changedLinkKey(keys: { key: string; line: string }[], text: string, before: string | null): string | null {
  for (const { key, line } of keys) {
    if ((LINK_KEYS as readonly string[]).includes(key) && line.slice(0, line.indexOf(':')) !== key) return key;
  }
  const now = parseFrontmatter(normalized(text)).frontmatter;
  const was = before === null ? {} : parseFrontmatter(normalized(before)).frontmatter;
  for (const key of LINK_KEYS) {
    if (JSON.stringify(now[key]) !== JSON.stringify(was[key])) return key;
  }
  return null;
}

export function roundDraftProblem(text: string, before: string | null = null): RoundDraftProblem | null {
  const keys = frontmatterKeys(text);
  if (!keys) return { reason: 'no-frontmatter' };
  const seen = new Set<string>();
  let status: string | null = null;
  for (const { key, line } of keys) {
    if (seen.has(key)) return { reason: 'duplicate-key', key };
    seen.add(key);
    if (FORBIDDEN_KEYS.has(key)) return { reason: 'forbidden-key', key };
    if (key === 'status') status = line.trimEnd();
  }
  const link = changedLinkKey(keys, text, before);
  if (link) return { reason: 'forbidden-key', key: link };
  return status === 'status: draft' && parseFrontmatter(normalized(text)).frontmatter.status === 'draft' ? null : { reason: 'not-draft' };
}

export const declaresKind = (text: string) => frontmatterKeys(text)?.some(({ key }) => key === 'kind') ?? false;

