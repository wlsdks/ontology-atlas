import type { useTranslations } from "use-intl";

import type { LibrarySourceRow } from "@/entities/docs-vault";
import { PARSER_SOURCE_FORMATS, selectLocalCompileTargets } from "@/features/vault-agent";

import type { LibraryLocalModel } from "../agent/use-library-agent";

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
  { route, sourceCount, needsCompileCount, localModel, sources }: CompileAvailability,
  t: ReturnType<typeof useTranslations<"library">>,
): string | null {
  if (route === "checking") return t("stage.blockedChecking");
  if (route === "unavailable") return t("stage.blockedNoAgent");
  if (sourceCount === 0) return t("stage.blockedNoSources");
  if (route === "local") {
    /*
     * Both refusals name the specific missing thing rather than the route, so a person does not install
     * a coding agent they may not need.
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

/**
 * What leaves this computer when Compile runs, in one sentence. The caller decides which surface
 * prints it, and exactly one does: the shelf's step two while drawn, otherwise the index beside its
 * chip. The agent route's sentence is `libraryProviderDisclosure`.
 */
export function libraryTransferSentence(
  {
    route,
    localModel,
  }: { route: CompileAvailability["route"]; localModel: LibraryLocalModel | null },
  t: ReturnType<typeof useTranslations<"library">>,
): string | null {
  if (route === "local" && localModel) {
    return t(localModel.onThisComputer ? "stage.transferLocal" : "stage.transferLocalRemote", {
      host: localModel.host,
      file: ".ontology-atlas/llm-audit.jsonl",
    });
  }
  return null;
}

/**
 * Traffic Atlas is not in the path of: on the agent route nothing leaves through Atlas, so this
 * standing correction about what Atlas does not log belongs with the place's description. A transfer
 * Atlas performs is disclosed under the button that performs it (`.claude/rules/local-first.md`).
 */
export function libraryProviderDisclosure(
  { route }: { route: CompileAvailability["route"] },
  t: ReturnType<typeof useTranslations<"library">>,
): string | null {
  return route === "agent" ? t("wiki.transfer") : null;
}
