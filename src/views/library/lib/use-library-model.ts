"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildLibraryModel,
  type LibraryModel,
  type VaultDoc,
  type VaultSourceFile,
} from "@/entities/docs-vault";
import { nativeVaultFileHashes } from "@/shared/lib/tauri-vault-fs";
import { isRetainedAnswerPath, parseWikiLog, retainedAnswerHeads, type RetainedAnswerHead, type WikiLogEntry } from "@/features/library";
import { isWikiFurnitureSlug, validateWikiFolder, validateWikiPage } from "@/shared/lib/wiki-page-schema";
import { aggregateWikiFindings, type WikiReport } from "@/shared/lib/wiki-report.mjs";
import { mergeWikiVerdict } from "./merge-wiki-verdict";

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
 * 2. **A wiki page's bytes**, read once per `slug@mtime`. The page
 *    body is not in the manifest — `VaultDoc` keeps frontmatter, headings and an
 *    excerpt — and `uncited-fact` is a question about bullets, so the file is read.
 *    Bounded to `wiki/` and cached, an edit re-reads exactly the page that changed.
 *
 * The bytes are cached, but verdicts are derived against the current page and source
 * membership: deleting another file can break an unchanged page's citation or link.
 * A changed file invalidates its own byte entry. Neither cache is written
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
  retainedAnswers?: readonly RetainedAnswerHead[];
  answerVersions?: ReadonlyMap<string, 'head' | 'older' | 'alternative' | 'unresolved'>;
  /** Verdicts by wiki slug. A slug absent from the map has not been read yet. */
  verdicts: Map<string, LibraryWikiVerdict>;
  /** Wiki pages that do not fit the contract, and have been measured. */
  offTemplateCount: number;
  /**
   * Page text by wiki slug, as last read for judging. The permission card applies an
   * agent's edit to this to judge the page that would land; a slug absent here has not
   * been read yet and gets no verdict rather than a guessed one.
   */
  pageTexts: ReadonlyMap<string, string>;
  /**
   * The last Compile and the last Check-the-wiki run, read from `wiki/_log.md` — the
   * app's own record, so the header can say what happened without asking anybody.
   * Null when the log has no such line yet.
   */
  log: { lastCompile: WikiLogEntry | null; lastLint: WikiLogEntry | null };
  /**
   * **The structural check, grouped the way a person reads it** — one entry per finding
   * kind, the pages under it, advisory kinds last.
   *
   * Derived, never remembered: it is `verdicts` regrouped by
   * `mcp/src/wiki-report.mjs`, the same module `wiki-validate` and `validate_wiki` group
   * with, so the Check-results page and a terminal cannot enumerate one folder two ways
   * (`docs/DECISIONS.md` 2026-09-11 makes that difference a falsifier). It is therefore
   * true on every open, on every route, with no button and no agent.
   *
   * `unmeasured` is the honest half: page bytes are read lazily, so on the first frames
   * of a folder there are pages this report has not judged. A reader is told that rather
   * than being shown a short list as if it were complete.
   */
  structural: WikiReport;
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
  vaultScope,
  enabled,
}: {
  docs: readonly VaultDoc[];
  sources: readonly VaultSourceFile[] | undefined;
  sourceHandles: Map<string, FileSystemFileHandle>;
  fileHandles: Map<string, FileSystemFileHandle>;
  vaultRootPath: string | null;
  /** The actual folder session identity, including distinct browser handles with the same name. */
  vaultScope: string;
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
  /**
   * Cache only completed reads. A cancelled effect must not mark a page judged and
   * prevent its successor from publishing the verdict. The key includes the folder
   * identity, so a page with the same slug and mtime in another open vault cannot leak
   * into this one. Current membership selects which cached bytes may reach readers or
   * the permission card; verdicts remain derived from those current bytes below.
   */
  const [rawByStamp, setRawByStamp] = useState<Map<string, string>>(() => new Map());
  const [logEntries, setLogEntries] = useState<WikiLogEntry[]>([]);
  const logStamp = useRef<string | null>(null);

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

  const wanted = useMemo(() => {
    const observed = new Set<string>();
    for (const doc of docs) {
      const observations = doc.frontmatter.answer_source_observations;
      if (!observations || typeof observations !== 'object' || Array.isArray(observations)) continue;
      for (const [path, hash] of Object.entries(observations)) {
        if (typeof hash === 'string' && /^[a-f0-9]{64}$/i.test(hash)) observed.add(path);
      }
    }
    return [...new Set([
      ...model.pathsNeedingHash,
      ...model.sources.filter((source) => observed.has(source.path) && !hashes.has(source.path)).map((source) => source.path),
    ])];
  }, [docs, hashes, model.pathsNeedingHash, model.sources]);
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

  const logDoc = docs.find((doc) => doc.slug === "wiki/_log") ?? null;
  const logMtime = logDoc?.mtime ?? null;
  useEffect(() => {
    if (!enabled) return;
    const stamp = logDoc ? `wiki/_log@${logMtime ?? 0}` : null;
    if (stamp === null || stamp === logStamp.current) return;
    const handle = fileHandles.get("wiki/_log");
    if (!handle) return;
    // Claimed before the read so a re-run with the same stamp (the manifest and the
    // handle map are rebuilt as new objects) does not start a second read; not cancelled
    // on cleanup, because a read for this exact stamp is the one wanted and a cleanup
    // that discarded it left the header blank (measured in the browser, 2026-09-06).
    logStamp.current = stamp;
    void (async () => {
      try {
        const text = await (await handle.getFile()).text();
        if (logStamp.current === stamp) setLogEntries(parseWikiLog(text));
      } catch {
        // An unreadable log says nothing; the header simply has no line. Let a later
        // change of the file try again.
        if (logStamp.current === stamp) logStamp.current = null;
      }
    })();
  }, [enabled, fileHandles, logDoc, logMtime]);

  const wikiPages = model.wikiPages;
  const retainedAnswers = useMemo(() => retainedAnswerHeads(docs), [docs]);
  const answerVersions = useMemo(() => {
    const heads = new Map(retainedAnswers.map((answer) => [answer.slug, answer]));
    return new Map(docs.filter((doc) => isRetainedAnswerPath(doc.slug)).map((doc) => {
      const head = heads.get(doc.slug);
      const version = head?.historyProblem ? 'unresolved' : !head ? 'older' : head.alternatives > 1 ? 'alternative' : 'head';
      return [doc.slug, version] as const;
    }));
  }, [docs, retainedAnswers]);
  const pageInputs = useMemo(() => {
    const bySlug = new Map(docs.map((doc) => [doc.slug, doc] as const));
    return wikiPages
      .filter((page) => !isWikiFurnitureSlug(page.slug))
      .map((page) => ({
        slug: page.slug,
        stamp: `${vaultScope}\u0000${page.slug}@${bySlug.get(page.slug)?.mtime ?? 0}`,
      }));
  }, [docs, vaultScope, wikiPages]);

  useEffect(() => {
    if (!enabled) return;
    const unread = pageInputs.filter(({ stamp }) => !rawByStamp.has(stamp));
    if (unread.length === 0) return;
    let cancelled = false;
    void (async () => {
      const read = new Map<string, string>();
      for (const { slug, stamp } of unread) {
        const handle = fileHandles.get(slug);
        if (!handle) continue;
        try {
          const raw = await (await handle.getFile()).text();
          if (cancelled) return;
          read.set(stamp, raw);
        } catch {
          if (cancelled) return;
          // An unreadable page has no verdict. A later folder poll may retry it.
        }
      }
      if (cancelled || read.size === 0) return;
      setRawByStamp((current) => {
        const next = new Map(current);
        for (const [stamp, raw] of read) next.set(stamp, raw);
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, fileHandles, pageInputs, rawByStamp]);

  const { pageTexts, verdicts } = useMemo(() => {
    const pageTexts = new Map<string, string>();
    for (const { slug, stamp } of pageInputs) {
      const raw = rawByStamp.get(stamp);
      if (raw !== undefined) pageTexts.set(slug, raw);
    }
    const folderInput = [...pageTexts].map(([slug, raw]) => ({ path: `${slug}.md`, raw }));
    const folderByPath = new Map(
      validateWikiFolder(folderInput).map((entry) => [entry.path, entry.problems] as const),
    );
    const knownSources = (sources ?? []).map((source) => source.path);
    const verdicts = new Map<string, LibraryWikiVerdict>();
    for (const [slug, raw] of pageTexts) {
      const { ok, problems } = validateWikiPage(raw, { knownSources });
      verdicts.set(slug, mergeWikiVerdict({
        ok,
        firstProblem: problems[0]?.code ?? null,
        firstProblemMessage: problems[0]?.message ?? null,
        problemCount: problems.length,
        problems,
      }, folderByPath.get(`${slug}.md`) ?? []));
    }
    return { pageTexts, verdicts };
  }, [pageInputs, rawByStamp, sources]);

  /*
   * One aggregator decides both numbers. `offTemplateCount` used to be counted here from
   * `!verdict.ok` while `wiki-validate` counted every page with any finding, so the app's
   * footer said "2 pages do not fit the template" on the folder a terminal called
   * `0/6 pages fit` — two correct numbers from two rules (both PO seats, 2026-09-12).
   * `blockingPageCount` is now that one rule, and the report's head states what it counts.
   */
  const structural = useMemo(
    () =>
      aggregateWikiFindings({
        pages: [...verdicts].map(([slug, verdict]) => ({
          path: `${slug}.md`,
          problems: verdict.problems,
        })),
        unmeasured: pageInputs
          .filter(({ slug }) => !verdicts.has(slug))
          .map(({ slug }) => `${slug}.md`),
      }),
    [pageInputs, verdicts],
  );

  return useMemo(() => {
    // A folder whose log was removed shows no line: the entries are read only while the
    // file is there, and are ignored, not cleared, when it is not.
    const entries = logDoc ? logEntries : [];
    const lastCompile = [...entries].reverse().find((entry) => entry.kind === "compile") ?? null;
    const lastLint = [...entries].reverse().find((entry) => entry.kind === "lint") ?? null;
    return {
      ...model,
      verdicts,
      offTemplateCount: structural.blockingPageCount,
      structural,
      hashes,
      pageTexts,
      retainedAnswers,
      answerVersions,
      log: { lastCompile, lastLint },
    };
  }, [answerVersions, hashes, logDoc, logEntries, model, pageTexts, retainedAnswers, structural, verdicts]);
}
