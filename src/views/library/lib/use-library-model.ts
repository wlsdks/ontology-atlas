"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildLibraryModel,
  type LibraryModel,
  type VaultDoc,
  type VaultSourceFile,
} from "@/entities/docs-vault";
import { nativeVaultFileHashes } from "@/shared/lib/tauri-vault-fs";
import { isWikiTemplateSlug, validateWikiPage } from "@/shared/lib/wiki-page-schema";

/**
 * The library, measured lazily, for one open folder.
 *
 * Two measurements sit on top of what the manifest already knows, and both are
 * deliberately **lazy and cached**, because both cost a file read:
 *
 * 1. **A source's sha256**, asked for only when some wiki page cites that source *and*
 *    recorded a hash for it. A source nobody has written up is `not-compiled` whatever
 *    its bytes are, so hashing it would spend a person's disk on a question nobody
 *    asked. In the app this is one native call for the whole batch; in a browser it is
 *    `crypto.subtle` over the bytes the person's own disk already holds.
 * 2. **A wiki page against its contract**, asked for once per `slug@mtime`. The page
 *    body is not in the manifest — `VaultDoc` keeps frontmatter, headings and an
 *    excerpt — and `uncited-fact` is a question about bullets, so the file is read.
 *    Bounded to `wiki/` and cached, an edit re-reads exactly the page that changed.
 *
 * Both caches are keyed by something the folder decides (path, and mtime), so a file
 * changing on disk invalidates its own entry and nothing else. Neither cache is written
 * anywhere: the folder is the state, and a second store of what the folder already says
 * is what `.claude/rules/forbidden.md` refuses.
 */

interface LibraryWikiVerdict {
  ok: boolean;
  /** The first problem's code, which is what a one-line row has room to say. */
  firstProblem: string | null;
  /** Its sentence, so the reader can show a reason without asking for a hover. */
  firstProblemMessage: string | null;
  problemCount: number;
  /** Every problem, for the block drawn beside the page itself. */
  problems: ReadonlyArray<{ code: string; message: string; line?: number }>;
}

export interface LibraryUiModel extends LibraryModel {
  /** Verdicts by wiki slug. A slug absent from the map has not been read yet. */
  verdicts: Map<string, LibraryWikiVerdict>;
  /** Wiki pages that do not fit the contract, and have been measured. */
  offTemplateCount: number;
  /**
   * Measured sha256 by source path, for the rows the reader opens.
   *
   * The map is already built inside this hook to derive the state words; exposing it is
   * what lets a source's own pane print the hash rather than measure it a second time,
   * and a path absent from it means **not measured**, which the pane says in those words
   * instead of showing an empty cell.
   */
  hashes: ReadonlyMap<string, string>;
}

const EMPTY_SOURCES: VaultSourceFile[] = [];

async function hashInBrowser(handle: FileSystemFileHandle): Promise<string | null> {
  // `crypto.subtle` needs a secure context. A browser that cannot hash reports the row
  // as unchecked rather than guessing that it is fine.
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  try {
    const file = await handle.getFile();
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

export function useLibraryModel({
  docs,
  sources,
  sourceHandles,
  fileHandles,
  vaultRootPath,
  enabled,
}: {
  docs: readonly VaultDoc[];
  sources: readonly VaultSourceFile[] | undefined;
  sourceHandles: Map<string, FileSystemFileHandle>;
  fileHandles: Map<string, FileSystemFileHandle>;
  vaultRootPath: string | null;
  /**
   * False while the folder is a read-only sample or still loading. Guarding the work as
   * well as the surface is the rule in `.claude/rules/architecture.md`: a section that
   * is not drawn must not pay for its model.
   */
  enabled: boolean;
}): LibraryUiModel {
  /**
   * Measured hashes, keyed by `path@mtime` rather than by path.
   *
   * That one choice removes the invalidation problem instead of solving it: a file whose
   * mtime moved is a different key, so its old measurement simply stops matching and the
   * row falls back to `checking`. Pruning the cache in an effect would be the same
   * behaviour written as a cascading render.
   */
  const [stampedHashes, setStampedHashes] = useState<Map<string, string>>(() => new Map());
  const [verdicts, setVerdicts] = useState<Map<string, LibraryWikiVerdict>>(() => new Map());
  /** `slug@mtime` of every wiki page already judged. */
  const judgedStamps = useRef(new Set<string>());

  const hashes = useMemo(() => {
    const out = new Map<string, string>();
    for (const source of sources ?? []) {
      const hash = stampedHashes.get(`${source.path}@${source.mtime}`);
      if (hash) out.set(source.path, hash);
    }
    return out;
  }, [sources, stampedHashes]);

  const model = useMemo(
    () =>
      buildLibraryModel({
        sources: enabled ? (sources ?? EMPTY_SOURCES) : EMPTY_SOURCES,
        docs: enabled ? docs : [],
        hashes,
      }),
    [docs, enabled, hashes, sources],
  );

  const wanted = model.pathsNeedingHash;
  const wantedKey = wanted.join("\u0000");

  useEffect(() => {
    if (!enabled || wanted.length === 0) return;
    let cancelled = false;
    void (async () => {
      const measured = new Map<string, string>();
      const native = vaultRootPath ? await nativeVaultFileHashes(vaultRootPath, wanted) : null;
      if (native) {
        for (const [path, hash] of native) measured.set(path, hash);
      } else {
        for (const path of wanted) {
          const handle = sourceHandles.get(path);
          if (!handle) continue;
          const hash = await hashInBrowser(handle);
          if (hash) measured.set(path, hash);
        }
      }
      if (cancelled || measured.size === 0) return;
      const stamps = new Map((sources ?? []).map((source) => [source.path, source.mtime] as const));
      setStampedHashes((current) => {
        const next = new Map(current);
        for (const [path, hash] of measured) next.set(`${path}@${stamps.get(path) ?? 0}`, hash);
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // `wantedKey` stands for `wanted`: a new array with the same paths is the same work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sourceHandles, sources, vaultRootPath, wantedKey]);

  const wikiPages = model.wikiPages;
  const wikiKey = wikiPages.map((page) => page.slug).join("\u0000");

  useEffect(() => {
    if (!enabled || wikiPages.length === 0) return;
    let cancelled = false;
    const bySlug = new Map(docs.map((doc) => [doc.slug, doc] as const));
    const knownSources = (sources ?? []).map((source) => source.path);
    void (async () => {
      const measured = new Map<string, LibraryWikiVerdict>();
      for (const page of wikiPages) {
        if (isWikiTemplateSlug(page.slug)) continue;
        const doc = bySlug.get(page.slug);
        const stamp = `${page.slug}@${doc?.mtime ?? 0}`;
        if (judgedStamps.current.has(stamp)) continue;
        const handle = fileHandles.get(page.slug);
        if (!handle) continue;
        let raw: string;
        try {
          raw = await (await handle.getFile()).text();
        } catch {
          continue;
        }
        const { ok, problems } = validateWikiPage(raw, { knownSources });
        judgedStamps.current.add(stamp);
        measured.set(page.slug, {
          ok,
          firstProblem: problems[0]?.code ?? null,
          firstProblemMessage: problems[0]?.message ?? null,
          problemCount: problems.length,
          problems,
        });
      }
      if (cancelled || measured.size === 0) return;
      setVerdicts((current) => {
        const next = new Map(current);
        for (const [slug, verdict] of measured) next.set(slug, verdict);
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, enabled, fileHandles, sources, wikiKey]);

  return useMemo(() => {
    const live = new Set(model.wikiPages.map((page) => page.slug));
    let offTemplateCount = 0;
    for (const [slug, verdict] of verdicts) {
      if (live.has(slug) && !verdict.ok) offTemplateCount += 1;
    }
    return { ...model, verdicts, offTemplateCount, hashes };
  }, [hashes, model, verdicts]);
}
