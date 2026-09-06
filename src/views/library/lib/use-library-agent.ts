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
import { useAgentServer, useLocalVault } from "@/entities/vault-session";
import {
  hostOfBaseUrl,
  isLocalEndpointReady,
  readLocalEndpoint,
  subscribeLocalEndpointChange,
} from "@/shared/lib/local-endpoint";
import { detectAcpRuntimes, isAcpBridgeAvailable, type AcpRuntimeStatus } from "@/shared/lib/tauri-acp";
import { isLlmChatBridgeAvailable } from "@/shared/lib/tauri-llm";

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
 * ⚠️ **`local` is a named brain, not a second Compile engine today.** Compile's brief
 * tells the writer to open a PDF, a spreadsheet and a Word file with its own tools and to
 * write `wiki/<topic>.md`; the local runner reaches Atlas through the vault agent's tool
 * catalogue, which reads and proposes **ontology concepts only** — it has no tool that
 * opens a source and none that writes a page, and its one consent card carries concept
 * changes. Wiring Compile to it would either hand a model a filename and print whatever
 * it invented, or write a file outside the boundary a person approves. Both are refused.
 * `localModel` therefore feeds the label and the transfer sentence, and Compile keeps
 * saying exactly which brain it needs. See `docs/DECISIONS.md`, 2026-09-06.
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

export function useLibraryAgent(vaultRoot: string | null) {
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
  useEffect(() => {
    const read = () => {
      const settings = readLocalEndpoint();
      if (!isLlmChatBridgeAvailable() || !isLocalEndpointReady(settings)) {
        setLocalModel(null);
        return;
      }
      const host = hostOfBaseUrl(settings.baseUrl);
      setLocalModel({ model: settings.model, host, onThisComputer: isLoopbackHost(host) });
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
  const route: LibraryAgentRoute =
    !bridgeAvailable && localModel
      ? "local"
      : !bridgeAvailable
        ? "unavailable"
        : !runtimesChecked || !serverCheckComplete
          ? "checking"
          : runtime && vaultRoot && agentServer.launch !== null
            ? "agent"
            : localModel
              ? "local"
              : "unavailable";

  const start = useCallback((text: string) => {
    setOpeningRequest((current) => ({
      kind: "compile",
      text,
      nonce: (current?.nonce ?? 0) + 1,
    }));
    setOpen(true);
  }, []);

  return {
    route,
    localModel,
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
