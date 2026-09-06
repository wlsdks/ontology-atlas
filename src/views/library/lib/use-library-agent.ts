"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import {
  connectorAcpServers,
  isGuardedRuntime,
  runtimeOwnsWriteGate,
  vaultMcpServers,
  vaultSelfReadSlot,
} from "@/features/acp-session";
import { useVaultConnectors } from "@/features/mcp-connectors";
import { useLocalCompile } from "@/features/vault-agent";
import { useAgentServer, useLocalVault } from "@/entities/vault-session";
import {
  hostOfBaseUrl,
  isLocalEndpointReady,
  readLocalEndpoint,
  subscribeLocalEndpointChange,
} from "@/shared/lib/local-endpoint";
import { detectAcpRuntimes, isAcpBridgeAvailable, type AcpRuntimeStatus } from "@/shared/lib/tauri-acp";
import { isLlmChatBridgeAvailable } from "@/shared/lib/tauri-llm";

import type { LibrarySourceRow } from "@/entities/docs-vault";

import { resolveCompileBrain, useCompileBrainChoice } from "./compile-brain";
import type { LibraryAgentOpeningRequest, LibraryAgentRuntime } from "../ui/parts/LibraryAgentDock";

/**
 * Whether the Library can start an in-app agent turn, and everything needed to start one.
 *
 * The same wiring Analysis and Architecture already carry, and deliberately not a fourth
 * spelling of it: which runtimes are usable, which MCP servers the session gets, and
 * whether the folder's own server is up. Compile calls `start`; everything else here is
 * the honest answer to "can it".
 *
 * `route` is `agent` only when a verified runtime with an app-owned permission boundary
 * is ready **and** the folder has an absolute path **and** its MCP server can launch. Any
 * other combination returns `unavailable`, and the Compile button is simply not drawn —
 * a button that cannot act is worse than an absent one, because a person spends a click
 * finding that out.
 *
 * ## The local route (owner, 2026-09-06)
 *
 * *"for people who care about security, support a local LLM like Ollama … so it can run
 * on a local model."* The **address** for that already exists: Settings → AI connection's
 * connect-by-address path stores a base URL and a chosen model in
 * `@/shared/lib/local-endpoint`, and `llm_chat` sends to it with an audit line written
 * before the request leaves. So `route` gains `local`, and the shelf can name which brain
 * would answer instead of saying only that none can.
 *
 * ## `local` compiles (2026-09-06, second pass)
 *
 * The record above ended with its own reopening condition — *"a local tool catalogue that
 * reads a source and writes a page under one consent card reopens local Compile"* — and
 * that catalogue now exists: `read_source_text` opens a file this folder holds and this
 * bundle can decode, `propose_wiki_page` assembles a page and writes nothing, and one card
 * carries the page path, its sections, its citation count and both source lists before
 * anything lands. `useLocalCompile` runs that turn; `route` still decides only *who*
 * answers.
 *
 * Two boundaries stayed narrow, and both are visible on the shelf rather than assumed:
 * the live button needs a **loopback** runner, because after this pass whole documents
 * leave the process and "on this computer" has to be true rather than named; and a source
 * whose format needs a parser Atlas does not ship is not a target, so step two can reach
 * done instead of offering a turn it cannot finish.
 *
 * ## The brain is chosen, not ranked (owner, 2026-09-06)
 *
 * The first pass made the coding agent outrank the runner whenever both were installed.
 * On the owner's own machine both are, and the reason the runner is there at all is to be
 * chosen **deliberately for a folder whose documents should not leave it** — which a
 * precedence rule quietly takes away. So `resolveCompileBrain` turns the rank into a
 * default: both available draws one picker, the stored answer wins, and the coding agent
 * is what an unanswered folder gets. `route` follows that answer, and a stored answer
 * naming a brain this machine no longer offers falls back **and stops being stored**.
 */

const subscribeDesktopRuntime = () => () => undefined;
const readServerDesktopRuntime = () => false;

type LibraryAgentRoute = "checking" | "agent" | "local" | "unavailable";

/** The runner the connect-by-address path points at, once it is really usable. */
export interface LibraryLocalModel {
  /** The model the person picked from the runner's own list. */
  model: string;
  /** `localhost:11434` — the host and port, which is the whole of where it goes. */
  host: string;
  /**
   * Whether that host really is this machine.
   *
   * **The screen may not assume it.** `isLocalEndpointReady` asks only for a non-empty
   * address and a chosen model, and Rust's own guard (`src-tauri/src/llm.rs`,
   * `normalize_base_url`) refuses a plaintext non-loopback host but accepts an `https://`
   * one — so a saved `https://gpu.example.com/v1` is a valid connect-by-address runner
   * that is not on this computer. Printing "nothing leaves this computer" for it would be
   * the one sentence `.claude/rules/local-first.md` exists to keep true (PO evidence and
   * PO steward, 2026-09-06), so the sentence is chosen from this flag rather than from
   * the fact that the path is called local.
   */
  onThisComputer: boolean;
}

/** `localhost`, `127.0.0.1`, `[::1]` — the same host test `is_loopback_authority` makes. */
function isLoopbackHost(host: string): boolean {
  const bare = host.startsWith('[')
    ? (host.slice(1).split(']')[0] ?? '')
    : (host.split(':')[0] ?? '');
  const lowered = bare.toLowerCase();
  if (lowered === 'localhost' || lowered === '::1' || lowered === '0:0:0:0:0:0:0:1') return true;
  // IPv4 loopback is the whole 127.0.0.0/8 block, which is what `is_loopback` accepts.
  const octets = lowered.split('.');
  return (
    octets.length === 4 &&
    octets[0] === '127' &&
    octets.every((part) => part !== '' && /^\d{1,3}$/.test(part) && Number(part) <= 255)
  );
}

function selectLibraryAgentRuntimes(
  runtimes: readonly AcpRuntimeStatus[] | null | undefined,
): LibraryAgentRuntime[] {
  return (runtimes ?? [])
    .filter(
      (runtime) =>
        runtime.state === "ready" && runtime.verified && isGuardedRuntime(runtime.id, runtime.isolated),
    )
    .map(({ id, label }) => ({ id, label }));
}

export function useLibraryAgent(
  vaultRoot: string | null,
  sources: readonly LibrarySourceRow[] = [],
  compileLabels: {
    createFile: (path: string) => string;
    modifyFile: (path: string) => string;
    bridgeMissing: string;
  } = DEFAULT_COMPILE_LABELS,
) {
  const localVault = useLocalVault();
  const agentServer = useAgentServer();
  const bridgeAvailable = useSyncExternalStore(
    subscribeDesktopRuntime,
    isAcpBridgeAvailable,
    readServerDesktopRuntime,
  );
  const [runtimes, setRuntimes] = useState<LibraryAgentRuntime[]>([]);
  const [runtimeId, setRuntimeId] = useState<string | null>(null);
  const [runtimeCheckComplete, setRuntimeCheckComplete] = useState(false);
  const [open, setOpen] = useState(false);
  const [openingRequest, setOpeningRequest] = useState<LibraryAgentOpeningRequest | null>(null);
  /*
   * The address is entered on another surface (the settings sheet) and comes alive on
   * this one, so the same change event the map's dock listens to is what refreshes it —
   * without it a person saves a model and this screen keeps saying nothing is connected
   * until they reload.
   */
  const [localModel, setLocalModel] = useState<LibraryLocalModel | null>(null);
  /*
   * The address itself, kept beside the label. `readLocalEndpoint()` reads storage and
   * returns a fresh object every call, so reading it during render would hand the compile
   * hook a new identity on every frame; holding it in the same state the change event
   * already refreshes keeps one value per saved setting.
   */
  const [localEndpoint, setLocalEndpoint] = useState<{ baseUrl: string; model: string } | null>(null);
  useEffect(() => {
    const read = () => {
      const settings = readLocalEndpoint();
      if (!isLlmChatBridgeAvailable() || !isLocalEndpointReady(settings)) {
        setLocalModel(null);
        setLocalEndpoint(null);
        return;
      }
      const host = hostOfBaseUrl(settings.baseUrl);
      setLocalModel({ model: settings.model, host, onThisComputer: isLoopbackHost(host) });
      setLocalEndpoint((current) =>
        current && current.baseUrl === settings.baseUrl && current.model === settings.model
          ? current
          : { baseUrl: settings.baseUrl, model: settings.model },
      );
    };
    read();
    return subscribeLocalEndpointChange(read);
  }, []);

  useEffect(() => {
    // With no bridge there is nothing to detect, and `runtimesChecked` below reads that
    // as complete without a state write — a setState here would be a cascading render
    // saying only what `bridgeAvailable` already says.
    if (!bridgeAvailable) return;
    let cancelled = false;
    const apply = (list: Awaited<ReturnType<typeof detectAcpRuntimes>>) => {
      if (cancelled) return;
      const usable = selectLibraryAgentRuntimes(list);
      setRuntimes(usable);
      setRuntimeId((current) =>
        current && usable.some((runtime) => runtime.id === current) ? current : (usable[0]?.id ?? null),
      );
    };
    void detectAcpRuntimes()
      .then((fast) => {
        apply(fast);
        return detectAcpRuntimes({ probeLogin: true });
      })
      .then(apply)
      .catch(() => apply(null))
      .finally(() => {
        if (!cancelled) setRuntimeCheckComplete(true);
      });
    return () => {
      cancelled = true;
    };
  }, [bridgeAvailable]);

  const runtime = runtimes.find((candidate) => candidate.id === runtimeId) ?? null;
  /* The same list the map reads, from the same file — one folder, one set of attached tools. */
  const vaultConnectors = useVaultConnectors(localVault.handle);
  const mcpServers = useMemo(() => {
    const registration =
      vaultSelfReadSlot(runtimeId) === "codex-config"
        ? {
            command: localVault.agentConfigStatus?.codexRegisteredCommand ?? null,
            validForCurrentVault: localVault.agentConfigStatus?.codexConfigValid === true,
          }
        : null;
    return [
      ...vaultMcpServers(agentServer.launch, vaultRoot, registration, {
        ownsWriteGate: runtimeOwnsWriteGate(runtimeId),
      }),
      ...connectorAcpServers(vaultConnectors.connectors, runtimeId),
    ];
  }, [
    agentServer.launch,
    localVault.agentConfigStatus?.codexConfigValid,
    localVault.agentConfigStatus?.codexRegisteredCommand,
    runtimeId,
    vaultConnectors.connectors,
    vaultRoot,
  ]);

  const runtimesChecked = !bridgeAvailable || runtimeCheckComplete;
  const serverCheckComplete = agentServer.launch !== null || agentServer.reason !== null;
  /*
   * A coding agent outranks the local model because it is the only one of the two that
   * can actually finish Compile — it opens the sources itself and its writes stop at a
   * permission card. `local` is what is left when that is absent: a named brain the shelf
   * can point at rather than an empty step.
   */
  /*
   * Each brain's availability is asked separately now, because the picker needs both
   * answers rather than one winner. `checking` still comes first while the bridge is
   * present and the runtime scan is unfinished: naming a brain before the scan lands would
   * make the shelf change its mind under the reader.
   */
  const agentAvailable =
    bridgeAvailable && runtime !== null && vaultRoot !== null && agentServer.launch !== null;
  const localAvailable = localModel !== null;
  const { stored: storedBrain, choose: chooseBrain, forget: forgetBrain } = useCompileBrainChoice();
  const brainSettled = !bridgeAvailable || (runtimesChecked && serverCheckComplete);
  const brain = resolveCompileBrain({
    agentAvailable,
    localAvailable,
    stored: storedBrain,
  });

  /*
   * A stored answer for a brain that is gone is cleared once — but only after the scan
   * settles, or a transient "the agent is not ready yet" would erase a valid choice on
   * every launch.
   */
  useEffect(() => {
    if (brainSettled && brain.staleChoice) forgetBrain();
    // `forgetBrain` is the stable callback, not the hook's wrapper object: depending on
    // the object would rerun this effect on every render.
  }, [brain.staleChoice, brainSettled, forgetBrain]);

  const route: LibraryAgentRoute = !bridgeAvailable
    ? localAvailable
      ? "local"
      : "unavailable"
    : !runtimesChecked || !serverCheckComplete
      ? "checking"
      : (brain.brain ?? "unavailable");

  /**
   * The turn a connect-by-address runner actually runs. It is built in every route so the
   * hook's shape does not change under the caller, but `run` is reached only from `start`
   * on the `local` route — the work it costs (hashing, reading) happens on demand inside
   * the turn, never on render.
   */
  const localCompile = useLocalCompile({
    vaultRoot,
    endpoint: localEndpoint,
    sources,
    labels: compileLabels,
  });

  const start = useCallback(
    (text: string, kind: LibraryAgentOpeningRequest["kind"] = "compile") => {
      /*
       * One press, two engines. A verified coding agent still outranks the runner — it
       * opens formats Atlas cannot — so the dock keeps the press whenever one is ready,
       * and the local turn takes it only when that is what the shelf named. The runner
       * compiles only; a check, a proposal or an import is a coding agent's turn: the local
       * two-tool catalogue reads files already under `sources/` and cannot reach a service.
       */
      if (route === "local" && kind === "compile") {
        void localCompile.run(text);
        return;
      }
      setOpeningRequest((current) => ({
        kind,
        text,
        nonce: (current?.nonce ?? 0) + 1,
      }));
      setOpen(true);
    },
    [localCompile, route],
  );

  return {
    route,
    localModel,
    localCompile,
    /** Both brains are here, so the person picks. False draws today's static line. */
    brainChoosable: brain.choosable,
    /** The brain that will run, for the label and the transfer sentence. */
    brain: brain.brain,
    chooseBrain,
    runtime,
    runtimes,
    runtimeId,
    setRuntimeId,
    mcpServers,
    open,
    setOpen,
    openingRequest,
    start,
  };
}

/**
 * Fallbacks for a caller that has no translator to hand — a test, or a surface that never
 * reaches the card. The screen passes its own; these are never what a person reads.
 */
const DEFAULT_COMPILE_LABELS = {
  createFile: (path: string) => `create ${path}`,
  modifyFile: (path: string) => `edit ${path}`,
  bridgeMissing: "This can only run in the installed app.",
};
