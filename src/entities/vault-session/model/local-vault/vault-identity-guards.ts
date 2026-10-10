import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import type { FrontmatterUpdateValue } from '@/entities/docs-vault';

/**
 * Thrown when the vault's `.md` changed outside the app and the user then saves from the GUI:
 * the guard against a silent overwrite. Same meaning as the MCP-side `VaultConflictError`.
 */
export class VaultConflictError extends Error {
  readonly slug: string;
  readonly expectedMtime: number;
  readonly currentMtime: number;
  constructor(slug: string, expectedMtime: number, currentMtime: number) {
    super(
      `Vault conflict — "${slug}" was modified externally between read and write.`,
    );
    this.name = 'VaultConflictError';
    this.slug = slug;
    this.expectedMtime = expectedMtime;
    this.currentMtime = currentMtime;
  }
}

export function assertExpectedMtime(
  slug: string,
  expectedMtime: number | undefined,
  currentMtime: number,
): void {
  if (typeof expectedMtime === 'number' && currentMtime !== expectedMtime) {
    throw new VaultConflictError(slug, expectedMtime, currentMtime);
  }
}

const NODE_UID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function identityClaims(frontmatter: Record<string, unknown>): string[] {
  return [
    ...(typeof frontmatter.uid === 'string' ? [frontmatter.uid] : []),
    ...(Array.isArray(frontmatter.merged_uids)
      ? frontmatter.merged_uids.filter((value): value is string => typeof value === 'string')
      : []),
  ];
}

export function assertNodeIdentityContent(
  slug: string,
  raw: string,
  docs: ReadonlyArray<{ slug: string; frontmatter: Record<string, unknown> }>,
): void {
  const frontmatter = parseFrontmatter(raw).frontmatter;
  if (typeof frontmatter.kind !== 'string' || !frontmatter.kind.trim()) return;
  if (typeof frontmatter.uid !== 'string' || !NODE_UID_RE.test(frontmatter.uid)) {
    throw new Error('Every kind node must have a lowercase UUIDv4 `uid:`.');
  }
  const merged = frontmatter.merged_uids;
  if (merged !== undefined) {
    if (
      !Array.isArray(merged) ||
      merged.some(
        (value) =>
          typeof value !== 'string' ||
          !NODE_UID_RE.test(value) ||
          value === frontmatter.uid,
      )
    ) {
      throw new Error('`merged_uids:` must contain only absorbed lowercase UUIDv4 identities.');
    }
    const canonical = [...new Set(merged)].sort((a, b) => a.localeCompare(b, 'en'));
    if (canonical.length !== merged.length || canonical.some((value, index) => value !== merged[index])) {
      throw new Error('`merged_uids:` must be a deduplicated, ascending canonical UUIDv4 set.');
    }
  }
  const claims = new Set(identityClaims(frontmatter));
  for (const doc of docs) {
    if (doc.slug === slug) continue;
    const collision = identityClaims(doc.frontmatter).find((uid) => claims.has(uid));
    if (collision) {
      throw new Error(`UID collision: ${collision} already belongs to "${doc.slug}".`);
    }
  }
}

/**
 * Identity-guard errors carry their variant in `name`; the editor localizes that name. The
 * English message is the fallback for logs and surfaces that do not localize.
 */
function identityError(name: 'VaultIdentityUidError' | 'VaultIdentityHistoryError', message: string): Error {
  return Object.assign(new Error(message), { name });
}

export function assertIdentityPatch(
  raw: string,
  updates: Record<string, FrontmatterUpdateValue>,
): void {
  const previous = parseFrontmatter(raw).frontmatter;
  if ('merged_uids' in updates) {
    throw identityError(
      'VaultIdentityHistoryError',
      '`merged_uids:` is merge-owned identity history and cannot be edited by a generic browser patch.',
    );
  }
  if (!('uid' in updates)) return;
  const nextUid = updates.uid;
  const previousUid = previous.uid;
  const hasPreviousUid = previousUid !== undefined && previousUid !== null && previousUid !== '';
  if (hasPreviousUid && nextUid !== previousUid) {
    throw identityError('VaultIdentityUidError', '`uid:` is immutable. Rename or reclassify the node without changing its UID.');
  }
  if (typeof nextUid !== 'string' || !NODE_UID_RE.test(nextUid)) {
    throw identityError('VaultIdentityUidError', '`uid:` must be a lowercase UUIDv4.');
  }
}

export function assertIdentityTransition(previousRaw: string, nextRaw: string): void {
  const previous = parseFrontmatter(previousRaw).frontmatter;
  const next = parseFrontmatter(nextRaw).frontmatter;
  const previousUid = previous.uid;
  if (
    previousUid !== undefined &&
    previousUid !== null &&
    previousUid !== '' &&
    next.uid !== previousUid
  ) {
    throw identityError('VaultIdentityUidError', '`uid:` is immutable. Rename or reclassify the node without changing its UID.');
  }
  if (JSON.stringify(next.merged_uids) !== JSON.stringify(previous.merged_uids)) {
    throw identityError(
      'VaultIdentityHistoryError',
      '`merged_uids:` is merge-owned identity history and cannot be edited by a generic browser save.',
    );
  }
}
