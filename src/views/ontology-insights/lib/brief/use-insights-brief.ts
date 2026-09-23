'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { resolveLocaleDisplayName } from '@/shared/lib/locale-display-name';
import { gitPathsLastChange, isGitBridgeAvailable, type GitPathLastChange } from '@/shared/lib/tauri-git';
import { resolveEvidenceStates, type EvidenceConceptInput } from './evidence-states';
import type { BriefLineDetail } from './brief-model';
import {
  canUndoBriefSeenAt,
  resolveBriefAnchor,
  useBriefSeenAt,
  type BriefAnchor,
} from './brief-anchor';
import { buildEvidenceDetails } from './evidence-details';
import { buildAgentBrief } from './agent-brief';
import { buildHarnessBrief } from './harness-brief';
import { buildOntologyBrief, type OntologyBriefNode } from './ontology-brief';
import { buildWikiBrief } from './wiki-brief';
import { buildSinceList, type SinceRow } from './since-list';
import type { BriefCore } from './brief-model';
import {
  projectHarnessCoverageEvidence,
  type HarnessCoverageEvidence,
} from './harness-detail';

export interface InsightsBrief {
  anchor: BriefAnchor;
  /** Whole days between the anchor and the last read, for the heading. */
  sinceDays: number;
  /**
   * The instant the counts were read. Every relative time on the screen is measured against
   * this one value: `relativeTime` without it falls back to the render clock, which differs
   * between the server render and the first client frame and makes the same row say two
   * things (next-intl ENVIRONMENT_FALLBACK, observed 2026-09-19).
   */
  nowMs: number;
  markSeen: () => void;
  /** Puts the anchor back where the last mark found it. Local to this browser, so no dialog. */
  undoSeen: () => void;
  /**
   * Whether a mark made in this session can still be taken back for this folder. It is a fact
   * about the folder, not about one mount, so the tab reads it rather than remembering its own
   * press — leaving the tab and coming back used to lose the way back while the anchor was
   * still recoverable.
   */
  canUndoSeen: boolean;
  ontology: BriefCore;
  wiki: BriefCore;
  harness: BriefCore;
  agent: BriefCore;
  /** What happened after the anchor, newest first, bounded; `sinceTotal` is the whole count. */
  since: readonly SinceRow[];
  sinceTotal: number;
  /**
   * What a line counts, by name: concept, the exact path that moved, and when. Keyed by the
   * line id, so a count and the rows under it can never come from different calculations.
   */
  details: ReadonlyMap<string, readonly BriefLineDetail[]>;
  /** What the library panel lists: the same model the Library screen renders from. */
  library: {
    availability: BriefCore['availability'];
    pageCount: number;
    sourceCount: number;
    stalePages: { slug: string; sources: string[] }[];
    unwrittenSources: string[];
    findings: { code: string; advisory: boolean; count: number; pages: string[] }[];
    unmeasured: number;
    passes: { endedAt: string; outcome: string; checked: number; written: number; summary: string }[];
  };
  /** What the harness panel lists: the coverage table's own rows and the mirror findings. */
  harnessDetail: HarnessDetail;
}

interface HarnessDetailBase {
  areas: { slug: string; title: string; told: number; gated: number; watched: number }[];
  everywhere: { told: number; gated: number; watched: number };
  drift: { path: string; message: string }[];
  guideFiles: number;
  checks: number;
}

type HarnessUnavailableAvailability = 'app-only' | 'no-source' | 'reading' | 'unreadable';

type HarnessDetail =
  | (HarnessDetailBase & { availability: 'measured'; evidence: HarnessCoverageEvidence })
  | (HarnessDetailBase & { availability: HarnessUnavailableAvailability; evidence: null });

const EMPTY_DOCS: readonly VaultDoc[] = [];
const EMPTY_LEDGER: readonly RoundPassEntry[] = [];
type WikiRoundPass = RoundPassEntry & { outcome: Exclude<RoundPassEntry['outcome'], 'reviewed'> };

function isWikiRoundPass(entry: RoundPassEntry): entry is WikiRoundPass {
  return entry.kind !== 'ontology' && entry.outcome !== 'reviewed';
}
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

  const [seenAt, writeSeenAt, undoSeenAt] = useBriefSeenAt(identityScope);
  // Read once per load, inside the loader below, so no render calls the clock.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const anchor = useMemo(() => resolveBriefAnchor(seenAt, nowMs), [seenAt, nowMs]);
  /*
   * Marking the visit moves the read instant with it. Without that, the new anchor is not yet
   * in the past by the clock this render captured, `resolveBriefAnchor` falls back to the
   * default window, and the one state-changing control on the tab leaves every sentence
   * exactly as it was — the reader cannot tell it worked (design-interaction, 2026-09-19).
   */
  const markSeen = useCallback(() => {
    const at = Date.now();
    writeSeenAt(at);
    setNowMs(at + 1);
  }, [writeSeenAt]);
  /*
   * The same press, taken back. The read instant moves with it for the same reason it moves
   * forward above: the restored anchor has to be in the past by the clock this render holds, or
   * the sentences stay where the mark left them.
   */
  const undoSeen = useCallback(() => {
    undoSeenAt();
    setNowMs(Date.now());
  }, [undoSeenAt]);
  /* Read straight through on every render. Both presses write through `useBriefSeenAt`, whose
     `useSyncExternalStore` subscription re-renders this hook, so the answer is never one press
     behind — and memoising it would only add a dependency list that has to repeat that fact. */
  const canUndoSeen = canUndoBriefSeenAt(identityScope);
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

  /*
   * Where each concept's evidence lives, from the vault alone: its own `path:` and the
   * `path:` of every element it lists. The Git bridge then answers, in one walk, when each of
   * those and the concept's own document last changed.
   */
  const evidenceConcepts = useMemo<EvidenceConceptInput[]>(() => {
    const pathBySlug = new Map<string, string>();
    for (const doc of docs) {
      const path = doc.frontmatter.path;
      if (typeof path === 'string' && path.length > 0) pathBySlug.set(doc.slug, path);
    }
    const out: EvidenceConceptInput[] = [];
    for (const node of nodes) {
      if (!node.docSlug) continue;
      const doc = docs.find((candidate) => candidate.slug === node.docSlug);
      if (!doc) continue;
      const own = pathBySlug.get(doc.slug);
      const elements = Array.isArray(doc.frontmatter.elements)
        ? (doc.frontmatter.elements as unknown[]).filter((slug): slug is string => typeof slug === 'string')
        : [];
      const paths = new Set<string>();
      if (own) paths.add(own);
      for (const slug of elements) {
        const path = pathBySlug.get(slug);
        if (path) paths.add(path);
      }
      out.push({ id: node.id, docPath: `${doc.slug}.md`, evidencePaths: [...paths] });
    }
    return out;
  }, [docs, nodes]);

  const [evidenceChanges, setEvidenceChanges] = useState<{
    key: string;
    changes: ReadonlyMap<string, GitPathLastChange> | null;
  } | null>(null);
  const evidenceKey = nativeRootPath ? `${nativeRootPath}\0${vault.lastLoadedAt ?? ''}` : '';
  useEffect(() => {
    if (!enabled || !nativeRootPath || !isGitBridgeAvailable()) return;
    const repoPaths = [...new Set(evidenceConcepts.flatMap((concept) => concept.evidencePaths))];
    const vaultPaths = evidenceConcepts.map((concept) => concept.docPath).filter((path): path is string => path != null);
    if (repoPaths.length === 0) return;
    let cancelled = false;
    const key = evidenceKey;
    void gitPathsLastChange(nativeRootPath, repoPaths, vaultPaths)
      .then((rows) => {
        if (cancelled) return;
        setEvidenceChanges({ key, changes: rows ? new Map(rows.map((row) => [row.path, row])) : null });
      })
      .catch(() => {
        if (!cancelled) setEvidenceChanges({ key, changes: null });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, nativeRootPath, evidenceKey, evidenceConcepts]);
  const evidence = useMemo(() => {
    if (nativeRootPath && evidenceConcepts.every((concept) => concept.evidencePaths.length === 0)) {
      return resolveEvidenceStates(evidenceConcepts, new Map());
    }
    if (!evidenceChanges?.changes || evidenceChanges.key !== evidenceKey) return null;
    return resolveEvidenceStates(evidenceConcepts, evidenceChanges.changes);
  }, [evidenceChanges, evidenceKey, evidenceConcepts, nativeRootPath]);
  const evidenceAvailability = !isGitBridgeAvailable()
    ? 'app-only'
    : harnessState.status === 'no-source'
      ? 'no-source'
      : evidenceChanges?.key === evidenceKey && evidenceChanges.changes === null
        ? 'unreadable'
        : 'reading';

  /*
   * When this concept document last changed — from Git where the walk reached it, from the
   * file otherwise. A checkout stamps every file with the moment it landed, so in a fresh
   * worktree the file answer said all 106 concepts had changed this week (measured in the
   * installed app, 2026-09-19). Git knows better and the walk already asked it.
   */
  const docChangedAt = useCallback(
    (slug: string, fallback: string | null) => {
      const fromGit = evidenceChanges?.key === evidenceKey
        ? evidenceChanges.changes?.get(`${slug}.md`)?.lastChangedAt ?? null
        : null;
      return fromGit ?? fallback;
    },
    [evidenceChanges, evidenceKey],
  );

  const docFacts = useMemo(() => {
    const map = new Map<string, { reviewedBy: string | null; updatedAt: string | null }>();
    for (const doc of docs) {
      const reviewedBy = doc.frontmatter.reviewed_by;
      map.set(doc.slug, {
        reviewedBy: typeof reviewedBy === 'string' && reviewedBy.length > 0 ? reviewedBy : null,
        updatedAt: docChangedAt(doc.slug, doc.updatedAt ?? null),
      });
    }
    return map;
  }, [docs, docChangedAt]);

  const ontology = useMemo(
    () =>
      buildOntologyBrief({
        nodes,
        docs: docFacts,
        evidence,
        evidenceAvailability,
        repairCount,
        unmatchedCount,
        anchorMs: anchor.anchorMs,
      }),
    [nodes, docFacts, evidence, evidenceAvailability, repairCount, unmatchedCount, anchor.anchorMs],
  );

  const libraryDetail = useMemo(() => {
    const byPath = new Map(library.sources.map((source) => [source.path, source] as const));
    const stalePages = library.wikiPages
      .map((page) => ({
        slug: page.slug,
        sources: page.sourcePaths.filter((path) => {
          const state = byPath.get(path)?.state;
          return state === 'stale' || state === 'partial';
        }),
      }))
      .filter((row) => row.sources.length > 0);
    return {
      availability: (library.wikiPages.length === 0 && library.sources.length === 0
        ? 'no-data'
        : 'measured') as BriefCore['availability'],
      pageCount: library.wikiPages.length,
      sourceCount: library.sources.length,
      stalePages,
      unwrittenSources: library.sources.filter((source) => source.state === 'not-compiled').map((source) => source.path),
      findings: library.structural.groups.map((group) => ({
        code: group.code,
        advisory: group.advisory,
        count: group.count,
        pages: group.pages,
      })),
      unmeasured: library.structural.unmeasured.length,
      passes: ledger
        // Ontology reviews share the sidecar ledger but do not belong to the Documents lane.
        .filter((entry) => entry.kind !== 'ontology' && entry.outcome !== 'asleep')
        .slice(-6)
        .reverse()
        .map((entry) => ({
          endedAt: entry.endedAt,
          outcome: entry.outcome,
          checked: entry.checked,
          written: entry.written.length,
          summary: entry.summary,
        })),
    };
  }, [library.sources, library.wikiPages, library.structural, ledger]);

  const wiki = useMemo(() => {
    const orphan = library.structural.groups.find((group) => group.code === 'orphan-page');
    const dangling = library.structural.groups.find((group) => group.code === 'dangling-wikilink');
    return buildWikiBrief({
      sources: library.sources,
      pages: library.wikiPages,
      folderProblems: { orphanPages: orphan?.count ?? 0, danglingLinks: dangling?.count ?? 0 },
      lint: lintCountsFromSummary(library.log.lastLint?.summary),
      // `reviewed` is the ontology lane's read-only outcome; the wiki brief only accepts
      // document-round outcomes. Old entries have no kind and remain valid wiki passes.
      passes: ledger.filter(isWikiRoundPass),
      log,
      anchorMs: anchor.anchorMs,
    });
  }, [library.sources, library.wikiPages, library.structural, library.log.lastLint, ledger, log, anchor.anchorMs]);

  const harness = useMemo(() => {
    if (!harnessReport) {
      const state = harnessState.status === 'loading'
        ? 'reading'
        : harnessState.status === 'failed'
          ? 'unreadable'
          : harnessState.status === 'no-source'
            ? 'no-source'
            : 'browser';
      return buildHarnessBrief({ areas: null, state, driftCount: null, fileTimes: null, guideFileCount: null, anchorMs: anchor.anchorMs });
    }
    const matrix = buildCoverageMatrix(harnessReport.coverage, coverage.areas, harnessReport.testFiles);
    return buildHarnessBrief({
      areas: matrix.areas,
      driftCount: harnessReport.analysis.drift.length,
      fileTimes: harnessReport.times.map((time) => ({ path: time.path, mtimeMs: time.lastModified })),
      guideFileCount: harnessReport.guideDocumentCount,
      anchorMs: anchor.anchorMs,
    });
  }, [harnessReport, harnessState.status, coverage.areas, anchor.anchorMs]);

  const harnessDetail = useMemo(() => {
    if (!harnessReport) {
      const availability: HarnessUnavailableAvailability = harnessState.status === 'loading'
        ? 'reading'
        : harnessState.status === 'failed'
          ? 'unreadable'
          : harnessState.status === 'no-source'
            ? 'no-source'
            : 'app-only';
      return {
        availability,
        areas: [],
        everywhere: { told: 0, gated: 0, watched: 0 },
        drift: [],
        guideFiles: 0,
        checks: 0,
        evidence: null,
      };
    }
    const matrix = buildCoverageMatrix(harnessReport.coverage, coverage.areas, harnessReport.testFiles);
    const evidence = projectHarnessCoverageEvidence(matrix);
    return {
      availability: 'measured' as const,
      areas: evidence.areas.map((area) => ({
        slug: area.slug,
        title: area.title,
        told: area.roles.told.declarations.length,
        gated: area.roles.gated.declarations.length,
        watched: area.roles.watched.declarations.length,
      })),
      everywhere: {
        told: evidence.everywhere.told.length,
        gated: evidence.everywhere.gated.length,
        watched: evidence.everywhere.watched.length,
      },
      drift: harnessReport.analysis.drift.map((finding) => ({ path: finding.path, message: finding.message })),
      guideFiles: harnessReport.guideDocumentCount,
      checks: harnessReport.checks.total,
      evidence,
    };
  }, [harnessReport, harnessState.status, coverage.areas]);

  const agent = useMemo(
    () =>
      buildAgentBrief({
        entries: mode === 'local' ? vault.agentActivityLog : [],
        receipts: mode === 'local' ? vault.acpWorkReceipts : [],
        isWriteTool: (tool) => atlasBareToolMode(tool) === 'write',
        anchorMs: anchor.anchorMs,
      }),
    [mode, vault.agentActivityLog, vault.acpWorkReceipts, anchor.anchorMs],
  );

  /*
   * The evidence lines name what they count. A count with no way to reach the file and the
   * date sends a reader back to the agent's summary — the failure this tab exists to end
   * (PO evidence seat, 2026-09-19).
   */
  const details = useMemo(
    () =>
      evidence
        ? buildEvidenceDetails({
            rows: evidence.rows,
            titleById: new Map(nodes.map((node) => [node.id, node.title ?? node.id] as const)),
          })
        : new Map<string, BriefLineDetail[]>(),
    [evidence, nodes],
  );

  const sinceList = useMemo(
    () =>
      buildSinceList({
        docs: docs.map((doc) => ({
          slug: doc.slug,
          title: resolveLocaleDisplayName(doc.frontmatter, locale, doc.title),
          kind: typeof doc.frontmatter.kind === 'string' ? doc.frontmatter.kind : null,
          updatedAt: docChangedAt(doc.slug, doc.updatedAt ?? null),
        })),
        wikiLog: log,
        guideFiles: (harnessReport?.times ?? []).map((time) => ({ path: time.path, mtimeMs: time.lastModified })),
        agentCalls: mode === 'local' ? vault.agentActivityLog : [],
        anchorMs: anchor.anchorMs,
      }),
    [docs, docChangedAt, log, harnessReport, locale, mode, vault.agentActivityLog, anchor.anchorMs],
  );

  return {
    anchor,
    sinceDays,
    nowMs,
    markSeen,
    undoSeen,
    canUndoSeen,
    ontology,
    wiki,
    harness,
    agent,
    since: sinceList.rows,
    sinceTotal: sinceList.total,
    details,
    library: libraryDetail,
    harnessDetail,
  };
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
