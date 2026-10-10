import {
  computeRenameRefContext,
  planReferrerRewrite,
  type FrontmatterUpdateValue,
  type ReferrerListKept,
  type ReferrerListMove,
} from '@/entities/docs-vault';
import { verifyHandlePermission } from '@/entities/local-fs-handle';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';

/** What a move or a kind change did to one document that names the moved one. */
interface ReferrerRewriteOutcome {
  slug: string;
  /** Entries that followed the document into the list for its new kind. */
  moved: ReferrerListMove[];
  /** Entries left in their list: this referrer's kind keeps no list for the new kind. */
  kept: ReferrerListKept[];
  /**
   * The bytes this referrer needed could not be written — write permission was refused or the
   * write failed — so the file on disk is as it was and `moved` did not happen.
   */
  failed: boolean;
}

export interface ReferrerRewriteReport {
  /** Referrers that were rewritten, kept an entry, or could not be written. In folder order. */
  referrers: ReferrerRewriteOutcome[];
}

export const EMPTY_REFERRER_REPORT: ReferrerRewriteReport = { referrers: [] };

/**
 * The referrer pass shared by a move (`renameDoc`) and a kind change in place
 * (`reclassifyDoc`): every document naming `oldSlug` is rewritten by
 * `planReferrerRewrite`, and what that did is returned for the confirmation to name.
 *
 * Every document is read (reads are free) and only one whose bytes change asks for write
 * permission. A document that cannot be read is skipped, as before: nothing is known about it.
 * One whose rewrite is refused or fails is reported rather than dropped — the old loop swallowed
 * both, and the screen then said nothing about a document still pointing at the old address.
 */
export async function rewriteReferrerFiles(args: {
  docs: ReadonlyArray<{ slug: string }>;
  fileHandles: ReadonlyMap<string, FileSystemFileHandle>;
  oldSlug: string;
  newSlug: string;
  /** Only when the change moves the document to another kind. */
  newKind?: string;
  markSelfWrite: (slug: string) => void;
}): Promise<ReferrerRewriteReport> {
  const { docs, fileHandles, oldSlug, newSlug, newKind, markSelfWrite } = args;
  const { canRewriteTail } = computeRenameRefContext(
    docs.map((d) => d.slug),
    oldSlug,
  );
  const referrers: ReferrerRewriteOutcome[] = [];
  for (const doc of docs) {
    if (doc.slug === oldSlug || doc.slug === newSlug) continue;
    const fh = fileHandles.get(doc.slug);
    if (!fh) continue;
    let srcText: string;
    try {
      srcText = await (await fh.getFile()).text();
    } catch {
      continue;
    }
    const plan = planReferrerRewrite(srcText, {
      oldSlug,
      newSlug,
      referrerSlug: doc.slug,
      canRewriteTail,
      newKind,
    });
    const changed = plan.text !== srcText;
    if (!changed && plan.kept.length === 0) continue;
    const outcome: ReferrerRewriteOutcome = {
      slug: doc.slug,
      moved: plan.moved,
      kept: plan.kept,
      failed: false,
    };
    if (changed) {
      try {
        const perm = await verifyHandlePermission(fh, 'readwrite', { ask: true });
        if (perm !== 'granted') throw new Error('write permission refused');
        const w = await fh.createWritable();
        await w.write(plan.text);
        await w.close();
        markSelfWrite(doc.slug);
      } catch {
        outcome.failed = true;
        outcome.moved = [];
      }
    }
    referrers.push(outcome);
  }
  return { referrers };
}

/** The `kind:` a patch gives a document that already had another one — null when it does not. */
export function kindChangeOf(raw: string, updates: Record<string, FrontmatterUpdateValue> | undefined): string | null {
  const nextKind = typeof updates?.kind === 'string' ? updates.kind.trim() : '';
  if (!nextKind) return null;
  const { frontmatter } = parseFrontmatter(raw);
  const currentKind = typeof frontmatter.kind === 'string' ? frontmatter.kind.trim() : '';
  return currentKind && currentKind !== nextKind ? nextKind : null;
}
