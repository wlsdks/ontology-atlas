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
  createVaultFileRoundStore,
  createVaultRoundLedger,
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
import { appendWikiLog, buildCompileBrief, judgePageWrite } from "@/features/library";
import {
  TICK_MS,
  afterPass,
  buildServiceRoundBrief,
  buildOntologyRoundBrief,
  judgeRoundScope,
  passLedgerFacts,
  planTick,
  runConsistencyPass,
  scopeNoteEffect,
  triggerFor,
  type ScopeRequest,
} from "@/features/library-rounds";
import type { RoundsRunnerValue, RoundsStoreStatus } from "@/features/library-rounds";
import { useVaultConnectors } from "@/features/mcp-connectors";
import { detectAcpRuntimes, isAcpBridgeAvailable } from "@/shared/lib/tauri-acp";
import { getTauriVaultRootPath, nativeVaultFileHashes, readTauriVaultText } from "@/shared/lib/tauri-vault-fs";
import { parseFrontmatter } from "@/shared/lib/parse-frontmatter";
import { selectOpenVaultHandle } from "@/shared/lib/select-open-vault-handle";
import { isWikiFurnitureSlug } from "@/shared/lib/wiki-page-schema";

/**
 * **The clock and the hands** — the one place a round actually runs.
 *
 * Spec: `docs/superpowers/specs/2026-09-17-library-rounds-design.md` §5, §6. Decision:
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
 */

const PASS_TIMEOUT_MS = 20 * 60_000;
const READY_POLL_MS = 250;
const READY_WAIT_MS = 90_000;

interface PassData {
  sources: readonly VaultSourceFile[];
  docs: readonly VaultDoc[];
  hashes: Map<string, string>;
  pageTexts: Map<string, string>;
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
  const manifestRef = useRef(vault.manifest);
  useEffect(() => {
    manifestRef.current = vault.manifest;
  }, [vault.manifest]);

  const refresh = useCallback(async () => {
    // Always a turn later than the effect that asked, so a folder change never sets state
    // synchronously inside an effect body.
    await Promise.resolve();
    if (!store || !ledger) {
      setStoreStatus("no-vault");
      setState(null);
      stateRef.current = null;
      setEntries([]);
      return;
    }
    const [read, lines] = await Promise.all([store.read(), ledger.read().catch(() => [] as RoundPassEntry[])]);
    setStoreStatus(read.status);
    setState(read.state);
    stateRef.current = read.state;
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
            command: vault.agentConfigStatus?.codexRegisteredCommand ?? null,
            validForCurrentVault: vault.agentConfigStatus?.codexConfigValid === true,
          }
        : null;
    return [
      ...vaultMcpServers(agentServer.launch, rootPath, registration, { ownsWriteGate: runtimeOwnsWriteGate(runtimeId) }),
      ...connectorAcpServers(connectors.connectors, runtimeId),
    ];
  }, [agentServer.launch, connectors.connectors, rootPath, runtimeId, vault.agentConfigStatus?.codexConfigValid, vault.agentConfigStatus?.codexRegisteredCommand]);

  const agentReady = Boolean(runtimeId && rootPath && agentServer.launch);

  /** The round whose pass is in flight, for the scope judge and the page judge. */
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
        // Every connector the round's places name, so a pass that watches Slack and
        // Confluence is not refused halfway through its one turn (spec §3.2).
        connectorNames: servicePlaces(roundPlaces(active.round)).map((place) => place.connectorName),
      },
      vaultRoot: rootPath,
      vaultServerName: VAULT_MCP_SERVER_NAME,
      atlasToolMode,
      judgeWrite: (req) =>
        judgePageWrite({
          request: req,
          vaultRoot: rootPath,
          currentText: (slug) => active.data.pageTexts.get(slug) ?? null,
          knownSources: active.data.sources.map((source) => source.path),
        }),
    });
    return verdict.decision === "allow" ? verdict.note : { reject: verdict.reason };
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

  /**
   * **A pass that is no longer wanted ends now, not in twenty minutes.** Removing or pausing a
   * round whose pass is in flight used to leave the header saying "running now · <name>" for a
   * round that no longer existed, and, worse, `runningRef` stayed set, so every other round's
   * pass was blocked until `PASS_TIMEOUT_MS`. The resolver below is what `remove` and a pause
   * pull: it cancels the agent turn and the pass writes one ledger line noting it was stopped.
   */
  const abortRef = useRef<{ roundId: string; stop: () => void } | null>(null);

  const stopPassFor = useCallback((roundId: string) => {
    const abort = abortRef.current;
    if (!abort || abort.roundId !== roundId) return false;
    abort.stop();
    return true;
  }, []);

  /** Open a session, send one brief, wait for the turn, close. Returns what the turn did. */
  const agentTurn = useCallback(async (
    brief: string,
    aborted: Promise<void>,
  ): Promise<{ failed: boolean; written: string[]; refused: string[]; called: string[]; answer: string | null }> => {
    const current = sessionRef.current;
    const done = new Promise<AcpTurnCompletion | null>((resolve) => {
      completionRef.current = resolve;
    });
    let failed = false;
    let stopped = false;
    void aborted.then(() => {
      stopped = true;
      try {
        sessionRef.current.cancel();
      } catch {
        /* A session already gone cannot be cancelled twice; the stop below still runs. */
      }
    });
    try {
      await current.start();
      const deadline = Date.now() + READY_WAIT_MS;
      while (statusRef.current !== "ready") {
        if (stopped || statusRef.current === "error" || statusRef.current === "exited" || Date.now() > deadline) {
          failed = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
      }
      if (!failed) {
        const timeout = setTimeout(() => sessionRef.current.cancel(), PASS_TIMEOUT_MS);
        try {
          // The abort wins the race so the pass returns at once; the cancelled turn's own
          // rejection is swallowed by the catch below, and `stop()` still runs after it.
          await Promise.race([sessionRef.current.send(brief), aborted]);
        } finally {
          clearTimeout(timeout);
        }
      }
    } catch {
      failed = true;
    }
    const completion = failed || stopped ? null : await Promise.race([done, new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000))]);
    completionRef.current = null;
    try {
      await sessionRef.current.stop();
    } catch {
      /* A session that would not stop is reported by the next start; nothing to do here. */
    }
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
      failed: stopped || failed || !completion || completion.outcome !== "completed",
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
    const pageTexts = new Map<string, string>();
    for (const page of selectWikiPages(docs)) {
      if (isWikiFurnitureSlug(page.slug)) continue;
      try {
        const text = await readTauriVaultText(rootPath, `${page.slug}.md`);
        if (text !== null) pageTexts.set(page.slug, text);
      } catch {
        /* An unreadable page has no verdict this pass; the next one may read it. */
      }
    }
    return { sources, docs, hashes, pageTexts };
  }, [rootPath]);

  const runPass = useCallback(async (round: RoundRecord, trigger: RoundPassEntry["trigger"]) => {
    if (!store || !ledger || !rootPath || runningRef.current) return;
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
    let entry: RoundPassEntry;
    try {
      /*
       * An ontology round reads the graph through the vault MCP, not the folder manifest, so it
       * opens with an empty pass set: nothing local to hash, nothing local to compile.
       */
      const data: PassData | null = round.kind === "ontology"
        ? { sources: [], docs: [], hashes: new Map<string, string>(), pageTexts: new Map<string, string>() }
        : await readPassData();
      if (!data) throw new Error("no-manifest");
      /*
       * **Only a consistency round runs the consistency check.** It is the whole of that
       * round's verdict, and it is none of a service round's: a service pass that re-read four
       * documents and changed nothing used to wear `stale · N` in the ledger, counting pages it
       * never looked at, because the check ran for every pass and fed the outcome either way.
       * An ontology round has no local check at all; its verdict comes from its one turn.
       */
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
      let failed = false;
      let agentTurns: 0 | 1 = 0;
      let note: RoundPassEntry["note"];
      /** Service round: the documents this pass was sent to refresh — what `checked` counts there. */
      let refreshed = 0;

      if (round.kind === "consistency" && check) {
        const redraft = round.onStale !== "mark" && check.staleSources.length > 0;
        if (redraft && !(agentReady && runtimeId)) note = "no-agent";
        if (redraft && agentReady && runtimeId) {
          activeRef.current = { round, data };
          mark("agent");
          agentTurns = 1;
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
          ({ failed, written, refused, called, answer } = await agentTurn(brief, aborted));
        }
      } else if (round.kind === "service") {
        if (!agentReady || !runtimeId) {
          failed = true;
          note = "no-agent";
        } else {
          activeRef.current = { round, data };
          mark("agent");
          agentTurns = 1;
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
          /*
           * **The compile brief carries this round's documents, not the folder's.** With
           * `model.sources` the brief listed every local file in the vault as a target, so an
           * unattended service pass could be instructed to write wiki pages for documents that
           * have nothing to do with the connector it was approved for. The scope this round was
           * given is exactly the fetched set: the documents above, which are the ones under
           * `sources/` carrying a `source_url` this pass refreshes or adds.
           */
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
          ({ failed, written, refused, called, answer } = await agentTurn(brief, aborted));
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
          activeRef.current = { round, data };
          mark("agent");
          agentTurns = 1;
          const brief = buildOntologyRoundBrief({ vaultRoot: rootPath, locale, focus: round.query });
          ({ failed, written, refused, called, answer } = await agentTurn(brief, aborted));
        }
      }
      const { outcome, checked, stale } = passLedgerFacts({
        kind: round.kind,
        check,
        refreshed,
        failed,
        written,
        refused,
      });
      entry = {
        v: 1,
        id: newId(),
        roundId: round.id,
        roundName: round.name,
        kind: round.kind,
        startedAt: startedAt.toISOString(),
        endedAt: new Date().toISOString(),
        outcome,
        checked,
        stale,
        written,
        refused,
        called,
        places: roundPlaceLabels(places),
        agentTurns,
        summary: round.kind === "ontology" ? answer ?? "Read-only refinement review completed." : "",
        trigger,
      };
      if (stoppedByPerson) entry.note = "stopped";
      else if (note) entry.note = note;
    } catch (error) {
      entry = {
        v: 1,
        id: newId(),
        roundId: round.id,
        roundName: round.name,
        kind: round.kind,
        startedAt: startedAt.toISOString(),
        endedAt: new Date().toISOString(),
        outcome: "failed",
        checked: 0,
        stale: [],
        written: [],
        refused: [],
        called: [],
        places: roundPlaceLabels(places),
        agentTurns: 0,
        summary: error instanceof Error ? error.message : String(error),
        trigger,
      };
      if (stoppedByPerson) entry.note = "stopped";
    } finally {
      activeRef.current = null;
      abortRef.current = null;
    }
    try {
      await ledger.append(entry);
      await store.patch(round.id, afterPass(round, new Date()));
      /*
       * The wiki's own record stays complete (spec §8): a page a round wrote is a compile
       * event in `wiki/_log.md` like any other, with the round as the writer, so a person
       * reading the log in an editor sees who touched the page and when.
       */
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
    } finally {
      runningRef.current = null;
      setRunning(null);
      await refresh();
    }
  }, [agentReady, agentTurn, handle, ledger, locale, readPassData, refresh, rootPath, runtimeId, store]);

  /* ---- The clock ---------------------------------------------------------------------- */

  const tick = useCallback(async () => {
    if (!store || !ledger) return;
    const now = new Date();
    const plan = planTick({
      rounds: stateRef.current?.rounds ?? [],
      now,
      lastTickAt: lastTickRef.current,
      running: runningRef.current !== null,
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
      });
      await refresh();
    }
    for (const round of plan.due) {
      if (runningRef.current) break;
      await runPass(round, triggerFor(round, now));
    }
  }, [ledger, refresh, runPass, store]);

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
    await refresh();
    /*
     * **A local check runs once as it is saved** (owner, 2026-09-19: the screen was "hard
     * to operate"; measured on the installed app, a check saved at 21:35 showed nothing
     * until its 22:00 boundary or until a person found "run now"). A consistency pass costs
     * no agent turn, so the first result can stand on the screen before the sheet's close
     * animation ends. A service round spends a turn per pass; its first pass stays on the
     * clock the person just chose.
     */
    const startedNow = result.status === "saved" && round.kind === "consistency" && round.enabled && !runningRef.current;
    if (startedNow) void runPass(round, "manual");
    return { ok: result.status === "saved", startedNow };
  }, [refresh, runPass, store]);

  const remove = useCallback(async (id: string) => {
    if (!store) return false;
    /*
     * **Removing a round ends its pass.** Measured in the browser, 2026-09-21: the header kept
     * saying "running now · <name>" for a round that was gone, and the ghost held the one-pass
     * lock for the full twenty-minute timeout, so no other round could run. The pass is asked
     * to stop before the record leaves the file, and it writes one ledger line noting it.
     */
    stopPassFor(id);
    const result = await store.remove(id);
    await refresh();
    return result.status === "saved";
  }, [refresh, stopPassFor, store]);

  const setEnabled = useCallback(async (id: string, enabled: boolean) => {
    if (!store) return false;
    // Pausing is the same promise as removing: the round stops, including the pass in flight.
    if (!enabled) stopPassFor(id);
    const result = await store.patch(id, { enabled });
    await refresh();
    return result.status === "saved";
  }, [refresh, stopPassFor, store]);

  const runNow = useCallback((id: string) => {
    const round = stateRef.current?.rounds.find((entry) => entry.id === id);
    if (!round || runningRef.current) return;
    void runPass(round, "manual");
  }, [runPass]);

  const rounds = state?.rounds ?? [];
  const connectorRows = useMemo(
    () => connectors.connectors.map((connector) => ({ id: connector.id, name: connector.name, enabled: connector.enabled })),
    [connectors.connectors],
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
    save,
    remove,
    setEnabled,
    runNow,
    refresh,
  };
}
