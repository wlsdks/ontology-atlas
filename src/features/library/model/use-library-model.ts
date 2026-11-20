"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildLibraryModel,
  type LibraryModel,
  type VaultDoc,
  type VaultSourceFile,
} from "@/entities/docs-vault";
import { nativeVaultFileHashResults } from "@/shared/lib/vault-folder/tauri-vault-fs";
import { isRetainedAnswerPath, retainedAnswerHeads, type RetainedAnswerHead } from "../lib/questions/answer-revision";
import { parseWikiLog, type WikiLogEntry } from "../lib/wiki/wiki-log";
import { wikiNodeIndexOfDocs } from "../lib/wiki/judge-page-write";
import { isWikiFurnitureSlug, validateWikiFolder, validateWikiPage } from "@/shared/lib/library/wiki-page-schema";
import { aggregateWikiFindings, type WikiReport } from "@/shared/lib/library/wiki-report.mjs";
import { useLatestRef } from "@/shared/lib/use-latest-ref";
import { mergeWikiVerdict } from "./merge-wiki-verdict";
import { useStampedCache, useStampStable } from "./use-stamped-cache";

/**
 * The library for one open folder. Source hashes and wiki page bytes cost a read, so both are
 * lazy and cached in memory only: the folder is the state (`.claude/rules/forbidden.md`).
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
  pageTexts: ReadonlyMap<string, string>;
  /** Last Compile and Check runs from `wiki/_log.md`; null when the log has no such line. */
  log: { lastCompile: WikiLogEntry | null; lastLint: WikiLogEntry | null };
  /**
   * Verdicts regrouped by `mcp/src/library/wiki-report.mjs`, the module the CLI and MCP use, so the app
   * and a terminal count one folder one way. The `unmeasured` field names pages not yet read.
   */
  structural: WikiReport;
  /** Measured sha256 by source path; a path absent here was not measured. */
  hashes: ReadonlyMap<string, string>;
}

const EMPTY_SOURCES: VaultSourceFile[] = [];

/** Paths per native call, so the checking count can move while a large folder is hashed. */
export const SOURCE_HASH_CHUNK = 256;

/** The longest a measured hash waits before the model shows it; well inside the 2 s the spec allows. */
export const SOURCE_HASH_PUBLISH_MS = 1000;

/** Each shown batch of page text is at least 1/4 of the pages already shown, so judging every shown page per batch is O(pages) in total. */
const PAGE_TEXT_BATCH_SHARE = 4;

/** The cached value of a file that could not be opened; kept until its stamp (path and mtime) changes. */
const UNREADABLE = "";

const canHashInBrowser = () => typeof crypto !== "undefined" && Boolean(crypto.subtle);

/** `null` when the file could not be read. */
async function hashInBrowser(handle: FileSystemFileHandle): Promise<string | null> {
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
  /** False for a read-only sample or while loading; an undrawn section must not pay for its model (`.claude/rules/architecture.md`). */
  enabled: boolean;
}): LibraryUiModel {
  const sourceStamps = useMemo(
    () => (enabled ? sources ?? EMPTY_SOURCES : EMPTY_SOURCES)
      .map((source) => `${vaultScope}\u0000${source.path}@${source.mtime}`),
    [enabled, sources, vaultScope],
  );
  const { values: stampedHashes, publish: cacheHashes } = useStampedCache(sourceStamps);
  const [logEntries, setLogEntries] = useState<WikiLogEntry[]>([]);
  const logStamp = useRef<string | null>(null);

  const [hashRound, setHashRound] = useState(0);
  const hashing = useRef(false);
  const hashGeneration = useRef(0);

  const { hashes, unreadable } = useMemo(() => {
    const hashes = new Map<string, string>();
    const unreadable = new Set<string>();
    for (const source of sources ?? []) {
      const hash = stampedHashes.get(`${vaultScope}\u0000${source.path}@${source.mtime}`);
      if (hash === UNREADABLE) unreadable.add(source.path);
      else if (hash) hashes.set(source.path, hash);
    }
    return { hashes, unreadable };
  }, [sources, stampedHashes, vaultScope]);

  const model = useMemo(
    () =>
      buildLibraryModel({
        sources: enabled ? (sources ?? EMPTY_SOURCES) : EMPTY_SOURCES,
        docs: enabled ? docs : [],
        hashes,
        unreadable,
      }),
    [docs, enabled, hashes, sources, unreadable],
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
      ...model.sources.filter((source) =>
        observed.has(source.path) && !hashes.has(source.path) && !unreadable.has(source.path),
      ).map((source) => source.path),
    ])];
  }, [docs, hashes, model.pathsNeedingHash, model.sources, unreadable]);
  const wantedKey = wanted.join("\u0000");

  // A run for a folder that is no longer open stops at its next chunk.
  useEffect(() => () => {
    hashGeneration.current += 1;
  }, [enabled, vaultRootPath, vaultScope]);

  /*
   * One run at a time, chunk by chunk. Results are published at most once per interval, because
   * each publish rebuilds the model (about 0.3 s at 50,000 sources). A result is stamped with the
   * path and mtime it was read under, so it stays true after a rerender; the stamped cache drops it
   * if that file has since changed. When a run ends, `hashRound` lets the next one pick up whatever
   * became wanted meanwhile.
   */
  useEffect(() => {
    if (!enabled || hashing.current || wanted.length === 0) return;
    const queue = wanted;
    const stamps = new Map((sources ?? []).map((source) => [source.path, source.mtime] as const));
    const generation = hashGeneration.current;
    const stamp = (path: string) => `${vaultScope}\u0000${path}@${stamps.get(path) ?? 0}`;
    hashing.current = true;
    void (async () => {
      let unpublished = new Map<string, string>();
      let publishedAt = performance.now();
      let askAgain = false;
      try {
        for (let at = 0; at < queue.length; at += SOURCE_HASH_CHUNK) {
          if (generation !== hashGeneration.current) break;
          const chunk = queue.slice(at, at + SOURCE_HASH_CHUNK);
          let measured = vaultRootPath ? await nativeVaultFileHashResults(vaultRootPath, chunk) : null;
          if (!measured) {
            // A browser without `crypto.subtle` cannot judge any file, so it marks none unreadable.
            if (!canHashInBrowser()) return;
            measured = new Map();
            for (const path of chunk) {
              const handle = sourceHandles.get(path);
              measured.set(path, handle ? await hashInBrowser(handle) : null);
            }
          }
          // A path the call did not answer counts as unreadable, so it is not asked for forever.
          for (const path of chunk) unpublished.set(stamp(path), measured.get(path) ?? UNREADABLE);
          if (performance.now() - publishedAt >= SOURCE_HASH_PUBLISH_MS) {
            cacheHashes(unpublished);
            unpublished = new Map();
            publishedAt = performance.now();
          }
        }
        askAgain = true;
      } catch {
        // A failed call leaves the rest checking; a later change of the folder asks again.
      } finally {
        hashing.current = false;
        if (unpublished.size > 0) cacheHashes(unpublished);
        if (askAgain) setHashRound((round) => round + 1);
      }
    })();
    // `wantedKey` stands for `wanted`: a new array with the same paths is the same work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheHashes, enabled, hashRound, sourceHandles, sources, vaultRootPath, vaultScope, wantedKey]);

  const logDoc = docs.find((doc) => doc.slug === "wiki/_log") ?? null;
  const logMtime = logDoc?.mtime ?? null;
  useEffect(() => {
    if (!enabled) return;
    const stamp = logDoc ? `wiki/_log@${logMtime ?? 0}` : null;
    if (stamp === null || stamp === logStamp.current) return;
    const handle = fileHandles.get("wiki/_log");
    if (!handle) return;
    // Claimed before the read so a rebuilt manifest does not start a second read; not cancelled
    // on cleanup, because this stamp's read is the wanted one.
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
  const pageInputsOfModel = useMemo(() => {
    const bySlug = new Map(docs.map((doc) => [doc.slug, doc] as const));
    return wikiPages
      .filter((page) => !isWikiFurnitureSlug(page.slug))
      .map((page) => ({
        slug: page.slug,
        stamp: `${vaultScope}\u0000${page.slug}@${bySlug.get(page.slug)?.mtime ?? 0}`,
      }));
  }, [docs, vaultScope, wikiPages]);
  // Every hash publish rebuilds `wikiPages`; the pages to read change only when a stamp does.
  const pageInputs = useStampStable(pageInputsOfModel);

  const pageStamps = useMemo(() => pageInputs.map(({ stamp }) => stamp), [pageInputs]);
  const { values: rawByStamp, publish: cacheBodies } = useStampedCache(pageStamps);
  const latestRawByStamp = useLatestRef(rawByStamp);
  const latestPageInputs = useLatestRef(pageInputs);
  const latestFileHandles = useLatestRef(fileHandles);
  const [pageTextRound, setPageTextRound] = useState(0);
  const readingPages = useRef(false);
  const pageTextGeneration = useRef(0);

  // A run for a folder that is no longer open, or a hidden library, stops at its next page.
  useEffect(() => () => {
    pageTextGeneration.current += 1;
  }, [enabled, vaultScope]);

  /*
   * One run at a time, page by page, shown in batches so the read count only grows. A rerender does
   * not restart it; when it ends with other pages or handles than it began with, `pageTextRound`
   * starts the next run for what is still unread.
   */
  useEffect(() => {
    if (!enabled || readingPages.current) return;
    const shown = latestRawByStamp.current;
    const unread = pageInputs.filter(({ stamp }) => !shown.has(stamp));
    if (unread.length === 0) return;
    const generation = pageTextGeneration.current;
    const isCurrent = () => generation === pageTextGeneration.current;
    readingPages.current = true;
    void (async () => {
      let unpublished = new Map<string, string>();
      let shownCount = shown.size;
      let publishedAt = performance.now();
      try {
        for (const { slug, stamp } of unread) {
          if (!isCurrent()) return;
          const handle = fileHandles.get(slug);
          if (!handle) continue;
          try {
            unpublished.set(stamp, await (await handle.getFile()).text());
          } catch {
            // An unreadable page has no result; a later folder poll may retry it.
          }
          const batchDue = performance.now() - publishedAt >= SOURCE_HASH_PUBLISH_MS &&
            unpublished.size * PAGE_TEXT_BATCH_SHARE >= shownCount;
          if (batchDue && isCurrent()) {
            cacheBodies(unpublished);
            shownCount += unpublished.size;
            unpublished = new Map();
            publishedAt = performance.now();
          }
        }
      } finally {
        readingPages.current = false;
        if (isCurrent() && unpublished.size > 0) cacheBodies(unpublished);
        const inputsMoved = latestPageInputs.current !== pageInputs || latestFileHandles.current !== fileHandles;
        if (!isCurrent() || inputsMoved) setPageTextRound((round) => round + 1);
      }
    })();
  }, [cacheBodies, enabled, fileHandles, latestFileHandles, latestPageInputs, latestRawByStamp, pageInputs, pageTextRound]);

  // The folder's concepts, so a `describes:` entry whose concept is gone is reported here as
  // `wiki-validate` reports it.
  const concepts = useMemo(() => wikiNodeIndexOfDocs(docs), [docs]);
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
    const knownSources = new Set((sources ?? []).map((source) => source.path));
    const verdicts = new Map<string, LibraryWikiVerdict>();
    for (const [slug, raw] of pageTexts) {
      const { ok, problems } = validateWikiPage(raw, { knownSources, nodes: concepts });
      verdicts.set(slug, mergeWikiVerdict({
        ok,
        firstProblem: problems[0]?.code ?? null,
        firstProblemMessage: problems[0]?.message ?? null,
        problemCount: problems.length,
        problems,
      }, folderByPath.get(`${slug}.md`) ?? []));
    }
    return { pageTexts, verdicts };
  }, [concepts, pageInputs, rawByStamp, sources]);

  /*
   * The pages are judged with the inputs `wiki-validate` passes (the folder's sources and its
   * concepts), and one aggregator decides both numbers, so the footer and `wiki-validate` agree.
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
    // Log entries are read only while the file exists; they are ignored, not cleared, when it is
    // removed.
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
