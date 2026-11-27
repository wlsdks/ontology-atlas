"use client";

import { useCallback, useEffect, useState } from "react";

import { useLocalCompile } from "@/features/vault-agent";
import {
  hostOfBaseUrl,
  isLocalEndpointReady,
  readLocalEndpoint,
  subscribeLocalEndpointChange,
} from "@/shared/lib/llm-connection/local-endpoint";
import { isLlmChatBridgeAvailable } from "@/shared/lib/llm-connection/tauri-llm";
import { useVaultAgentRuntime } from "@/widgets/acp-chat-panel";

import type { LibrarySourceRow, WikiRetrievalPage } from "@/entities/docs-vault";

import { isLoopbackAuthority } from "@/shared/lib/llm-connection/loopback";
import { resolveCompileBrain, useCompileBrainChoice } from "../compile/compile-brain";
import type { LibraryAgentOpeningRequest } from "../../ui/agent/LibraryAgentDock";

/**
 * Whether the Library can start an in-app agent turn. `route` is `agent` only when a verified
 * runtime with an app-owned permission boundary is ready, the folder has an absolute path and its
 * MCP server can launch; `local` needs a loopback runner. `resolveCompileBrain` picks between them.
 */


type LibraryAgentRoute = "checking" | "agent" | "local" | "unavailable";

/** The runner the connect-by-address path points at, once it is really usable. */
export interface LibraryLocalModel {
  /** The model the person picked from the runner's own list. */
  model: string;
  /** `localhost:11434` — the host and port, which is the whole of where it goes. */
  host: string;
  /**
   * Whether that host really is this machine: Rust accepts `https://` non-loopback hosts, so the
   * sentence "nothing leaves this computer" must be chosen from this flag
   * (`.claude/rules/local-first.md`).
   */
  onThisComputer: boolean;
}

export function useLibraryAgent(
  vaultRoot: string | null,
  sources: readonly LibrarySourceRow[] = [],
  compileLabels: {
    createFile: (path: string) => string;
    modifyFile: (path: string) => string;
  } = DEFAULT_COMPILE_LABELS,
  wikiPages?: ReadonlyMap<string, WikiRetrievalPage>,
) {
  // Runtime, vault MCP server and connectors are read the one way every dock reads them.
  const vaultAgent = useVaultAgentRuntime(vaultRoot);
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
      setLocalModel({ model: settings.model, host, onThisComputer: isLoopbackAuthority(host) });
      setLocalEndpoint((current) =>
        current && current.baseUrl === settings.baseUrl && current.model === settings.model
          ? current
          : { baseUrl: settings.baseUrl, model: settings.model },
      );
    };
    read();
    return subscribeLocalEndpointChange(read);
  }, []);


  const { runtime, runtimes, runtimeId, setRuntimeId, mcpServers } = vaultAgent;

  const runtimesChecked = !vaultAgent.bridgeAvailable || vaultAgent.runtimeCheckComplete;
  const serverCheckComplete = vaultAgent.serverCheckComplete;
  const bridgeAvailable = vaultAgent.bridgeAvailable;
  /*
   * A coding agent outranks the local model because it is the only one of the two that
   * can actually finish Compile — it opens the sources itself and its writes stop at a
   * permission card. `local` is what is left when that is absent: a named brain the shelf
   * can point at rather than an empty step.
   */
  /*
   * Each brain's availability is asked separately, because the picker needs both answers. `checking`
   * comes first while the runtime scan is unfinished: naming a brain early would change under the reader.
   */
  const agentAvailable = vaultAgent.route === "agent";
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
    wikiPages,
  });

  const start = useCallback(
    (text: string, kind: LibraryAgentOpeningRequest["kind"] = "compile", sources?: readonly string[]) => {
      /*
       * One press, two engines. A verified coding agent still outranks the runner — it
       * opens formats Atlas cannot — so the dock keeps the press whenever one is ready,
       * and the local turn takes it only when that is what the shelf named. The runner
       * compiles only; a check, a proposal or an import is a coding agent's turn: the local
       * catalogue reads files already in the vault and cannot reach a service.
       */
      if (route === "local" && kind === "compile") {
        void localCompile.run(text, sources);
        return;
      }
      setOpeningRequest((current) => ({
        kind,
        text,
        nonce: (current?.nonce ?? 0) + 1,
        ...(sources ? { sources } : {}),
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
};
