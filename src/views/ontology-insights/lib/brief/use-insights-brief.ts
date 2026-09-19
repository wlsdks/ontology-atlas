'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale } from 'next-intl';
import {
  useDataSourceMode,
  useLocalVault,
  useVaultIdentityScope,
  useVaultSessionIdentityScope,
} from '@/entities/vault-session';
import type { VaultDoc } from '@/entities/docs-vault';
import { createVaultRoundLedger, type RoundPassEntry } from '@/entities/library-round';
import { buildCoverageMatrix } from '@/entities/agent-files';
import { parseWikiLog, useLibraryModel, type WikiLogEntry } from '@/features/library';
import { deriveCoverageAreas, useHarnessReport } from '@/features/harness-report';
import { atlasBareToolMode } from '@/features/acp-session';
import { selectOpenVaultHandle } from '@/shared/lib/select-open-vault-handle';
import { getTauriVaultRootPath } from '@/shared/lib/tauri-vault-fs';
import { resolveBriefAnchor, useBriefSeenAt, type BriefAnchor } from './brief-anchor';
import { buildAgentBrief } from './agent-brief';
import { buildHarnessBrief } from './harness-brief';
import { buildOntologyBrief, type OntologyBriefNode } from './ontology-brief';
import { buildWikiBrief } from './wiki-brief';
import type { BriefCore } from './brief-model';

export interface InsightsBrief {
  anchor: BriefAnchor;
  /** Whole days between the anchor and the last read, for the heading. */
  sinceDays: number;
  markSeen: () => void;
  ontology: BriefCore;
  wiki: BriefCore;
  harness: BriefCore;
  agent: BriefCore;
}

const EMPTY_DOCS: readonly VaultDoc[] = [];
const EMPTY_LEDGER: readonly RoundPassEntry[] = [];
const EMPTY_LOG: readonly WikiLogEntry[] = [];

/** `disagreement 3 · superseded 1 · …` — the log line `describeLintTurn` writes, in every locale. */
function lintCountsFromSummary(summary: string | undefined): { disagreement: number; superseded: number } | null {
  if (!summary) return null;
  const pick = (name: string) => {
    const match = new RegExp(`${name} (\\d+)`).exec(summary);
    return match ? Number(match[1]) : null;
  };
  const disagreement = pick('disagreement');
  const superseded = pick('superseded');
  if (disagreement == null || superseded == null) return null;
  return { disagreement, superseded };
}

/**
 * Everything the brief tab draws, gathered from the readers the other screens already use:
 * the Library's source states and folder report, the rounds ledger, the harness scan, the
 * agent activity log. Nothing is computed twice — each number here is the same number its
 * home screen shows, re-read for one question: what changed since this reader last looked.
 *
 * `enabled` is the tab being drawn. The library model hashes every source and the harness
 * scan walks dot folders; neither runs for a tab nobody opened.
 */
export function useInsightsBrief({
  nodes,
  repairCount,
  unmatchedCount,
  enabled,
}: {
  nodes: readonly OntologyBriefNode[];
  repairCount: number;
  unmatchedCount: number;
  enabled: boolean;
}): InsightsBrief {
  const locale = useLocale();
  const mode = useDataSourceMode();
  const vault = useLocalVault();
  const identityScope = useVaultIdentityScope();
  const sessionScope = useVaultSessionIdentityScope();
  const handle = mode === 'local' ? selectOpenVaultHandle(vault.status, vault.handle) : null;
  const manifest = mode === 'local' ? vault.manifest : null;
  const docs = manifest?.docs ?? EMPTY_DOCS;
  const nativeRootPath = handle ? (getTauriVaultRootPath(handle) ?? null) : null;

  const [seenAt, markSeen] = useBriefSeenAt(identityScope);
  // Read once per load, inside the loader below, so no render calls the clock.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const anchor = useMemo(() => resolveBriefAnchor(seenAt, nowMs), [seenAt, nowMs]);
  const sinceDays = Math.max(0, Math.floor((nowMs - anchor.anchorMs) / 86_400_000));

  const library = useLibraryModel({
    docs,
    sources: manifest?.sources,
    sourceHandles: vault.sourceHandles,
    fileHandles: vault.fileHandles,
    vaultRootPath: nativeRootPath,
    vaultScope: sessionScope,
    enabled: enabled && handle !== null && manifest !== null,
  });

  const [sidecar, setSidecar] = useState<{
    handle: FileSystemDirectoryHandle | null;
    ledger: readonly RoundPassEntry[];
    log: readonly WikiLogEntry[];
  }>({ handle: null, ledger: EMPTY_LEDGER, log: EMPTY_LOG });
  useEffect(() => {
    if (!enabled || !handle) return;
    let cancelled = false;
    void (async () => {
      const [entries, text] = await Promise.all([
        createVaultRoundLedger(handle).read().catch(() => EMPTY_LEDGER),
        readWikiLog(handle),
      ]);
      if (cancelled) return;
      setSidecar({ handle, ledger: entries, log: parseWikiLog(text) });
      setNowMs(Date.now());
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, handle, vault.lastLoadedAt]);
  // A folder that closed or changed does not keep the previous folder's ledger on screen.
  const ledger = sidecar.handle === handle ? sidecar.ledger : EMPTY_LEDGER;
  const log = sidecar.handle === handle ? sidecar.log : EMPTY_LOG;

  const coverage = useMemo(() => deriveCoverageAreas(docs, locale), [docs, locale]);
  const projectSlugs = useMemo(
    () =>
      docs
        .filter((doc) => doc.frontmatter.kind === 'project')
        .map((doc) => doc.frontmatter.slug)
        .filter((slug): slug is string => typeof slug === 'string'),
    [docs],
  );
  const harnessState = useHarnessReport(handle, projectSlugs, enabled, coverage.capabilityPaths);
  const harnessReport = harnessState.status === 'ready' ? harnessState.report : null;

  const docFacts = useMemo(() => {
    const map = new Map<string, { reviewedBy: string | null; updatedAt: string | null }>();
    for (const doc of docs) {
      const reviewedBy = doc.frontmatter.reviewed_by;
      map.set(doc.slug, {
        reviewedBy: typeof reviewedBy === 'string' && reviewedBy.length > 0 ? reviewedBy : null,
        updatedAt: doc.updatedAt ?? null,
      });
    }
    return map;
  }, [docs]);

  const ontology = useMemo(
    () =>
      buildOntologyBrief({
        nodes,
        docs: docFacts,
        evidence: null,
        repairCount,
        unmatchedCount,
        anchorMs: anchor.anchorMs,
      }),
    [nodes, docFacts, repairCount, unmatchedCount, anchor.anchorMs],
  );

  const wiki = useMemo(() => {
    const orphan = library.structural.groups.find((group) => group.code === 'orphan-page');
    const dangling = library.structural.groups.find((group) => group.code === 'dangling-wikilink');
    return buildWikiBrief({
      sources: library.sources,
      pages: library.wikiPages,
      folderProblems: { orphanPages: orphan?.count ?? 0, danglingLinks: dangling?.count ?? 0 },
      lint: lintCountsFromSummary(library.log.lastLint?.summary),
      passes: ledger,
      log,
      anchorMs: anchor.anchorMs,
    });
  }, [library.sources, library.wikiPages, library.structural, library.log.lastLint, ledger, log, anchor.anchorMs]);

  const harness = useMemo(() => {
    if (!harnessReport) {
      return buildHarnessBrief({ areas: null, driftCount: null, fileTimes: null, guideFileCount: null, anchorMs: anchor.anchorMs });
    }
    const matrix = buildCoverageMatrix(harnessReport.coverage, coverage.areas, harnessReport.testFiles);
    return buildHarnessBrief({
      areas: matrix.areas,
      driftCount: harnessReport.analysis.drift.length,
      fileTimes: harnessReport.times.map((time) => ({ path: time.path, mtimeMs: time.lastModified })),
      guideFileCount: harnessReport.guideDocumentCount,
      anchorMs: anchor.anchorMs,
    });
  }, [harnessReport, coverage.areas, anchor.anchorMs]);

  const agent = useMemo(
    () =>
      buildAgentBrief({
        entries: mode === 'local' ? vault.agentActivityLog : [],
        isWriteTool: (tool) => atlasBareToolMode(tool) === 'write',
        anchorMs: anchor.anchorMs,
      }),
    [mode, vault.agentActivityLog, anchor.anchorMs],
  );

  return { anchor, sinceDays, markSeen, ontology, wiki, harness, agent };
}

async function readWikiLog(handle: FileSystemDirectoryHandle): Promise<string> {
  try {
    const wiki = await handle.getDirectoryHandle('wiki');
    const file = await wiki.getFileHandle('_log.md');
    return await (await file.getFile()).text();
  } catch {
    return '';
  }
}
