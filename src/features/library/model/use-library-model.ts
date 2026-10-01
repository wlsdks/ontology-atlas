"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildLibraryModel,
  type LibraryModel,
  type VaultDoc,
  type VaultSourceFile,
} from "@/entities/docs-vault";
import { nativeVaultFileHashes } from "@/shared/lib/tauri-vault-fs";
import { isRetainedAnswerPath, retainedAnswerHeads, type RetainedAnswerHead } from "../lib/answer-revision";
import { parseWikiLog, type WikiLogEntry } from "../lib/wiki-log";
import { isWikiFurnitureSlug, validateWikiFolder, validateWikiPage } from "@/shared/lib/wiki-page-schema";
import { aggregateWikiFindings, type WikiReport } from "@/shared/lib/wiki-report.mjs";
import { mergeWikiVerdict } from "./merge-wiki-verdict";
import { useStampedCache } from "./use-stamped-cache";

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
  /** Page text by wiki slug as last read; a slug absent here gets no verdict rather than a guess. */
  pageTexts: ReadonlyMap<string, string>;
  /** Last Compile and Check runs from `wiki/_log.md`; null when the log has no such line. */
  log: { lastCompile: WikiLogEntry | null; lastLint: WikiLogEntry | null };
  /**
   * Verdicts regrouped by `mcp/src/wiki-report.mjs`, the module the CLI and MCP use, so the app
   * and a terminal count one folder one way. The `unmeasured` field names pages not yet read.
   */
  structural: WikiReport;
  /** Measured sha256 by source path; a path absent here was not measured. */
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

  const hashes = useMemo(() => {
    const out = new Map<string, string>();
    for (const source of sources ?? []) {
      const hash = stampedHashes.get(`${vaultScope}\u0000${source.path}@${source.mtime}`);
      if (hash) out.set(source.path, hash);
    }
    return out;
  }, [sources, stampedHashes, vaultScope]);

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
      cacheHashes(new Map([...measured].map(([path, hash]) =>
        [`${vaultScope}\u0000${path}@${stamps.get(path) ?? 0}`, hash],
      )));
    })();
    return () => {
      cancelled = true;
    };
    // `wantedKey` stands for `wanted`: a new array with the same paths is the same work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheHashes, enabled, sourceHandles, sources, vaultRootPath, vaultScope, wantedKey]);

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
  const pageInputs = useMemo(() => {
    const bySlug = new Map(docs.map((doc) => [doc.slug, doc] as const));
    return wikiPages
      .filter((page) => !isWikiFurnitureSlug(page.slug))
      .map((page) => ({
        slug: page.slug,
        stamp: `${vaultScope}\u0000${page.slug}@${bySlug.get(page.slug)?.mtime ?? 0}`,
      }));
  }, [docs, vaultScope, wikiPages]);

  const pageStamps = useMemo(() => pageInputs.map(({ stamp }) => stamp), [pageInputs]);
  const { values: rawByStamp, publish: cacheBodies } = useStampedCache(pageStamps);

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
      cacheBodies(read);
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheBodies, enabled, fileHandles, pageInputs, rawByStamp]);

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

  /* One aggregator decides both numbers, so the footer and `wiki-validate` never disagree. */
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
