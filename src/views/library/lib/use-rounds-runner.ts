"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";

import { buildLibraryModel, isWikiPage, selectWikiPages, type VaultDoc, type VaultSourceFile } from "@/entities/docs-vault";
import {
  type RoundLedger,
  type RoundPassEntry,
  type RoundPassOutcome,
  type RoundRecord,
  type RoundState,
  type RoundStore,
  createVaultFileRoundStore,
  createVaultRoundLedger,
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
  judgeRoundScope,
  planTick,
  runConsistencyPass,
  scopeNoteEffect,
  triggerFor,
  type ScopeRequest,
} from "@/features/library-rounds";
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

type RoundsStoreStatus = "no-vault" | "loading" | "ok" | "missing" | "malformed" | "unavailable";

interface RoundsRunning {
  roundId: string;
  roundName: string;
  startedAt: string;
  phase: "checking" | "agent";
}

export interface RoundsRunnerValue {
  /** Native folder only. `no-vault` in the browser and before a folder is open. */
  storeStatus: RoundsStoreStatus;
  state: RoundState | null;
  rounds: RoundRecord[];
  ledger: RoundPassEntry[];
  running: RoundsRunning | null;
  /** A guarded coding agent is ready to take a turn; without it a redraft or a service pass cannot run. */
  agentReady: boolean;
  agentLabel: string | null;
  /** Names of connectors switched on for this folder, so the sheet can offer them. */
  connectors: { id: string; name: string; enabled: boolean }[];
  lastTickAt: string | null;
  /** Bumps on every ledger or state write, so a screen can re-read without a folder watcher. */
  revision: number;
  save(round: RoundRecord): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  setEnabled(id: string, enabled: boolean): Promise<boolean>;
  runNow(id: string): void;
  refresh(): Promise<void>;
}

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

function outcomeOf(input: {
  failed: boolean;
  written: string[];
  refused: string[];
  stale: string[];
}): RoundPassOutcome {
  if (input.failed) return "failed";
  if (input.written.length > 0) return "redrafted";
  if (input.refused.length > 0) return "refused";
  if (input.stale.length > 0) return "stale";
  return "held";
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
  const [running, setRunning] = useState<RoundsRunning | null>(null);
  const [lastTickAt, setLastTickAt] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const stateRef = useRef<RoundState | null>(null);
  const runningRef = useRef<RoundsRunning | null>(null);
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
      round: { kind: active.round.kind, onStale: active.round.onStale, connectorName: active.round.connectorName },
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

  /** Open a session, send one brief, wait for the turn, close. Returns what the turn did. */
  const agentTurn = useCallback(async (brief: string): Promise<{ failed: boolean; written: string[]; refused: string[]; called: string[] }> => {
    const current = sessionRef.current;
    const done = new Promise<AcpTurnCompletion | null>((resolve) => {
      completionRef.current = resolve;
    });
    let failed = false;
    try {
      await current.start();
      const deadline = Date.now() + READY_WAIT_MS;
      while (statusRef.current !== "ready") {
        if (statusRef.current === "error" || statusRef.current === "exited" || Date.now() > deadline) {
          failed = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
      }
      if (!failed) {
        const timeout = setTimeout(() => sessionRef.current.cancel(), PASS_TIMEOUT_MS);
        try {
          await sessionRef.current.send(brief);
        } finally {
          clearTimeout(timeout);
        }
      }
    } catch {
      failed = true;
    }
    const completion = failed ? null : await Promise.race([done, new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000))]);
    completionRef.current = null;
    try {
      await sessionRef.current.stop();
    } catch {
      /* A session that would not stop is reported by the next start; nothing to do here. */
    }
    const written: string[] = [];
    const refused: string[] = [];
    const called: string[] = [];
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
      failed: failed || !completion || completion.outcome !== "completed",
      written: [...new Set(written)],
      refused: [...new Set(refused)],
      called: [...new Set(called)],
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
    const mark = (phase: RoundsRunning["phase"]) => {
      const next = { roundId: round.id, roundName: round.name, startedAt: startedAt.toISOString(), phase };
      runningRef.current = next;
      setRunning(next);
    };
    mark("checking");
    let entry: RoundPassEntry;
    try {
      const data = await readPassData();
      if (!data) throw new Error("no-manifest");
      const check = runConsistencyPass(data);
      const model = buildLibraryModel({ sources: data.sources, docs: data.docs, hashes: data.hashes });
      let written: string[] = [];
      let refused: string[] = [];
      let called: string[] = [];
      let failed = false;
      let agentTurns: 0 | 1 = 0;
      let note: RoundPassEntry["note"];

      if (round.kind === "consistency") {
        const redraft = round.onStale !== "mark" && check.staleSources.length > 0;
        if (redraft && !(agentReady && runtimeId)) note = "no-agent";
        if (redraft && agentReady && runtimeId) {
          activeRef.current = { round, data };
          mark("agent");
          agentTurns = 1;
          const brief = buildCompileBrief({
            sources: model.sources.filter((row) => check.staleSources.includes(row.path)),
            existingPages: model.wikiPages,
            locale,
            execution: "acp",
            writerId: `agent:${runtimeId}`,
            vaultRoot: rootPath,
            hashes: data.hashes,
            now: new Date(),
          });
          ({ failed, written, refused, called } = await agentTurn(brief));
        }
      } else {
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
          const brief = buildServiceRoundBrief({
            serviceLabel: round.connectorName ?? round.name,
            connectorName: round.connectorName ?? "",
            vaultRoot: rootPath,
            knownSources,
            query: round.query ?? "",
            limit: round.limit,
            compileBrief: buildCompileBrief({
              sources: model.sources,
              existingPages: model.wikiPages,
              locale,
              execution: "acp",
              writerId: `agent:${runtimeId}`,
              vaultRoot: rootPath,
              hashes: data.hashes,
              now: new Date(),
            }),
            now: new Date(),
          });
          ({ failed, written, refused, called } = await agentTurn(brief));
        }
      }
      const stale = check.stalePages;
      entry = {
        v: 1,
        id: newId(),
        roundId: round.id,
        roundName: round.name,
        kind: round.kind,
        startedAt: startedAt.toISOString(),
        endedAt: new Date().toISOString(),
        outcome: outcomeOf({ failed, written, refused, stale }),
        checked: check.checked,
        stale,
        written,
        refused,
        called,
        agentTurns,
        summary: "",
        trigger,
      };
      if (note) entry.note = note;
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
        agentTurns: 0,
        summary: error instanceof Error ? error.message : String(error),
        trigger,
      };
    } finally {
      activeRef.current = null;
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
    if (!store) return false;
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
    if (result.status === "saved" && round.kind === "consistency" && round.enabled && !runningRef.current) {
      void runPass(round, "manual");
    }
    return result.status === "saved";
  }, [refresh, runPass, store]);

  const remove = useCallback(async (id: string) => {
    if (!store) return false;
    const result = await store.remove(id);
    await refresh();
    return result.status === "saved";
  }, [refresh, store]);

  const setEnabled = useCallback(async (id: string, enabled: boolean) => {
    if (!store) return false;
    const result = await store.patch(id, { enabled });
    await refresh();
    return result.status === "saved";
  }, [refresh, store]);

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
