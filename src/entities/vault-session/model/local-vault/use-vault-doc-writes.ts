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
   * 'permission-needed' so the reauth UI appears, and it still throws so the caller's
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

  /** Walks a slash path from the root handle and returns the parent directory handle plus the file name. */
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
   * Rewrites one slug's markdown file, requesting readwrite permission first, then rescans.
   * `options.expectedMtime` is checked against `file.lastModified` before the write and throws
   * `VaultConflictError` on an outside change; omitted, the check is skipped.
   */
  // Slugs the app itself just wrote, so the polling diff toaster does not report its own
  // writes as "added/edited" (the four-toast burst during bootstrap). A one-shot ledger
  // cleared on consumption: only outside changes (an agent, an IDE) become toasts.
  const selfWrittenSlugsRef = useRef<Set<string>>(new Set());
  // slug → last self-write time in ms, the only source of "last edited · me". An mtime cannot
  // say who changed a file, so only writes through this API mark "me". Not cleared on consumption.
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
   * A refused save records which outside change it reported (slug + disk mtime), so the diff
   * toaster drops only that same notice (`consumeReportedConflicts`); a newer edit still reports.
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

  /** Creates a new `.md` at the slug path, erroring when one exists; the template seeds the body. */
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
   * Deletes the file for a slug; empty directories stay. `options.expectedMtime` is `saveDoc`'s
   * guard: a file changed since the person confirmed is refused, not removed.
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
   * Updates only some frontmatter keys, preserving the body: an existing key is replaced, a new one
   * appended, a null value deletes it. Supports one-line `key: value` and inline arrays only.
   * `opts.skipRefresh` avoids scroll jumps in a run of calls; `opts.rewriteBacklinks` is `reclassifyDoc`'s.
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
   * A kind change where the document stands (`renameDoc` does the moving case). The patch is
   * written as `updateFrontmatter` writes it; referrers then move their entry to the new kind's
   * list (`planReferrerRewrite`) and the returned report says what each got.
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
   * Changes a slug path (rename or move): create at the new location, then remove the original;
   * identical slugs are a no-op. `rewriteBacklinks` rewrites references best effort, without
   * undoing the rename. `rewriteMovedDocSelf` and `frontmatterUpdates` apply in the same bytes;
   * a kind change also moves referrer entries, and the report names them.
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
       * Names that differ only in case are the same file on macOS and Windows: write-then-delete
       * would delete what was just written, so the Map-key collision check is not enough.
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
       * Frontmatter relations are the primary graph: `planReferrerRewrite` applies the MCP
       * `rename_concept` key family and tail rules to every doc, and a kind change moves each entry
       * into the list for the new kind.
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
   * Writes the ontology starter into the open folder and rescans. Config files are seeded only
   * when the bundled agent server is installable; existing files are skipped. `starterLocale` is
   * required so no creation path falls back to English bodies. For an already open folder;
   * creation doors pass the starter to `open`/`openRecent` instead.
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
   * The write the "connect" button performs: only that client's file. Omitting `client` (the
   * starter scaffold) writes all of them.
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
