'use client';

import { filesForClient, type AgentClientId } from '../../lib/agent-clients';
import type { VaultShape } from '@/shared/lib/vault-shape';
import { useCallback, useRef, useState } from 'react';
import {
  applyFrontmatterUpdates,
  rewriteMovedDocSelf,
  type FrontmatterUpdateValue,
} from '@/entities/docs-vault';
import { verifyHandlePermission } from '@/entities/local-fs-handle';
import {
  VaultConflictError,
  assertExpectedMtime,
  assertIdentityPatch,
  assertIdentityTransition,
  assertNodeIdentityContent,
} from './vault-identity-guards';
import {
  EMPTY_REFERRER_REPORT,
  kindChangeOf,
  rewriteReferrerFiles,
  type ReferrerRewriteReport,
} from './referrer-rewrite';
import { resolveBundledLaunch, writeAgentConfigFiles } from './vault-sidecars';
import { FULL_STARTER_SHAPE, writeVaultStarter } from './vault-starter';
import type { VaultSessionCore } from './vault-state';

export function useVaultDocWrites(
  { setState, stateRef, load }: VaultSessionCore,
  openFolderHandle: FileSystemDirectoryHandle | null,
) {
  /**
   * Secures readwrite permission before any write. On refusal the state moves to
   * 'permission-needed' so the picker's reauth UI appears immediately; previously
   * `saveDoc` only threw while the state stayed 'loaded', leaving a user who went to the
   * picker unaware it was a permission problem. It still throws afterwards, so the caller's
   * try/catch keeps showing the inline error.
   */
  const requireWritePermission = useCallback(
    async (handle: FileSystemDirectoryHandle | FileSystemFileHandle) => {
      const result = await verifyHandlePermission(handle, 'readwrite', { ask: true });
      if (result !== 'granted') {
        setState((s) => ({ ...s, status: 'permission-needed' }));
        throw new Error('Write permission denied');
      }
    },
    [setState],
  );

  /**
   * Walks a slash path from the root handle (creating as requested) and returns the parent
   * directory handle plus the file name: `foo/bar/baz` → dir = root/foo/bar, name = baz.md.
   */
  const getParentAndName = useCallback(
    async (
      root: FileSystemDirectoryHandle | null,
      slug: string,
      createIntermediate: boolean,
    ): Promise<{
      parent: FileSystemDirectoryHandle;
      fileName: string;
    } | null> => {
      if (!root) return null;
      // Readwrite permission, secured here because this runs only on write paths.
      await requireWritePermission(root);
      const parts = slug.split('/').filter(Boolean);
      if (parts.length === 0) throw new Error('Empty slug');
      const fileName = `${parts[parts.length - 1]}.md`;
      let parent: FileSystemDirectoryHandle = root;
      for (let i = 0; i < parts.length - 1; i += 1) {
        parent = await parent.getDirectoryHandle(parts[i], {
          create: createIntermediate,
        });
      }
      return { parent, fileName };
    },
    [requireWritePermission],
  );

  const openState = useCallback(() => {
    const live = stateRef.current;
    if (live.handle !== openFolderHandle) throw new Error('The folder this action was made for is no longer open');
    if (!live.manifest || live.manifestHandle !== live.handle) throw new Error('The folder is still being read');
    return live;
  }, [stateRef, openFolderHandle]);
  const reloadIfOpen = useCallback(
    async (handle: FileSystemDirectoryHandle | null) => {
      if (handle && stateRef.current.handle === handle) await load(handle);
    },
    [stateRef, load],
  );

  /**
   * Rewrites one slug's markdown file, requesting readwrite permission first when needed, and
   * rescans the manifest on success.
   *
   * `options.expectedMtime` (the manifest's `doc.mtime`) is compared against the filesystem's
   * `file.lastModified` immediately before the write and throws `VaultConflictError` on an
   * outside change. Omitted, the check is skipped, keeping existing callers working.
   */
  // Slugs the app itself just wrote, so the polling diff toaster does not report its own
  // writes as "added/edited" (the four-toast burst during bootstrap). A one-shot ledger
  // cleared on consumption: only outside changes (an agent, an IDE) become toasts.
  const selfWrittenSlugsRef = useRef<Set<string>>(new Set());
  // The only real data source behind the "last edited · me" fact. Unlike
  // `selfWrittenSlugsRef` this is not cleared on consumption (slug → last self-write time in
  // ms). An mtime alone cannot say *who* changed a file — a git checkout, another editor, or
  // an agent session without a heartbeat all change it — so this records only that this
  // session actually wrote the slug through the local vault write API, and marks "me" for
  // that trustworthy subset only. No guessing.
  const [selfEditTimestamps, setSelfEditTimestamps] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  const markSelfWrite = useCallback((slug: string) => {
    selfWrittenSlugsRef.current.add(slug);
    setSelfEditTimestamps((prev) => {
      const next = new Map(prev);
      next.set(slug, Date.now());
      return next;
    });
  }, []);
  const unmarkSelfWrite = useCallback((slug: string) => {
    selfWrittenSlugsRef.current.delete(slug);
    setSelfEditTimestamps((prev) => {
      if (!prev.has(slug)) return prev;
      const next = new Map(prev);
      next.delete(slug);
      return next;
    });
  }, []);
  const consumeSelfWrittenSlugs = useCallback((observedSlugs: ReadonlySet<string>): ReadonlySet<string> => {
    const consumed = new Set<string>();
    for (const slug of observedSlugs) {
      if (!selfWrittenSlugsRef.current.delete(slug)) continue;
      consumed.add(slug);
    }
    return consumed;
  }, []);
  /*
   * **A refused save has already told the person about the outside change** (2026-09-26,
   * map-edit QA D5). A save refused as a conflict raises the one message the person needs:
   * the file changed elsewhere, refresh and save again. The watcher then picks the same
   * outside write up a moment later and reported it again as a green «Capability edited»
   * notice, which took the front of the stack and pushed the refusal behind it — read right
   * after pressing Save, it looks like the save landed.
   *
   * So a refusal records **which change it reported**: the slug and the modification time
   * the disk showed at that moment. The diff toaster drops a modification only when it
   * observes that same slug at that same time (`consumeReportedConflicts`); a later outside
   * edit carries a newer time and is reported as usual. Observing the slug at any time
   * clears the record, so nothing lingers to swallow a notice that is owed.
   */
  const reportedConflictsRef = useRef<Map<string, number>>(new Map());
  const guardExpectedMtime = useCallback(
    (slug: string, expectedMtime: number | undefined, currentMtime: number) => {
      try {
        assertExpectedMtime(slug, expectedMtime, currentMtime);
      } catch (error) {
        if (error instanceof VaultConflictError) {
          reportedConflictsRef.current.set(error.slug, error.currentMtime);
        }
        throw error;
      }
    },
    [],
  );
  const consumeReportedConflicts = useCallback(
    (observed: ReadonlyMap<string, number | null>): ReadonlySet<string> => {
      const reported = new Set<string>();
      for (const [slug, mtime] of observed) {
        const conflictMtime = reportedConflictsRef.current.get(slug);
        if (conflictMtime === undefined) continue;
        reportedConflictsRef.current.delete(slug);
        if (conflictMtime === mtime) reported.add(slug);
      }
      return reported;
    },
    [],
  );

  const saveDoc = useCallback(
    async (
      slug: string,
      content: string,
      options: { expectedMtime?: number } = {},
    ) => {
      const live = openState();
      const fh = live.fileHandles.get(slug);
      if (!fh) throw new Error(`Local vault: no file handle for "${slug}"`);
      await requireWritePermission(fh);
      const file = await fh.getFile();
      guardExpectedMtime(slug, options.expectedMtime, file.lastModified);
      assertIdentityTransition(await file.text(), content);
      assertNodeIdentityContent(slug, content, live.manifest?.docs ?? []);
      const writable = await fh.createWritable();
      await writable.write(content);
      await writable.close();
      markSelfWrite(slug);
      // Rescan the whole manifest after a successful save so backlinks and headings follow.
      await reloadIfOpen(live.handle);
    },
    [openState, reloadIfOpen, requireWritePermission, markSelfWrite, guardExpectedMtime],
  );

  /**
   * Creates a new `.md` at the slug path, erroring when one already exists. Intermediate
   * directories are created, and the template content seeds the body.
   */
  const createDoc = useCallback(
    async (slug: string, content: string, opts: { skipRefresh?: boolean } = {}) => {
      const live = openState();
      if (live.fileHandles.has(slug)) {
        throw new Error(`Document already exists: "${slug}"`);
      }
      assertNodeIdentityContent(slug, content, live.manifest?.docs ?? []);
      const resolved = await getParentAndName(live.handle, slug, true);
      if (!resolved) throw new Error('Vault is not open');
      try {
        await resolved.parent.getFileHandle(resolved.fileName);
        throw new Error(`Document already exists: "${slug}"`);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Document already exists:')) {
          throw error;
        }
        if (!(error instanceof Error) || error.name !== 'NotFoundError') {
          throw error;
        }
      }
      const fh = await resolved.parent.getFileHandle(resolved.fileName, {
        create: true,
      });
      const writable = await fh.createWritable();
      await writable.write(content);
      await writable.close();
      markSelfWrite(slug);
      // `opts.skipRefresh` lets a caller that creates several documents in a row (bootstrap)
      // reload only on the last write — same contract as `updateFrontmatter`.
      if (!opts.skipRefresh) await reloadIfOpen(live.handle);
    },
    [openState, getParentAndName, reloadIfOpen, markSelfWrite],
  );

  /**
   * Deletes the file for a slug from local disk. Intermediate directories are deliberately
   * left in place even when empty, since other files may land there.
   *
   * `options.expectedMtime` is the same guard as `saveDoc`'s: the person confirmed deleting
   * the version they were shown, so a file an agent or an editor changed since then is
   * refused rather than removed along with that change (MCP `delete_concept` takes the
   * same `expected_mtime`).
   */
  const deleteDoc = useCallback(
    async (slug: string, options: { expectedMtime?: number } = {}) => {
      const live = openState();
      if (typeof options.expectedMtime === 'number') {
        const fh = live.fileHandles.get(slug);
        if (!fh) throw new Error(`Local vault: no file handle for "${slug}"`);
        const file = await fh.getFile();
        guardExpectedMtime(slug, options.expectedMtime, file.lastModified);
      }
      const resolved = await getParentAndName(live.handle, slug, false);
      if (!resolved) throw new Error('Vault is not open');
      await resolved.parent.removeEntry(resolved.fileName);
      await reloadIfOpen(live.handle);
    },
    [openState, getParentAndName, reloadIfOpen, guardExpectedMtime],
  );

  /**
   * Updates only some frontmatter keys of a slug's markdown file, preserving the body. Works
   * on our simple frontmatter rules (one `key: value` line, plus inline arrays like
   * `tags`/`projects`); nested objects beyond one level are unsupported.
   *
   * An existing key is replaced, a new one is appended to the end of the frontmatter, and a
   * null value deletes the key.
   *
   * Atomicity is the same path as `saveDoc` (`createWritable` → write). `opts.skipRefresh`
   * skips the refresh so a run of calls does not cause scroll jumps and flicker, and
   * `opts.expectedMtime` is the same conflict guard as `saveDoc`.
   *
   * `opts.rewriteBacklinks` is `reclassifyDoc`'s: see there.
   */
  const writeFrontmatterPatch = useCallback(
    async (
      slug: string,
      updates: Record<string, FrontmatterUpdateValue>,
      opts: { skipRefresh?: boolean; expectedMtime?: number; rewriteBacklinks?: boolean } = {},
    ): Promise<ReferrerRewriteReport> => {
      const live = openState();
      const fh = live.fileHandles.get(slug);
      if (!fh) throw new Error(`Local vault: no file handle for "${slug}"`);
      await requireWritePermission(fh);
      const file = await fh.getFile();
      guardExpectedMtime(slug, opts.expectedMtime, file.lastModified);
      const raw = await file.text();
      assertIdentityPatch(raw, updates);
      const next = applyFrontmatterUpdates(raw, updates);
      assertNodeIdentityContent(slug, next, live.manifest?.docs ?? []);
      if (next === raw) return EMPTY_REFERRER_REPORT; // nothing changed
      const newKind = opts.rewriteBacklinks ? kindChangeOf(raw, updates) : null;
      const writable = await fh.createWritable();
      await writable.write(next);
      await writable.close();
      markSelfWrite(slug);
      const report =
        newKind && live.manifest
          ? await rewriteReferrerFiles({
              docs: live.manifest.docs,
              fileHandles: live.fileHandles,
              oldSlug: slug,
              newSlug: slug,
              newKind,
              markSelfWrite,
            })
          : EMPTY_REFERRER_REPORT;
      if (!opts.skipRefresh) await reloadIfOpen(live.handle);
      return report;
    },
    [openState, reloadIfOpen, requireWritePermission, markSelfWrite, guardExpectedMtime],
  );

  const updateFrontmatter = useCallback(
    async (
      slug: string,
      updates: Record<string, FrontmatterUpdateValue>,
      opts: { skipRefresh?: boolean; expectedMtime?: number } = {},
    ): Promise<void> => {
      await writeFrontmatterPatch(slug, updates, opts);
    },
    [writeFrontmatterPatch],
  );

  /**
   * A person changing a document's kind where it stands — the quick patch, when the file is not
   * filed in its old kind's folder, so nothing moves (`renameDoc` does the moving case).
   *
   * The patch is written exactly as `updateFrontmatter` writes it; then, when it changes an
   * existing `kind:`, every document that lists this one under the list for its old kind moves
   * the entry to the list for the new one (`planReferrerRewrite`, 2026-09-26 map-edit review),
   * and the returned report says what each referrer got.
   */
  const reclassifyDoc = useCallback(
    (
      slug: string,
      updates: Record<string, FrontmatterUpdateValue>,
      opts: { expectedMtime?: number } = {},
    ): Promise<ReferrerRewriteReport> =>
      writeFrontmatterPatch(slug, updates, { ...opts, rewriteBacklinks: true }),
    [writeFrontmatterPatch],
  );

  /**
   * Changes a slug path inside the local vault (rename or move): read the existing content,
   * create at the new location, and remove the original on success. Identical slugs are a no-op.
   *
   * With `rewriteBacklinks=true`, references to `oldSlug` in other markdown bodies
   * (`[[oldSlug]]`, `[text](...oldSlug.md)`) are rewritten to `newSlug`. Best effort — a
   * failure there does not undo the rename.
   *
   * The moved file is not copied verbatim: `rewriteMovedDocSelf` moves its own `slug:` when
   * that mirrors the old address (the MCP `rename_concept` rule) and applies
   * `frontmatterUpdates` in the same bytes, which is how a reclassify changes `kind:` and
   * folder in one write. `expectedMtime` is `saveDoc`'s conflict guard, on the source.
   *
   * When `frontmatterUpdates` changes the document's kind, referrers also move each entry from
   * the list for the old kind to the list for the new one (`planReferrerRewrite`), and the
   * returned report says what every referrer got — the confirmation names them.
   */
  const renameDoc = useCallback(
    async (
      oldSlug: string,
      newSlug: string,
      opts: {
        rewriteBacklinks?: boolean;
        expectedMtime?: number;
        frontmatterUpdates?: Record<string, FrontmatterUpdateValue>;
      } = {},
    ): Promise<ReferrerRewriteReport> => {
      const live = openState();
      if (oldSlug === newSlug) return EMPTY_REFERRER_REPORT;
      /*
       * ⚠️ **Names that differ only in case are the same file** (review 2026-08-16 — reproduced
       * on the MCP side as documents disappearing; this path has the same shape).
       *
       * The collision check below compares Map keys, so it sees `Payments` and `payments` as
       * different. macOS and Windows filesystems see one file, so writing the new name and then
       * deleting the old one **deletes what was just written**.
       *
       * And since this app's `slugify` lowercases, renaming `Payments` to `payments` is ordinary
       * tidying a user does — not a rare case.
       */
      if (oldSlug.toLowerCase() === newSlug.toLowerCase()) {
        throw new Error(`Case-only rename is not supported: "${oldSlug}" → "${newSlug}"`);
      }
      if (live.fileHandles.has(newSlug)) {
        throw new Error(`Document already exists: "${newSlug}"`);
      }
      const oldFh = live.fileHandles.get(oldSlug);
      if (!oldFh) throw new Error(`Local vault: no file handle for "${oldSlug}"`);
      const file = await oldFh.getFile();
      guardExpectedMtime(oldSlug, opts.expectedMtime, file.lastModified);
      const raw = await file.text();
      if (opts.frontmatterUpdates) assertIdentityPatch(raw, opts.frontmatterUpdates);
      const content = rewriteMovedDocSelf(raw, {
        oldSlug,
        newSlug,
        updates: opts.frontmatterUpdates,
      });
      const newResolved = await getParentAndName(live.handle, newSlug, true);
      if (!newResolved) throw new Error('Vault is not open');
      const newFh = await newResolved.parent.getFileHandle(
        newResolved.fileName,
        { create: true },
      );
      const writable = await newFh.createWritable();
      await writable.write(content);
      await writable.close();
      const oldResolved = await getParentAndName(live.handle, oldSlug, false);
      if (oldResolved) {
        await oldResolved.parent.removeEntry(oldResolved.fileName);
      }

      // --- optional cascading backlink rewrite
      /*
       * ⚠️ **Frontmatter relations are the primary graph** (bug sweep 2026-09-01). This pass
       * used to rewrite only body `[[wikilink]]` / `](x.md)` forms and select referrers from
       * body-only `linksOut`, so a rename orphaned every frontmatter relation (`dependencies:`,
       * `capabilities:`, …) to the renamed node — backlinks vanished and the graph minted a
       * phantom stub under the old name, unlike MCP `rename_concept`. `planReferrerRewrite`
       * applies the same key family and tail rules as the MCP rewrite, and every doc is scanned,
       * which also catches referrers `linksOut` missed — a same-directory relative link was
       * previously detected but left dangling by the full-slug regex.
       *
       * A kind change also moves each entry into the list for the new kind (2026-09-26): the
       * same-key rewrite alone left an element listed under `capabilities:`.
       */
      const report =
        opts.rewriteBacklinks && live.manifest
          ? await rewriteReferrerFiles({
              docs: live.manifest.docs,
              fileHandles: live.fileHandles,
              oldSlug,
              newSlug,
              newKind: kindChangeOf(raw, opts.frontmatterUpdates) ?? undefined,
              markSelfWrite,
            })
          : EMPTY_REFERRER_REPORT;

      markSelfWrite(newSlug);
      await reloadIfOpen(live.handle);
      return report;
    },
    [openState, getParentAndName, reloadIfOpen, markSelfWrite, guardExpectedMtime],
  );

  /**
   * Writes the ontology starter into the open folder (`writeVaultStarter`) and rescans it. Config
   * files such as `.mcp.json` / `.codex` are seeded only when the bundled agent server is actually
   * installable — an unrunnable config is never planted silently. Existing files are skipped rather
   * than overwritten, so calling this on an existing vault is safe.
   *
   * `starterLocale` decides the language of the starter bodies: a vault created from a screen
   * in one language should read in that language. The file set and the frontmatter are
   * locale-independent, so any language produces the same graph (a contract test proves it).
   *
   * The locale is a **required argument**. With a default of `'en'`, two of the four creation
   * paths passed nothing and a vault created from a Korean screen was seeded with English
   * bodies (walkthrough 2026-07-26). Removing the default makes the type demand a locale from
   * any new call site, so the same drift cannot reopen. An unknown locale is downgraded to EN
   * by `starterFilesForLocale`.
   *
   * This is the door for a folder that is **already open** (Settings › Workspace, the map's empty
   * state). A door that creates a folder asks `open`/`openRecent` for the starter instead, so it is
   * written before the folder is first shown.
   */
  const scaffoldOntology = useCallback(async (starterLocale: string, shape: VaultShape = FULL_STARTER_SHAPE) => {
    const live = openState();
    if (!live.handle) {
      throw new Error('Vault is not open');
    }
    const vaultHandle = live.handle;
    await requireWritePermission(vaultHandle);
    const { markdownCreated, agentConfigCreated, created, skipped } = await writeVaultStarter(
      vaultHandle,
      starterLocale,
      shape,
      live.fileHandles,
    );
    await reloadIfOpen(vaultHandle);
    return { markdownCreated, agentConfigCreated, created, skipped };
  }, [openState, reloadIfOpen, requireWritePermission]);

  /**
   * The write the "connect" button performs — it takes the client and writes **only that
   * client's file**.
   *
   * Omitting `client` (the starter-vault scaffold) still writes all of them. The label there is
   * "start with a new folder", not "connect", and laying down one full set of configs is what
   * that label promises — two uses of one function, not one contract.
   */
  const ensureAgentConfigs = useCallback(async (client?: AgentClientId) => {
    const live = openState();
    if (!live.handle) {
      throw new Error('Vault is not open');
    }
    const vaultHandle = live.handle;
    await requireWritePermission(vaultHandle);
    const launch = await resolveBundledLaunch();
    if (!launch) {
      throw new Error(
        'The bundled MCP server is not available here — open this vault in the installed app.',
      );
    }
    const result = await writeAgentConfigFiles(
      vaultHandle,
      launch,
      client ? filesForClient(client) : undefined,
    );
    await reloadIfOpen(vaultHandle);
    return result;
  }, [openState, reloadIfOpen, requireWritePermission]);


  return {
    selfEditTimestamps,
    markSelfWrite,
    unmarkSelfWrite,
    consumeSelfWrittenSlugs,
    consumeReportedConflicts,
    saveDoc,
    createDoc,
    deleteDoc,
    renameDoc,
    scaffoldOntology,
    ensureAgentConfigs,
    updateFrontmatter,
    reclassifyDoc,
  };
}
