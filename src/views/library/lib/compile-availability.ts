"use client";

import type { useTranslations } from "next-intl";

import type { LibrarySourceRow } from "@/entities/docs-vault";
import { PARSER_SOURCE_FORMATS, selectLocalCompileTargets } from "@/features/vault-agent";

import type { LibraryLocalModel } from "./use-library-agent";

/**
 * **Why Compile cannot run right now — one sentence, in one place.**
 *
 * Two surfaces ask the question (the guided shelf's step two, and a source with no
 * write-up), and they must not answer it differently. A person who reads "needs the app"
 * on one pane and "no agent is set up" on the other has been given two problems where
 * there is one.
 *
 * The order below is the order a person can act in: what they cannot change at all (this
 * is a browser), then what is still being determined, then what they could set up, then
 * what is simply already done. Returning the last reason first would tell someone with no
 * runtime that there was nothing to compile.
 */
export interface CompileAvailability {
  route: "checking" | "agent" | "local" | "unavailable";
  /** True in the installed app. The web build has no runtime for Compile at all. */
  inApp: boolean;
  sourceCount: number;
  /** Sources with no write-up, plus those whose write-up no longer matches. */
  needsCompileCount: number;
  localModel: LibraryLocalModel | null;
  /**
   * The folder's own rows. The `local` route asks a narrower question than the count
   * above: not "is anything waiting" but "is anything waiting that this runner can open",
   * because a PDF is waiting forever on a route with no PDF parser.
   */
  sources?: readonly LibrarySourceRow[];
}

export function libraryCompileBlockedReason(
  { route, inApp, sourceCount, needsCompileCount, localModel, sources }: CompileAvailability,
  t: ReturnType<typeof useTranslations<"library">>,
): string | null {
  if (!inApp) return t("stage.blockedWeb");
  if (route === "checking") return t("stage.blockedChecking");
  if (route === "unavailable") return t("stage.blockedNoAgent");
  if (sourceCount === 0) return t("stage.blockedNoSources");
  if (route === "local") {
    /*
     * The local runner compiles, but not everything and not everywhere. Both refusals
     * name the specific missing thing rather than the route, because a person reading
     * "a local model cannot compile" would go and install a coding agent they may not
     * need (PO evidence and PO steward, 2026-09-06).
     */
    if (localModel && !localModel.onThisComputer) {
      return t("stage.blockedLocalRemote", { host: localModel.host });
    }
    if (needsCompileCount === 0) return t("stage.blockedNothingWaiting");
    if (selectLocalCompileTargets(sources ?? []).length === 0) {
      return t("stage.blockedLocalFormats", {
        model: localModel?.model ?? "",
        formats: PARSER_SOURCE_FORMATS.slice(0, 4).map((format) => format.toUpperCase()).join(", "),
      });
    }
    return null;
  }
  if (needsCompileCount === 0) return t("stage.blockedNothingWaiting");
  return null;
}

/**
 * Which brain would answer, named. A coding agent finishes Compile itself; a
 * connect-by-address runner is named because somebody who set one up should see it here
 * rather than wonder whether the setting took.
 */
export function libraryBrainLabel(
  {
    route,
    agentLabel,
    localModel,
  }: { route: CompileAvailability["route"]; agentLabel: string | null; localModel: LibraryLocalModel | null },
  t: ReturnType<typeof useTranslations<"library">>,
): string {
  if (route === "agent" && agentLabel) return t("stage.brainAgent", { name: agentLabel });
  if (localModel) {
    return t("stage.brainLocal", { model: localModel.model, host: localModel.host });
  }
  return t("stage.brainNone");
}
