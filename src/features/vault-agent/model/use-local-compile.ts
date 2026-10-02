"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { buildWikiRetrievalIndex, isWikiPage, sourceNeedsCompile, type LibrarySourceRow } from "@/entities/docs-vault";
import { isWikiFurnitureSlug } from "@/shared/lib/wiki-page-schema";
import { useLocalVault, useVaultSessionIdentityScope } from "@/entities/vault-session";
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
import type { AgentTurn, ToolCallRecord } from "./types";

/**
 * Compile run by the model on this computer, apart from `use-vault-agent.ts`'s ontology
 * conversation. Writes go only through `applyProposal` from `allow()`.
 */

type LocalCompileStatus = "idle" | "running" | "waiting" | "applying" | "written" | "failed";

export interface LocalCompileSession {
  status: LocalCompileStatus;
  /** Transient vault identity captured when this compile turn started, never the later current vault. */
  originVaultScope: string | null;
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
  /** A structured tool snapshot for the Library's bounded activity overlay. */
  toolActivity: {
    id: string;
    name: string;
    args: unknown;
    phase: "active" | "complete";
    outcome: ToolCallRecord["outcome"] | null;
  } | null;
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
  /** Existing Library read cache; no additional folder walk for retrieval. */
  wikiTexts?: ReadonlyMap<string, string>;
  labels: {
    createFile: (path: string) => string;
    modifyFile: (path: string) => string;
    bridgeMissing: string;
  };
}

async function hashReadBytes(bytes: ArrayBuffer): Promise<string | null> {
  // Same measurement and honest null as `use-library-model.ts`: a page that cannot record
  // what it read is refused rather than written with an empty `source_hash`.
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  try {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/** Waiting sources this route can open; a PDF is left out, and the shelf points it at a coding agent. */
export function selectLocalCompileTargets(
  sources: readonly LibrarySourceRow[],
): LibrarySourceRow[] {
  return sources.filter(
    (row) =>
      // Part-read sources are work this route can do, not a format problem.
      sourceNeedsCompile(row) &&
      classifySourceFormat(row.format) === "readable",
  );
}

export function useLocalCompile({
  vaultRoot,
  endpoint,
  sources,
  wikiTexts,
  labels,
}: UseLocalCompileArgs): LocalCompileSession {
  const vault = useLocalVault();
  const vaultSessionScope = useVaultSessionIdentityScope();
  const [status, setStatus] = useState<LocalCompileStatus>("idle");
  const [originVaultScope, setOriginVaultScope] = useState<string | null>(null);
  const [turn, setTurn] = useState<AgentTurn | null>(null);
  const [card, setCard] = useState<CompileConsentCard | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [writtenPaths, setWrittenPaths] = useState<string[]>([]);
  const [toolActivity, setToolActivity] = useState<LocalCompileSession["toolActivity"]>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* Capped waiting sources this route can open (see `selectLocalCompileTargets`). */
  const targets = useMemo(
    () =>
      // Leave the existing three-page/ten-round budget for related reads and revisions.
      selectLocalCompileTargets(sources).map((row) => row.path).slice(0,
        vault.manifest?.docs.some((doc) => isWikiPage(doc) && !isWikiFurnitureSlug(doc.slug)) ? 1 : COMPILE_SOURCES_PER_TURN),
    [sources, vault.manifest],
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
      async hashSource(_path, bytes) {
        // Whole-file sha256, never the capped slice, or a new page would read stale on landing.
        return hashReadBytes(bytes);
      },
    };
  }, [sources, vault.sourceHandles]);

  const readExistingPage = useCallback(
    async (slug: string) => {
      const handle = vault.fileHandles.get(slug);
      if (!handle) {
        if (vault.manifest?.docs.some((candidate) => candidate.slug === slug)) {
          throw new Error(`Could not open ${slug}.md`);
        }
        return null;
      }
      // Absence permits create-only; a failed read does not. Both text and timestamp
      // must describe this snapshot, even when the folder's manifest has not refreshed.
      const file = await handle.getFile();
      return { text: await file.text(), mtime: file.lastModified };
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
      // Async completion may outlive a provider switch. The result belongs to the vault that
      // started it, so consumers can refuse to replay it into the newly selected vault.
      setOriginVaultScope(vaultSessionScope);
      setStatus("running");
      setCard(null);
      setErrorMessage(null);
      setWrittenPaths([]);
      setToolActivity(null);

      const wikiIndex = buildWikiRetrievalIndex(vault.manifest?.docs ?? [], wikiTexts);
      const executor = createCompileExecutor({
        sourcePort,
        model: endpoint.model,
        now: () => new Date(),
        readExistingPage,
        pageCap: COMPILE_SOURCES_PER_TURN,
        findRelatedPages: wikiIndex.search,
        wikiSlugs: vault.manifest?.docs.filter((doc) => isWikiPage(doc) && !isWikiFurnitureSlug(doc.slug)).map((doc) => doc.slug) ?? [],
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
            system: buildCompileSystemPrompt({ model: endpoint.model, targets,
              reviewPages: [...new Set(sources.filter((row) => targets.includes(row.path)).flatMap((row) => row.reviewPages ?? []))],
            }),
            model: endpoint.model,
            notices: COMPILE_NOTICES,
            async execute(call) {
              setToolActivity({
                id: call.id,
                name: call.name,
                args: call.args,
                phase: "active",
                outcome: null,
              });
              const result = await executor.execute(call);
              if (!controller.signal.aborted) setToolActivity({
                id: call.id,
                name: call.name,
                args: call.args,
                phase: "complete",
                outcome: result.outcome,
              });
              return result;
            },
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
          { signal: controller.signal, onProgress: (progress) => {
            if (!controller.signal.aborted) setTurn(progress);
          } },
        );

        if (controller.signal.aborted) return;
        setTurn(result.turn);
        if (result.turn.status === "failed") {
          const notices = result.turn.events.filter((event) => event.kind === "notice");
          setErrorMessage(notices[notices.length - 1]?.text ?? COMPILE_NOTICES.failed);
          setStatus("failed");
          return;
        }
        const built = buildCompileConsentCard(executor.proposals(), {
          // A save point belongs to the surfaces that own Git, as in `use-vault-agent.ts`; the card
          // says none was taken.
          vaultIsGit: false,
          labels: { createFile: labels.createFile, modifyFile: labels.modifyFile },
        });
        setCard(built);
        /* A turn that proposed nothing still ends on a card with its own sentence and no Allow. */
        setStatus("waiting");
      } catch (error) {
        if (controller.signal.aborted) return;
        setErrorMessage(llmChatErrorMessage(error));
        setStatus("failed");
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [endpoint, labels, readExistingPage, sourcePort, sources, targets, vault.manifest, vaultRoot, vaultSessionScope, wikiTexts],
  );

  const allow = useCallback(async () => {
    const proposal = card?.proposal;
    if (!proposal || status !== "waiting") return;
    // Lock before the await: without it a double press is two concurrent vault writes.
    setStatus("applying");
    const currentMtimes = new Map<string, number>();
    try {
      // Compare the exact before text as well as the time, which can miss an edit made while the
      // card is open; check every selected change before the sequential writes start.
      for (const change of proposal.changes.filter((candidate) => candidate.selected)) {
        for (const file of change.files) {
          if (file.kind !== "modify") continue;
          const slug = file.path.replace(/\.md$/, "");
          const current = await readExistingPage(slug);
          if (!current || current.text !== file.before || current.mtime !== change.expectedMtime) {
            setErrorMessage(file.path);
            setStatus("failed");
            return;
          }
          currentMtimes.set(slug, current.mtime);
        }
      }
    } catch (error) {
      setErrorMessage(llmChatErrorMessage(error));
      setStatus("failed");
      return;
    }
    const outcome = await applyProposal(
      proposal,
      {
        createDoc: (slug, content) => vault.createDoc(slug, content),
        saveDoc: (slug, content, options) => vault.saveDoc(slug, content, options ?? {}),
        currentMtime: (slug) => currentMtimes.get(slug),
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
  }, [card, readExistingPage, status, vault]);

  const dismiss = useCallback(() => {
    setCard(null);
    setErrorMessage(null);
    setWrittenPaths([]);
    setStatus("idle");
  }, []);

  return { status, originVaultScope, turn, card, errorMessage, writtenPaths, targets, toolActivity, run, allow, dismiss, stop };
}

/** English: the model may see these as instructions, and `system-prompt.ts` keeps that channel English. */
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
