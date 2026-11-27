import {
  computeRenameRefContext,
  planReferrerRewrite,
  type FrontmatterUpdateValue,
  type ReferrerListKept,
  type ReferrerListMove,
} from '@/entities/docs-vault';
import { verifyHandlePermission } from '@/entities/local-fs-handle';
import { failureCodeOf } from '@/shared/lib/failures/failure-code';
import { parseFrontmatter } from '@/shared/lib/vault-document/parse-frontmatter';
import { readStrictUtf8Text } from '@/shared/lib/vault-folder/strict-utf8-text';

/** What a move or a kind change did to one document that names the moved one. */
interface ReferrerRewriteOutcome {
  slug: string;
  moved: ReferrerListMove[];
  kept: ReferrerListKept[];
  /** Its rewrite was refused or failed to write; the file on disk is unchanged. */
  failed: boolean;
}

export interface ReferrerRewriteReport {
  referrers: ReferrerRewriteOutcome[];
}

export const EMPTY_REFERRER_REPORT: ReferrerRewriteReport = { referrers: [] };

/**
 * The referrer pass shared by `renameDoc` and `reclassifyDoc`: every document naming `oldSlug`
 * is rewritten by `planReferrerRewrite`. Only a document whose bytes change asks for write
 * permission; an unreadable one is skipped, a refused or failed rewrite is reported. A document
 * that is not UTF-8 is never rewritten, since its text would replace the bytes it cannot decode:
 * when it names the moved one, it is reported as failed.
 */
export async function rewriteReferrerFiles(args: {
  docs: ReadonlyArray<{ slug: string }>;
  fileHandles: ReadonlyMap<string, FileSystemFileHandle>;
  oldSlug: string;
  newSlug: string;
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
    let writable = true;
    try {
      const file = await fh.getFile();
      srcText = await readStrictUtf8Text(file, `${doc.slug}.md`).catch(async (error: unknown) => {
        if (failureCodeOf(error) !== 'not-utf8') throw error;
        writable = false;
        return file.text();
      });
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
      moved: writable ? plan.moved : [],
      kept: plan.kept,
      failed: !writable && changed,
    };
    if (changed && writable) {
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

export function kindChangeOf(raw: string, updates: Record<string, FrontmatterUpdateValue> | undefined): string | null {
  const nextKind = typeof updates?.kind === 'string' ? updates.kind.trim() : '';
  if (!nextKind) return null;
  const { frontmatter } = parseFrontmatter(raw);
  const currentKind = typeof frontmatter.kind === 'string' ? frontmatter.kind.trim() : '';
  return currentKind && currentKind !== nextKind ? nextKind : null;
}
