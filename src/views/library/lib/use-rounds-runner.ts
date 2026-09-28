"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";

import { buildLibraryModel, isWikiPage, selectWikiPages, type VaultDoc, type VaultSourceFile } from "@/entities/docs-vault";
import {
  type RoundLedger,
  type RoundPassEntry,
  type RoundRecord,
  type RoundState,
  type RoundStore,
  type RoundUndone,
  createVaultFileRoundStore,
  createVaultRoundLedger,
  dueOnThisClock,
  isRoundDue,
  nextDueAt,
  roundFingerprint,
  roundPlaceLabels,
  roundPlaces,
  servicePlaces,
  vaultPlace,
} from "@/entities/library-round";
import { useAgentServer, useLocalVault } from "@/entities/vault-session";
import {
  type AcpTurnCompletion,
  type AcpTurnStart,
  VAULT_MCP_SERVER_NAME,
  atlasToolMode,
  connectorAcpServers,
  isGuardedRuntime,
  runtimeOwnsWriteGate,
  useAcpSession,
  vaultMcpServers,
  vaultSelfReadSlot,
} from "@/features/acp-session";
import { appendWikiLog, buildCompileBrief, deleteWikiFile, judgePageWrite, writeWikiFile } from "@/features/library";
import {
  TICK_MS,
  afterPass,
  buildServiceRoundBrief,
  buildOntologyRoundBrief,
  createPassPages,
  judgeRoundScope,
  pageIdentity,
  passLedgerFacts,
  planTick,
  readOrMissing,
  runConsistencyPass,
  scopeNoteEffect,
  settlePassPages,
  triggerFor,
  type PassPages,
  type ScopeRequest,
} from "@/features/library-rounds";
import type { RoundUnrecorded, RoundsRunnerValue, RoundsStoreStatus } from "@/features/library-rounds";
import { useVaultConnectors } from "@/features/mcp-connectors";
import { forgetApproval, readMachineApprovals, recordApproval, useMachineApprovals } from "@/shared/lib/machine-approvals";
import { detectAcpRuntimes, isAcpBridgeAvailable } from "@/shared/lib/tauri-acp";
import { getTauriVaultRootPath, nativeVaultFileHashes, readTauriVaultText } from "@/shared/lib/tauri-vault-fs";
import { parseFrontmatter } from "@/shared/lib/parse-frontmatter";
import { selectOpenVaultHandle } from "@/shared/lib/select-open-vault-handle";
import { useLatestRef } from "@/shared/lib/use-latest-ref";
import { isWikiFurnitureSlug } from "@/shared/lib/wiki-page-schema";

import { runHeadlessTurn } from "./headless-turn";

/**
 * **The clock and the hands** — the one place a round actually runs.
 *
 * Spec: `docs/specs/2026-09-17-library-rounds-design.md` §5, §6. Decision:
 * `docs/records/decisions/2026-09-17-library-rounds-standing-scope-*.md`.
 *
 * Mounted once, app-wide, through `LibraryRoundsProvider`, so a round runs whichever screen
 * is open. Every minute it asks `planTick` what to do and does exactly that: records a sleep gap,
 * runs the rounds that are due one at a time, local ones first. A pass is either the local
 * consistency check alone (no agent, no cost) or that check followed by one agent turn, or, for a
 * service round, one agent turn. The agent session is headless: it opens for the pass, its
 * permission requests are answered by the standing scope, and it is stopped when the turn ends.
 *
 * Nothing here decides *what* a pass may do; `judgeRoundScope` does, and this hook only wires
 * the judge into `useAcpSession`'s `autoDecide` and writes what it saw into the ledger.
 *
 * ## Why the WebView and not Rust
 *
 * The measured session and permission path is this one (`use-acp-session.ts`), and the page
 * judge, the compile brief and the library model are TypeScript. A Rust scheduler would have to
 * carry all four across the bridge, and it would only buy running with the window closed, which
 * this slice does not promise (§5, "only while open").
 *
 * A clone can arrive with a round on, overdue, its focus bound for an unattended brief, so a
 * round runs only once this Mac allowed its exact definition (`roundFingerprint`).
 */

interface PassData {
  sources: readonly VaultSourceFile[];
  docs: readonly VaultDoc[];
  hashes: Map<string, string>;
  pageTexts: Map<string, string>;
  pages: PassPages;
  knownSources: Set<string>;
}

function citedSourcePaths(docs: readonly VaultDoc[]): string[] {
  const out = new Set<string>();
  for (const doc of docs) {
    if (!isWikiPage(doc)) continue;
    const value = doc.frontmatter.sources;
    const list = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
    for (const path of list) if (typeof path === "string" && path.trim()) out.add(path.trim());
  }
  return [...out];
}

const EMPTY_ROUNDS: RoundRecord[] = [];
const NO_IDS: ReadonlySet<string> = new Set();
const NO_UNRECORDED: ReadonlyMap<string, RoundUnrecorded> = new Map();
const SCHEDULE_FILE = ".ontology-atlas/rounds.json";
const LEDGER_FILE = ".ontology-atlas/rounds-ledger.jsonl";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function useRoundsRunner(): RoundsRunnerValue {
  const vault = useLocalVault();
  const locale = useLocale();
  const handle = selectOpenVaultHandle(vault.status, vault.handle);
  const rootPath = handle ? getTauriVaultRootPath(handle) ?? null : null;
  const store: RoundStore | null = useMemo(() => (handle && rootPath ? createVaultFileRoundStore(handle) : null), [handle, rootPath]);
  const ledger: RoundLedger | null = useMemo(() => (handle && rootPath ? createVaultRoundLedger(handle) : null), [handle, rootPath]);

  const [storeStatus, setStoreStatus] = useState<RoundsStoreStatus>("no-vault");
  const [state, setState] = useState<RoundState | null>(null);
  const [entries, setEntries] = useState<RoundPassEntry[]>([]);
  const [running, setRunning] = useState<RoundsRunnerValue['running']>(null);
  const [lastTickAt, setLastTickAt] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const stateRef = useRef<RoundState | null>(null);
  const runningRef = useRef<RoundsRunnerValue['running']>(null);
  const lastTickRef = useRef<Date | null>(null);
  const heldDueRef = useRef(new Map<string, string>());
  const [unrecorded, setUnrecorded] = useState<ReadonlyMap<string, RoundUnrecorded>>(NO_UNRECORDED);
  const manifestRef = useLatestRef(vault.manifest);
  const codexRegisteredCommand = vault.agentConfigStatus?.codexRegisteredCommand ?? null;
  const codexConfigValid = vault.agentConfigStatus?.codexConfigValid === true;

  const refresh = useCallback(async () => {
    await Promise.resolve();
    if (!store || !ledger) {
      setStoreStatus("no-vault");
      setState(null);
      stateRef.current = null;
      setEntries([]);
      return;
    }
    const [read, lines] = await Promise.all([store.read(), ledger.read().catch(() => [] as RoundPassEntry[])]);
    const now = new Date();
    const held = heldDueRef.current;
    const rounds: RoundRecord[] = [];
    for (const round of read.state.rounds) {
      const kept = held.get(round.id);
      if (kept !== undefined && Date.parse(round.nextDueAt) >= Date.parse(kept)) held.delete(round.id);
      let due = held.get(round.id) ?? dueOnThisClock(round, now);
      if (due !== round.nextDueAt && !held.has(round.id)) {
        const seen = round.nextDueAt;
        const moved = await store.patch(round.id, (current) => (current.nextDueAt === seen ? { nextDueAt: due } : {}));
        if (moved.status !== "saved") held.set(round.id, due);
        else due = moved.state.rounds.find((entry) => entry.id === round.id)?.nextDueAt ?? due;
        due = held.get(round.id) ?? due;
      }
      rounds.push(due === round.nextDueAt ? round : { ...round, nextDueAt: due });
    }
    const current: RoundState = { ...read.state, rounds };
    setStoreStatus(read.status);
    setState(current);
    stateRef.current = current;
    setEntries(lines);
    setRevision((value) => value + 1);
  }, [ledger, store]);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, [refresh]);

  /* ---- The agent, headless ------------------------------------------------------------ */

  const agentServer = useAgentServer();
  const connectors = useVaultConnectors(handle);
  const [runtime, setRuntime] = useState<{ id: string; label: string } | null>(null);
  useEffect(() => {
    if (!isAcpBridgeAvailable()) return;
    let cancelled = false;
    const apply = (list: Awaited<ReturnType<typeof detectAcpRuntimes>>) => {
      if (cancelled) return;
      const usable = (list ?? []).find(
        (candidate) => candidate.state === "ready" && candidate.verified && isGuardedRuntime(candidate.id, candidate.isolated),
      );
      setRuntime(usable ? { id: usable.id, label: usable.label } : null);
    };
    /*
     * The same two-step scan the Library runs: the fast pass names the tools on disk, and
     * only the login probe turns `login-unknown` into `ready`. Measured in the installed
     * app on 2026-09-17: with the fast pass alone every redraft was skipped as "no agent".
     */
    void detectAcpRuntimes()
      .then((fast) => {
        apply(fast);
        return detectAcpRuntimes({ probeLogin: true });
      })
      .then(apply)
      .catch(() => {
        if (!cancelled) setRuntime(null);
      });
    return () => {
      cancelled = true;
    };
  }, [rootPath]);

  const runtimeId = runtime?.id ?? null;
  const mcpServers = useMemo(() => {
    const registration =
      vaultSelfReadSlot(runtimeId) === "codex-config"
        ? {
            command: codexRegisteredCommand,
            validForCurrentVault: codexConfigValid,
          }
        : null;
    return [
      ...vaultMcpServers(agentServer.launch, rootPath, registration, { ownsWriteGate: runtimeOwnsWriteGate(runtimeId) }),
      ...connectorAcpServers(connectors.connectors, runtimeId, connectors.allowedHere),
    ];
  }, [agentServer.launch, connectors.allowedHere, connectors.connectors, rootPath, runtimeId, codexConfigValid, codexRegisteredCommand]);

  // Read live, not from a render's snapshot, so a stale closure cannot run an unallowed round.
  const allowedNow = useCallback(
    (round: RoundRecord) => readMachineApprovals().approves("round", rootPath, round.id, roundFingerprint(round)),
    [rootPath],
  );

  const agentReady = Boolean(runtimeId && rootPath && agentServer.launch);

  const activeRef = useRef<{ round: RoundRecord; data: PassData } | null>(null);
  const completionRef = useRef<((completion: AcpTurnCompletion) => void) | null>(null);

  const autoDecide = useCallback((request: ScopeRequest & { title?: string | null }) => {
    const active = activeRef.current;
    if (!active || !rootPath) return { reject: "no-round" };
    const verdict = judgeRoundScope({
      request,
      round: {
        kind: active.round.kind,
        onStale: active.round.onStale,
        connectorName: active.round.connectorName,
        connectorNames: servicePlaces(roundPlaces(active.round)).map((place) => place.connectorName),
      },
      vaultRoot: rootPath,
      vaultServerName: VAULT_MCP_SERVER_NAME,
      atlasToolMode,
      judgeWrite: (req) => {
        const page = judgePageWrite({
          request: req,
          vaultRoot: rootPath,
          currentText: (slug) => active.data.pages.current(`${slug}.md`),
          knownSources: active.data.knownSources,
        });
        return page && !active.data.pages.conflict(page.path) ? page : null;
      },
    });
    if (verdict.decision !== "allow") return { reject: verdict.reason };
    if (verdict.wrote?.text != null) active.data.pages.commit(verdict.wrote.path, verdict.wrote.text);
    else if (verdict.wrote) active.data.knownSources.add(verdict.wrote.path);
    return verdict.note;
  }, [rootPath]);

  const onTurnStarted = useCallback((_turn: AcpTurnStart) => {
    return (completion: AcpTurnCompletion) => {
      completionRef.current?.(completion);
    };
  }, []);

  const session = useAcpSession({
    runtimeId: runtimeId ?? "",
    vaultRoot: rootPath,
    mcpServers,
    approvalSettleMs: 0,
    autoDecide,
    onTurnStarted,
  });
  const statusRef = useRef(session.status);
  const sessionRef = useRef(session);
  useEffect(() => {
    statusRef.current = session.status;
    sessionRef.current = session;
  }, [session]);

  const abortRef = useRef<{ roundId: string; stop: () => void } | null>(null);

  const stopPassFor = useCallback((roundId: string) => {
    const abort = abortRef.current;
    if (!abort || abort.roundId !== roundId) return false;
    abort.stop();
    return true;
  }, []);

  const agentTurn = useCallback(async (
    brief: string,
    aborted: Promise<void>,
  ): Promise<{ failed: boolean; written: string[]; refused: string[]; called: string[]; answer: string | null }> => {
    const done = new Promise<AcpTurnCompletion | null>((resolve) => {
      completionRef.current = resolve;
    });
    const { failed, completion } = await runHeadlessTurn({
      session: () => sessionRef.current,
      status: () => statusRef.current,
      brief,
      aborted,
      completion: done,
    });
    completionRef.current = null;
    const written: string[] = [];
    const refused: string[] = [];
    const called: string[] = [];
    const answer = [...(completion?.events ?? [])]
      .reverse()
      .find((event) => event.kind === "agent")?.text
      ?.replace(/\s+/g, " ")
      .trim()
      .slice(0, 280) ?? null;
    for (const event of completion?.events ?? []) {
      if (event.kind !== "notice") continue;
      if (event.text === "auto-allowed" && event.detail) {
        const effect = scopeNoteEffect(event.detail);
        if (effect?.effect === "write") written.push(effect.target);
        if (effect?.effect === "call") called.push(effect.target);
      }
      if (event.text === "auto-refused" && event.detail) refused.push(event.detail);
    }
    return {
      failed,
      written: [...new Set(written)],
      refused: [...new Set(refused)],
      called: [...new Set(called)],
      answer,
    };
  }, []);

  /* ---- One pass ----------------------------------------------------------------------- */

  const readPassData = useCallback(async (): Promise<PassData | null> => {
    const manifest = manifestRef.current;
    if (!manifest || !rootPath) return null;
    const docs = manifest.docs;
    const sources = manifest.sources ?? [];
    const hashes = (await nativeVaultFileHashes(rootPath, citedSourcePaths(docs))) ?? new Map<string, string>();
    const start: { path: string; text: string | null }[] = [];
    for (const page of selectWikiPages(docs)) {
      if (isWikiFurnitureSlug(page.slug)) continue;
      start.push({ path: `${page.slug}.md`, text: await readTauriVaultText(rootPath, `${page.slug}.md`).catch(() => null) });
    }
    const pageTexts = new Map(start.flatMap((page) => (page.text === null ? [] : [[page.path.slice(0, -3), page.text] as const])));
    return { sources, docs, hashes, pageTexts, pages: createPassPages(start), knownSources: new Set(sources.map((source) => source.path)) };
  }, [manifestRef, rootPath]);

  const runPass = useCallback(async (round: RoundRecord, trigger: RoundPassEntry["trigger"]) => {
    if (!store || !ledger || !rootPath || !handle || runningRef.current) return;
    // Every way into a pass comes through here.
    if (!allowedNow(round)) return;
    const vault = handle;
    const startedAt = new Date();
    const mark = (phase: NonNullable<RoundsRunnerValue['running']>['phase']) => {
      const next: NonNullable<RoundsRunnerValue['running']> = { roundId: round.id, roundName: round.name, startedAt: startedAt.toISOString(), phase };
      runningRef.current = next;
      setRunning(next);
    };
    mark("checking");
    let stoppedByPerson = false;
    const aborted = new Promise<void>((resolve) => {
      abortRef.current = {
        roundId: round.id,
        stop: () => {
          stoppedByPerson = true;
          resolve();
        },
      };
    });
    const places = roundPlaces(round);
    const watched = vaultPlace(places);
    const services = servicePlaces(places);
    const base = { v: 1 as const, id: newId(), roundId: round.id, roundName: round.name, kind: round.kind, startedAt: startedAt.toISOString(), places: roundPlaceLabels(places), trigger };
    let entry: RoundPassEntry;
    try {
      /*
       * An ontology round reads the graph through the vault MCP, not the folder manifest, so it
       * opens with an empty pass set: nothing local to hash, nothing local to compile.
       */
      const data: PassData | null = round.kind === "ontology"
        ? { sources: [], docs: [], hashes: new Map<string, string>(), pageTexts: new Map<string, string>(), pages: createPassPages([]), knownSources: new Set<string>() }
        : await readPassData();
      if (!data) throw new Error("no-manifest");
      const fromService = new Set<string>();
      if (watched.ownDocumentsOnly) {
        for (const source of data.sources) {
          if (!source.path.endsWith(".md")) continue;
          try {
            const text = await readTauriVaultText(rootPath, source.path);
            if (text && typeof parseFrontmatter(text).frontmatter.source_url === "string") fromService.add(source.path);
          } catch {
            /* Unreadable here means "not proven to come from a service"; the check still judges it. */
          }
        }
      }
      const check =
        round.kind === "consistency"
          ? runConsistencyPass({ ...data, paths: watched.paths, ownDocumentsOnly: watched.ownDocumentsOnly, fromService })
          : null;
      /** No local library model for an ontology round: it reads the graph, not the folder. */
      const model = round.kind === "ontology"
        ? null
        : buildLibraryModel({ sources: data.sources, docs: data.docs, hashes: data.hashes });
      let written: string[] = [];
      let refused: string[] = [];
      let called: string[] = [];
      let answer: string | null = null;
      let undone: RoundUndone[] = [];
      let failed = false;
      let agentTurns: 0 | 1 = 0;
      let note: RoundPassEntry["note"];
      /** Service round: the documents this pass was sent to refresh — what `checked` counts there. */
      let refreshed = 0;
      const turn = async (brief: string): Promise<Awaited<ReturnType<typeof agentTurn>> & { undone: RoundUndone[]; agentTurns: 0 | 1 }> => {
        if (stoppedByPerson || !allowedNow(round)) {
          stoppedByPerson = true;
          return { failed: true, written: [], refused: [], called: [], answer: null, undone: [], agentTurns: 0 };
        }
        activeRef.current = { round, data };
        mark("agent");
        const result = await agentTurn(brief, aborted);
        activeRef.current = null;
        const settled = await settlePassPages({
          pages: data.pages,
          read: readOrMissing(vault, (path) => readTauriVaultText(rootPath, path)),
          restore: (path, text) => writeWikiFile(vault, path, text),
          remove: (path) => deleteWikiFile(vault, path),
        });
        return { ...result, undone: settled, agentTurns: 1 };
      };

      if (round.kind === "consistency" && check) {
        const redraft = round.onStale !== "mark" && check.staleSources.length > 0;
        if (redraft && !(agentReady && runtimeId)) note = "no-agent";
        if (redraft && agentReady && runtimeId) {
          const brief = buildCompileBrief({
            sources: model!.sources.filter((row) => check.staleSources.includes(row.path)),
            existingPages: model!.wikiPages,
            locale,
            execution: "acp",
            writerId: `agent:${runtimeId}`,
            vaultRoot: rootPath,
            hashes: data.hashes,
            now: new Date(),
          });
          ({ failed, written, refused, called, answer, undone, agentTurns } = await turn(brief));
        }
      } else if (round.kind === "service") {
        if (!agentReady || !runtimeId) {
          failed = true;
          note = "no-agent";
        } else {
          const knownSources: string[] = [];
          for (const source of data.sources) {
            if (!source.path.endsWith(".md")) continue;
            try {
              const text = await readTauriVaultText(rootPath, source.path);
              if (text && typeof parseFrontmatter(text).frontmatter.source_url === "string") knownSources.push(source.path);
            } catch {
              /* Not readable: not a document this round refreshes. */
            }
          }
          refreshed = knownSources.length;
          const roundSources = new Set(knownSources);
          const brief = buildServiceRoundBrief({
            places: services,
            vaultRoot: rootPath,
            knownSources,
            vaultPaths: watched.paths,
            limit: round.limit,
            compileBrief: buildCompileBrief({
              sources: model!.sources.filter((row) => roundSources.has(row.path)),
              existingPages: model!.wikiPages,
              locale,
              execution: "acp",
              writerId: `agent:${runtimeId}`,
              vaultRoot: rootPath,
              hashes: data.hashes,
              now: new Date(),
            }),
            now: new Date(),
          });
          ({ failed, written, refused, called, answer, undone, agentTurns } = await turn(brief));
        }
      } else {
        /*
         * Ontology round: one read-only refinement review. The brief forbids every write tool,
         * so the turn's product is the answer it comes back with, not a file.
         */
        if (!agentReady || !runtimeId) {
          failed = true;
          note = "no-agent";
        } else {
          const brief = buildOntologyRoundBrief({ vaultRoot: rootPath, locale, focus: round.query });
          ({ failed, written, refused, called, answer, undone, agentTurns } = await turn(brief));
        }
      }
      const putBack = new Set(undone.filter((item) => item.action !== "failed").map((item) => pageIdentity(item.path)));
      const kept = written.filter((path) => !putBack.has(pageIdentity(path)));
      const { outcome, checked, stale } = passLedgerFacts({
        kind: round.kind,
        check,
        refreshed,
        failed: failed || undone.length > 0,
        written: kept,
        refused,
      });
      entry = {
        ...base,
        endedAt: new Date().toISOString(),
        outcome,
        checked,
        stale,
        written: kept,
        refused,
        called,
        agentTurns,
        summary: round.kind === "ontology" && !failed ? answer ?? "" : "",
      };
      if (undone.length > 0) entry.undone = undone;
      if (stoppedByPerson) entry.note = "stopped";
      else if (note) entry.note = note;
    } catch (error) {
      entry = {
        ...base,
        endedAt: new Date().toISOString(),
        outcome: "failed",
        checked: 0,
        stale: [],
        written: [],
        refused: [],
        called: [],
        agentTurns: 0,
        summary: error instanceof Error ? error.message : String(error),
      };
      if (stoppedByPerson) entry.note = "stopped";
    } finally {
      activeRef.current = null;
      abortRef.current = null;
    }
    const record = async () => {
      const endedAt = new Date(entry.endedAt);
      let next = afterPass(round, endedAt);
      const advanced = await store
        .patch(round.id, (current) => {
          next = afterPass(current, endedAt);
          return { lastPassAt: next.lastPassAt, nextDueAt: next.nextDueAt };
        })
        .catch(() => null);
      const files: string[] = [];
      if (advanced?.status === "saved") heldDueRef.current.delete(round.id);
      else {
        heldDueRef.current.set(round.id, next.nextDueAt);
        files.push(SCHEDULE_FILE);
      }
      const logged = await ledger.append(entry).then(() => true, () => false);
      if (!logged) files.push(LEDGER_FILE);
      setUnrecorded((current) => {
        if (files.length === 0 && !current.has(round.id)) return current;
        const changed = new Map(current);
        if (files.length > 0) changed.set(round.id, { endedAt: entry.endedAt, outcome: entry.outcome, files });
        else changed.delete(round.id);
        return changed;
      });
      const pages = entry.written.filter((path) => path.startsWith("wiki/")).map((path) => path.replace(/^wiki\//, "").replace(/\.md$/, ""));
      if (handle && pages.length > 0) {
        const sources = round.kind === "consistency" ? entry.stale.map((slug) => slug.replace(/^wiki\//, "")).join(", ") : (round.connectorName ?? round.name);
        await appendWikiLog(handle, {
          at: entry.endedAt,
          kind: "compile",
          summary: `${sources} → ${pages.map((page) => `${page} (revised)`).join(", ")}`,
          writer: `round:${round.name}`,
        }).catch(() => undefined);
      }
    };
    try {
      await record().catch(() => undefined);
      await refresh();
    } finally {
      runningRef.current = null;
      setRunning(null);
    }
  }, [agentReady, agentTurn, allowedNow, handle, ledger, locale, readPassData, refresh, rootPath, runtimeId, store]);

  /* ---- The clock ---------------------------------------------------------------------- */

  const tick = useCallback(async () => {
    if (!store || !ledger) return;
    const now = new Date();
    const plan = planTick({
      rounds: stateRef.current?.rounds ?? [],
      now,
      lastTickAt: lastTickRef.current,
      running: runningRef.current !== null,
      allowedHere: allowedNow,
      ready: (round) => round.kind === "ontology" || manifestRef.current !== null,
    });
    lastTickRef.current = now;
    setLastTickAt(now.toISOString());
    if (plan.asleep) {
      await ledger.append({
        v: 1,
        id: newId(),
        startedAt: plan.asleep.from.toISOString(),
        endedAt: plan.asleep.to.toISOString(),
        outcome: "asleep",
        checked: 0,
        stale: [],
        written: [],
        refused: [],
        called: [],
        agentTurns: 0,
        summary: "",
        trigger: "clock",
      }).catch(() => undefined);
      await refresh();
    }
    for (const planned of plan.due) {
      if (runningRef.current) break;
      const round = stateRef.current?.rounds.find((entry) => entry.id === planned.id);
      if (!round || !isRoundDue(round, new Date()) || !allowedNow(round)) continue;
      await runPass(round, triggerFor(round, now));
    }
  }, [allowedNow, ledger, manifestRef, refresh, runPass, store]);

  const tickRef = useRef(tick);
  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  useEffect(() => {
    if (!store) {
      lastTickRef.current = null;
      return;
    }
    const first = setTimeout(() => void tickRef.current(), 2_000);
    const timer = setInterval(() => void tickRef.current(), TICK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [store]);

  useEffect(() => {
    if (!store || typeof document === "undefined") return;
    const onVisibility = () => {
      const at = new Date().toISOString();
      if (document.visibilityState === "hidden") {
        void store.markAway(at).then(() => refresh());
      } else {
        void store.markBack(at).then(() => refresh()).then(() => tickRef.current());
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [refresh, store]);

  /* ---- Actions ------------------------------------------------------------------------ */

  const save = useCallback(async (round: RoundRecord) => {
    if (!store) return { ok: false, startedNow: false };
    const result = await store.upsert(round);
    if (result.status === "saved") recordApproval("round", rootPath, round.id, roundFingerprint(round));
    await refresh();
    const startedNow = result.status === "saved" && round.kind === "consistency" && round.enabled && !runningRef.current;
    if (startedNow) void runPass(round, "manual");
    return { ok: result.status === "saved", startedNow };
  }, [refresh, rootPath, runPass, store]);

  const remove = useCallback(async (id: string) => {
    if (!store) return false;
    stopPassFor(id);
    heldDueRef.current.delete(id);
    const result = await store.remove(id);
    if (result.status === "saved") forgetApproval("round", rootPath, id);
    await refresh();
    return result.status === "saved";
  }, [refresh, rootPath, stopPassFor, store]);

  const update = useCallback(async (next: RoundRecord) => {
    if (!store) return false;
    const before = stateRef.current?.rounds.find((entry) => entry.id === next.id);
    if (!before) return false;
    const prior = readMachineApprovals().allowed("round", rootPath, next.id);
    if (roundFingerprint(before) !== roundFingerprint(next)) stopPassFor(next.id);
    recordApproval("round", rootPath, next.id, roundFingerprint(next));
    heldDueRef.current.delete(next.id);
    const result = await store.patch(next.id, {
      name: next.name,
      kind: next.kind,
      cadence: next.cadence,
      places: next.places,
      onStale: next.onStale,
      query: next.query,
      connectorId: next.connectorId,
      connectorName: next.connectorName,
      limit: next.limit,
      nextDueAt: next.nextDueAt,
    }).catch(() => null);
    const saved = result?.status === "saved";
    if (!saved && prior) recordApproval("round", rootPath, next.id, prior);
    else if (!saved) forgetApproval("round", rootPath, next.id);
    await refresh();
    return saved;
  }, [refresh, rootPath, stopPassFor, store]);

  const setEnabled = useCallback(async (id: string, enabled: boolean) => {
    if (!store) return false;
    if (!enabled) stopPassFor(id);
    else heldDueRef.current.delete(id);
    const shown = stateRef.current?.rounds.find((entry) => entry.id === id);
    if (enabled && shown) recordApproval("round", rootPath, id, roundFingerprint(shown));
    const now = new Date();
    const change: Partial<RoundRecord> = { enabled };
    if (enabled && shown && !(Date.parse(shown.nextDueAt) > now.getTime())) {
      change.nextDueAt = nextDueAt(shown.cadence, now).toISOString();
    }
    const result = await store.patch(id, change);
    await refresh();
    return result.status === "saved";
  }, [refresh, rootPath, stopPassFor, store]);

  const runNow = useCallback((id: string) => {
    const round = stateRef.current?.rounds.find((entry) => entry.id === id);
    if (!round || runningRef.current) return;
    void runPass(round, "manual");
  }, [runPass]);

  // The clock looks at once, so an overdue round runs now rather than at the next minute.
  const allow = useCallback((id: string) => {
    const round = stateRef.current?.rounds.find((entry) => entry.id === id);
    if (!round) return false;
    const allowed = recordApproval("round", rootPath, id, roundFingerprint(round));
    if (allowed) void tickRef.current();
    return allowed;
  }, [rootPath]);

  const rounds = state?.rounds ?? EMPTY_ROUNDS;
  const approvals = useMachineApprovals();
  const notAllowedHere = useMemo(() => {
    const ids = rounds
      .filter((round) => !approvals.approves("round", rootPath, round.id, roundFingerprint(round)))
      .map((round) => round.id);
    return ids.length > 0 ? new Set(ids) : NO_IDS;
  }, [approvals, rootPath, rounds]);
  const changedSinceAllowed = useMemo(() => {
    const ids = [...notAllowedHere].filter((id) => approvals.allowed("round", rootPath, id) !== null);
    return ids.length > 0 ? new Set(ids) : NO_IDS;
  }, [approvals, notAllowedHere, rootPath]);
  const connectorIsOnHere = connectors.isOnHere;
  const connectorRows = useMemo(
    () => connectors.connectors.map((connector) => ({ id: connector.id, name: connector.name, enabled: connectorIsOnHere(connector) })),
    [connectorIsOnHere, connectors.connectors],
  );

  return {
    storeStatus,
    state,
    rounds,
    ledger: entries,
    running,
    agentReady,
    agentLabel: runtime?.label ?? null,
    connectors: connectorRows,
    lastTickAt,
    revision,
    notAllowedHere,
    changedSinceAllowed,
    unrecorded,
    allow,
    save,
    update,
    remove,
    setEnabled,
    runNow,
    refresh,
  };
}
