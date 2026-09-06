"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import type { LibrarySourceRow } from "@/entities/docs-vault";
import { useLocalVault } from "@/entities/vault-session";
import { nativeVaultFileHashes } from "@/shared/lib/tauri-vault-fs";
import { llmChat, llmChatErrorMessage } from "@/shared/lib/tauri-llm";
import { LOCAL_PROVIDER } from "@/shared/lib/tauri-secrets";

import { runTurn, startTurn } from "./agent-loop";
import { compileAdapter } from "./compile-adapter";
import { buildCompileConsentCard, type CompileConsentCard } from "./compile-consent-card";
import { createCompileExecutor } from "./compile-executor";
import { buildCompileSystemPrompt } from "./compile-system-prompt";
import { COMPILE_ROUND_CAP, COMPILE_SOURCES_PER_TURN, COMPILE_TOOLS } from "./compile-tool-catalog";
import { applyProposal } from "./proposal-applier";
import type { SourceReadEntry, SourceReadPort } from "./source-read-port";
import { classifySourceFormat } from "./source-text";
import type { AgentTurn } from "./types";

/**
 * **Compile, run by the model on this computer.**
 *
 * The 2026-09-06 record left `local` as a named brain and wrote its own reopening
 * condition: *"a local tool catalogue that reads a source and writes a page under one
 * consent card reopens local Compile."* This hook is that catalogue's home on the screen.
 * It is deliberately not `use-vault-agent.ts`: that hook runs the ontology conversation,
 * with the ontology tool list, the ontology consent card and the ontology adapter's forced
 * first read. Sharing it would mean a job-kind branch through a file whose every rule was
 * written for a different job.
 *
 * What it does **not** own is the write. The turn produces proposals; `applyProposal` —
 * the one module in this repository that writes a consented proposal — is called from
 * `allow()`, and it reaches the folder through `useLocalVault`'s own `createDoc` /
 * `saveDoc`, the same path a person's own edit takes. There is no second write path here
 * to keep honest.
 */

type LocalCompileStatus = "idle" | "running" | "waiting" | "applying" | "written" | "failed";

export interface LocalCompileSession {
  status: LocalCompileStatus;
  /** The turn, for its tool rows. Null before the first run. */
  turn: AgentTurn | null;
  /** What the person is being asked to approve. Null until the turn ends. */
  card: CompileConsentCard | null;
  /** The one sentence shown when the turn or the write failed. */
  errorMessage: string | null;
  /** Pages actually written by the last `allow()`. */
  writtenPaths: string[];
  /** The files this turn would take on, already capped. */
  targets: string[];
  run: (brief: string) => Promise<void>;
  allow: () => Promise<void>;
  dismiss: () => void;
  stop: () => void;
}

export interface UseLocalCompileArgs {
  /** Absolute folder path. Null outside the installed app, where this route never runs. */
  vaultRoot: string | null;
  /** The runner the connect-by-address path points at. */
  endpoint: { baseUrl: string; model: string } | null;
  /** The library's own rows, already carrying their compile state. */
  sources: readonly LibrarySourceRow[];
  labels: {
    createFile: (path: string) => string;
    modifyFile: (path: string) => string;
    bridgeMissing: string;
  };
}

async function hashInBrowser(handle: FileSystemFileHandle): Promise<string | null> {
  // Same measurement `use-library-model.ts` makes for the shelf's own rows, and the same
  // honest null: a browser without a secure context has no digest, and a page that cannot
  // record what it read is refused rather than written with an empty `source_hash`.
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  try {
    const digest = await crypto.subtle.digest("SHA-256", await (await handle.getFile()).arrayBuffer());
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/**
 * Waiting sources this route can actually open.
 *
 * A PDF is left out rather than attempted. Sending a turn that can only come back saying
 * "this is a PDF" spends the person's time and their runner's on a fact the screen
 * already knows, and it leaves ② Compile offering a turn it cannot finish, folder visit
 * after folder visit (PO evidence, 2026-09-06). The shelf names those formats and points
 * at a coding agent instead.
 */
export function selectLocalCompileTargets(
  sources: readonly LibrarySourceRow[],
): LibrarySourceRow[] {
  return sources.filter(
    (row) =>
      (row.state === "not-compiled" || row.state === "stale") &&
      classifySourceFormat(row.format) === "readable",
  );
}

export function useLocalCompile({
  vaultRoot,
  endpoint,
  sources,
  labels,
}: UseLocalCompileArgs): LocalCompileSession {
  const vault = useLocalVault();
  const [status, setStatus] = useState<LocalCompileStatus>("idle");
  const [turn, setTurn] = useState<AgentTurn | null>(null);
  const [card, setCard] = useState<CompileConsentCard | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [writtenPaths, setWrittenPaths] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * The files this turn takes on: waiting sources this route can actually open, capped.
   *
   * A PDF is left out rather than attempted. Sending a turn that can only come back
   * saying "this is a PDF" spends the person's time and their model's on a fact the
   * screen already knows (PO evidence, 2026-09-06); the shelf says which formats need a
   * coding agent instead.
   */
  const targets = useMemo(
    () =>
      selectLocalCompileTargets(sources).map((row) => row.path).slice(0, COMPILE_SOURCES_PER_TURN),
    [sources],
  );

  const sourcePort: SourceReadPort = useMemo(() => {
    const entries: SourceReadEntry[] = sources.map((row) => ({
      path: row.path,
      name: row.name,
      format: row.format,
      bytes: row.bytes,
    }));
    return {
      sources: entries,
      async readSourceBytes(path) {
        const handle = vault.sourceHandles.get(path);
        if (!handle) return null;
        return (await handle.getFile()).arrayBuffer();
      },
      async hashSource(path) {
        // Whole-file sha256, never the capped slice: `deriveSourceState` compares a
        // page's recorded hash against the file's own, so a partial-bytes hash would
        // render a brand-new page stale the moment it landed.
        if (vaultRoot) {
          const native = await nativeVaultFileHashes(vaultRoot, [path]);
          const measured = native?.get(path);
          if (measured) return measured;
        }
        const handle = vault.sourceHandles.get(path);
        return handle ? hashInBrowser(handle) : null;
      },
    };
  }, [sources, vault.sourceHandles, vaultRoot]);

  const readExistingPage = useCallback(
    async (slug: string) => {
      const handle = vault.fileHandles.get(slug);
      if (!handle) return null;
      const doc = vault.manifest?.docs.find((candidate) => candidate.slug === slug);
      try {
        return { text: await (await handle.getFile()).text(), mtime: doc?.mtime ?? 0 };
      } catch {
        return null;
      }
    },
    [vault.fileHandles, vault.manifest],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus((current) => (current === "running" ? "idle" : current));
  }, []);

  const run = useCallback(
    async (brief: string) => {
      if (!vaultRoot || !endpoint) return;
      setStatus("running");
      setCard(null);
      setErrorMessage(null);
      setWrittenPaths([]);

      const executor = createCompileExecutor({
        sourcePort,
        model: endpoint.model,
        now: () => new Date(),
        readExistingPage,
        pageCap: COMPILE_SOURCES_PER_TURN,
      });
      const controller = new AbortController();
      abortRef.current = controller;

      const started = startTurn({
        text: brief,
        screenContext: {
          focusedSlug: null,
          focusedTitle: null,
          focusedKind: null,
          lenses: [],
          projectTitle: null,
          visibleNodeCount: 0,
        },
      });
      setTurn(started);

      try {
        const result = await runTurn(
          {
            adapter: compileAdapter,
            tools: COMPILE_TOOLS,
            roundCap: COMPILE_ROUND_CAP,
            system: buildCompileSystemPrompt({ model: endpoint.model, targets }),
            model: endpoint.model,
            notices: COMPILE_NOTICES,
            execute: (call) => executor.execute(call),
            async send({ body, scope, question, model }) {
              const echo = await llmChat({
                provider: LOCAL_PROVIDER,
                vaultPath: vaultRoot,
                model,
                question,
                body,
                scope,
                baseUrl: endpoint.baseUrl,
              });
              if (!echo) throw new Error(labels.bridgeMissing);
              return echo;
            },
          },
          started,
          { signal: controller.signal, onProgress: setTurn },
        );

        setTurn(result.turn);
        const built = buildCompileConsentCard(executor.proposals(), {
          // A save point belongs to the surfaces that own Git (settings, Atlas Git), the
          // same choice `use-vault-agent.ts` makes; when none can be taken the card says so
          // rather than implying one was.
          vaultIsGit: false,
          labels: { createFile: labels.createFile, modifyFile: labels.modifyFile },
        });
        setCard(built);
        /*
         * **A turn that proposed nothing still has to say so.** Going back to `idle` made
         * the running block disappear with nothing in its place — measured in the
         * installed app, 2026-09-06: the transfer had happened, the person had watched a
         * spinner, and the screen ended exactly where it started. The card stands with its
         * own sentence and no Allow, which is the honest end of that turn.
         */
        setStatus("waiting");
      } catch (error) {
        setErrorMessage(llmChatErrorMessage(error));
        setStatus("failed");
      } finally {
        abortRef.current = null;
      }
    },
    [endpoint, labels, readExistingPage, sourcePort, targets, vaultRoot],
  );

  const allow = useCallback(async () => {
    const proposal = card?.proposal;
    if (!proposal || status !== "waiting") return;
    // Lock before the await: without it a double press is two concurrent vault writes.
    setStatus("applying");
    const outcome = await applyProposal(
      proposal,
      {
        createDoc: (slug, content) => vault.createDoc(slug, content),
        saveDoc: (slug, content, options) => vault.saveDoc(slug, content, options ?? {}),
        currentMtime: (slug) => vault.manifest?.docs.find((doc) => doc.slug === slug)?.mtime,
        refresh: () => vault.refresh(),
        snapshot: async () => null,
      },
      { snapshotLabel: "compile" },
    );
    if (outcome.status === "applied") {
      setWrittenPaths(outcome.writtenPaths);
      setStatus("written");
      return;
    }
    setErrorMessage(
      outcome.status === "conflict"
        ? `${outcome.conflictedPaths.join(", ")}`
        : outcome.message,
    );
    setStatus("failed");
  }, [card, status, vault]);

  const dismiss = useCallback(() => {
    setCard(null);
    setErrorMessage(null);
    setWrittenPaths([]);
    setStatus("idle");
  }, []);

  return { status, turn, card, errorMessage, writtenPaths, targets, run, allow, dismiss, stop };
}

/**
 * The loop's closing lines.
 *
 * They are English rather than translated, and that is the honest choice here: each is a
 * sentence the model may be shown as its own instruction, and `system-prompt.ts` owns the
 * boundary that says the model channel is English. The person-facing copy for this
 * surface lives in `messages/*.json` and is drawn by the card.
 */
const COMPILE_NOTICES = {
  roundCap: "It ran out of rounds. What it proposed before that is below.",
  noToolCall: ({ round, cap }: { round: number; cap: number }) =>
    `It answered at round ${round} of ${cap} without opening a single file.`,
  aborted: "Stopped.",
  networkFailed: "The runner could not be reached.",
  timedOut: "The runner took too long to answer.",
  rateLimited: "The runner refused another request just now.",
  rejected: "The runner rejected the request.",
  auditBlocked: "The audit log could not be written, so nothing was sent.",
  providerRefused: "The runner refused to answer.",
  failed: "The turn failed.",
};
