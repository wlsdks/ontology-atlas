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

/**
 * **What leaves this computer when Compile runs — one sentence, chosen once.**
 *
 * Two surfaces can start Compile, so two surfaces could disclose it, and this module
 * already exists because answering one question in two places is how they come to
 * disagree. The connect-by-address runner is a program on this machine, every request to
 * it leaves a line in the folder's own audit file, and the wording says "on this
 * computer" only when the saved host really is (`.claude/rules/local-first.md`).
 *
 * The **caller** decides which surface prints it, and exactly one does: the shelf's step
 * two while it is drawn, the index beside its own chip when a selection has replaced the
 * shelf. Measured 2026-09-06 in the installed app, printing it in both put the same
 * paragraph twice in one viewport, which teaches a reader to skip it; the regression the
 * other way is worse and shipped for one commit — with a single brain and nothing
 * selected the disclosure appeared **nowhere**, caught by
 * `tests/e2e/library-compile-dock.spec.ts`.
 *
 * ⚠️ **The agent route's sentence is no longer one of these** (2026-09-12). It used to be
 * returned from here too, which put it under the Compile press on the shelf and under the
 * one in an open source's pane. See `libraryProviderDisclosure` below for where it went
 * and why the two facts part company.
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
 * **The one sentence about traffic Atlas is not in the path of** — on demand, in the
 * index head's glyph, and nowhere else.
 *
 * Owner, 2026-09-12, reading the installed app's Library: *"text like 'the coding agent
 * sends requests directly to its provider and Atlas does not record that traffic…' —
 * shouldn't that be handled as a tooltip?"* Measured on the owner's folder at 1512 it was
 * printing as a paragraph in up to three places on one journey — the shelf's step two,
 * the index under its door group, and an open source's pane beside Compile — at which
 * point a reader learns to skip it, which is the opposite of disclosure.
 *
 * **Why it may move and the sentence above may not.** `.claude/rules/local-first.md`
 * asks for one place to say *what leaves this computer*, and says it must be where the
 * press happens. This sentence is not that: on the agent route nothing leaves through
 * Atlas at all, and the sentence exists to say exactly that — the rule's own clause that
 * Atlas "must not claim that `.ontology-atlas/llm-audit.jsonl` covers provider-owned
 * transfers". A standing correction about what Atlas does *not* log is a fact about the
 * place, so it belongs with the place's description; a transfer Atlas performs stays
 * under the button that performs it.
 */
export function libraryProviderDisclosure(
  { route }: { route: CompileAvailability["route"] },
  t: ReturnType<typeof useTranslations<"library">>,
): string | null {
  return route === "agent" ? t("wiki.transfer") : null;
}
