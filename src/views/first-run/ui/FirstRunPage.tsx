"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderOpen, Layers, Library, Map as MapIcon, Orbit, Sparkles, Zap } from "lucide-react";
import type { VaultShape } from "@/shared/lib/vault-shape";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useLocale, useTranslations } from "next-intl";
import { useLocalVault } from "@/entities/vault-session";
import { useJustStartVault, useVaultCreateFlow } from "@/features/docs-vault-local";
import { RecentVaultList, recentVaultRowKey } from "@/features/vault-switch";
import { useFailureSentence } from '@/shared/lib/use-failure-sentence';
import type { FailureCopy } from '@/shared/lib/use-failure-sentence';
import { deniedFolderName } from "@/entities/vault-session";
import { getTauriVaultRootPath } from "@/shared/lib/tauri-vault-fs";
import { isTauriVaultRuntime } from "@/shared/lib/tauri-vault-fs";
import { useToast } from "@/shared/ui/toast";
import { controlClass } from '@/shared/ui/control-class';
import { Chip } from '@/shared/ui/controls';

/**
 * First run of the installed app (the desktop shell) — `/` with no vault chosen.
 *
 * An identity fix: the installed app used to show a marketing gateway telling you to download the app
 * you are already running. This is the Obsidian-style "choose a folder → start working" entry instead.
 * The web `/` has had the map (HomePage) as its first screen since root-first-open (2026-07) and solves
 * a different problem — the branch is the single `isDesktopShell()` in `RootEntryPage`.
 *
 * All actions reuse existing local flows (zero new pipelines):
 * - Open a vault folder → `useLocalVault().open()` (the Tauri or FSA picker)
 * - Create a new vault → the same `open()`, then, if the folder is empty, the existing
 *   `scaffoldOntology()` (the same action as `/docs`'s `OntologyStarterCta`) seeds the starter
 * - **Just start** (Tauri runtime only) → with no folder picker, creates a real on-disk folder under
 *   `~/Ontology Atlas/<name>` and connects to it directly (`useJustStartVault`). Because it
 *   is a real disk path, agents such as MCP or Claude Code can reach it — not using OPFS is the core of
 *   this design. A dev build can open this page in a browser via the `?shell=desktop` override
 *   (`isDesktopShell()`), so this card renders only when the real Tauri invoke bridge
 *   (`isTauriVaultRuntime()`) exists — otherwise the item is not shown at all.
 *
 * The bundled demo is deliberately web-only. The installed app is the vault's home: showing a
 * complete sample before a restored project resolves makes that sample look like the person's data,
 * and a later local render reads as one vault overwriting another. First run therefore asks only for
 * a real local folder (or creates one); the website remains the no-commit demo entrance.
 *
 * Design: the machined language of DESIGN-SYSTEM v2 — `--color-panel` surfaces with 1px border-soft
 * cards, an engraved mono trust line (`--engraved-numeral-*`, real facts only), a single indigo, and
 * zero marketing prose, download CTAs, or screenshots.
 */
export function FirstRunPage() {
  const t = useTranslations("firstRun");
  // The chooser's words are shared with the `/docs` chooser; see `choosingFolder` below.
  const tSwitch = useTranslations("vaultSwitch");
  const toast = useToast();
  const vault = useLocalVault();
  const failureSentence = useFailureSentence();
  // Both creation paths produce a starter in the screen's language — the same action must not produce a
  // vault in a different language depending on the entry path (walkthrough 2026-07-26).
  const locale = useLocale();
  const { handleCreate, scaffolding, actionError, setActionError } =
    useVaultCreateFlow(vault, locale);
  const {
    justStart,
    busy: justStartBusy,
    scaffolding: justStartScaffolding,
    actionError: justStartError,
    createdPath,
    clearCreatedPath,
  } = useJustStartVault(vault, locale);
  // A dev build can open this page in an ordinary browser through the `?shell=desktop` override
  // (`isDesktopShell()`), and in that case there is no real Tauri invoke bridge, so "just start" is not
  // rendered. This page itself only renders behind a client-only mount (`RootEntryPage`'s `clientReady`
  // gate), so calling this directly carries no SSR/hydration mismatch risk.
  const showJustStart = isTauriVaultRuntime();

  const busy =
    vault.status === "opening" ||
    vault.status === "loading" ||
    scaffolding ||
    justStartBusy;

  const handleOpen = useCallback(async () => {
    setActionError(null);
    await vault.open();
  }, [vault, setActionError]);
  /*
   * Which creation door was pressed, while the person says what the folder will hold.
   * Owner direction 2026-09-06: the question is asked once, at creation; the answer is
   * written as files (`scaffoldOntology`), and the rail reads those files afterwards.
   */
  const [choosingFor, setChoosingFor] = useState<"just-start" | "create" | null>(null);
  const chooseShape = useCallback(
    (shape: VaultShape) => {
      const door = choosingFor;
      setChoosingFor(null);
      if (door === "just-start") void justStart(shape);
      else if (door === "create") void handleCreate(shape);
    },
    [choosingFor, handleCreate, justStart],
  );

  useEffect(() => {
    if (!createdPath) return;
    toast.show(t("justStartToast", { path: createdPath }), "success");
    clearCreatedPath();
  }, [createdPath, clearCreatedPath, toast, t]);

  /*
   * ⚠️ Both hooks hand over a **failure code**, never a thrown sentence. Until v1.2.2 they handed
   * over `err.message`, and this line printed the developer's English onto a Korean screen
   * (installed-app inspection, B2). An unrecognised code falls through to this screen's own
   * fallback, which is the sentence somebody wrote for exactly this press.
   *
   * Every branch resolves to a `FailureCopy`, so the sentence and the machine half never share a
   * slot: `sentence` is rendered, `detail` only ever reaches `data-failure-detail`.
   */
  const failure: FailureCopy | null =
    justStartError !== null
      ? failureSentence(justStartError, t("errorFallback"))
      : actionError !== null
        ? failureSentence(actionError, t("errorFallback"))
        : vault.status === "error"
          ? // A "cannot be a vault root" case is a rejection, not a failure. Showing "please try again"
            // here would make the screen lie, since every retry gives the same result.
            vault.errorCode === "root-rejected"
            ? { sentence: t("errorRootRejected"), detail: null }
            : /*
               * ⚠️ "the folder is gone" is **also not something a retry fixes** (review
               * 2026-08-16). `use-local-vault.ts` leaves `errorMessage` null on this code
               * alone, so falling through to it showed "please try again", with the same
               * result every press.
               */
              vault.errorCode === "path-missing"
              ? { sentence: t("errorPathMissing"), detail: null }
              : /*
                 * ⚠️ The operating system refused, and a retry gives the same refusal. The raw
                 * `Operation not permitted (os error 1)` names an errno, not a folder, and never
                 * mentions that the fix is a checkbox in System Settings — so it is replaced by a
                 * sentence that names the folder and where to allow it.
                 */
                vault.errorCode === "permission-denied"
                ? {
                    sentence: t("errorPermissionDenied", {
                      folder:
                        deniedFolderName(
                          vault.handle ? getTauriVaultRootPath(vault.handle) ?? null : null,
                        ) ?? t("errorPermissionDeniedThisFolder"),
                    }),
                    detail: vault.errorMessage,
                  }
                : /*
                   * ⚠️ `access-failed` is the branch that **does** carry a cause string
                   * (`use-local-vault.ts:241` documents it: "errorMessage carries the cause
                   * string, including a Tauri command's Err(String)"). A comment here once
                   * claimed the opposite — that the value is "deliberately blank so the raw
                   * cause is not leaked" — and on the strength of that claim this line rendered
                   * it directly, which put raw English on the first-run screen while the gate
                   * that change shipped stayed green (re-inspection before v1.2.2, S20). The
                   * same lookup the coded branches use recognises the OS signatures in that
                   * string and otherwise falls back to this screen's own sentence.
                   */
                  failureSentence(vault.errorMessage, t("errorFallback"))
          : null;

  /*
   * **This is also the launch chooser, and on the installed app it is the only one.**
   *
   * `AppShell` sends every workbench route to `/` while the installed app has no vault, and
   * `RootEntryPage` renders this screen there - so when the cold restore stops to ask which
   * folder (`awaitingVaultChoice`), this is the screen the person actually lands on. The
   * chooser in `DesktopVaultWelcome` covers the `/docs` ingress, which a wiki-only vault does
   * not even have as a destination. Leaving the list out of here would have made the whole
   * launch rule invisible on the surface the report came from.
   *
   * The header's words change with it: titling a returning person's screen "first run" and
   * telling them what a vault is answers a question they did not ask.
   */
  const choosingFolder = vault.awaitingVaultChoice;
  const knownFolders = vault.recentVaults;
  const storedFolderKey = vault.storedVaultRecord
    ? recentVaultRowKey(vault.storedVaultRecord)
    : null;

  const cardBase = controlClass({
    shape: "row",
    className:
      "grid grid-cols-[32px_1fr] items-start gap-3 border bg-[color:var(--color-panel)] px-4 py-3.5",
  });
  const iconChip =
    "flex h-8 w-8 items-center justify-center rounded-chip border border-[color:var(--color-divider)] bg-[color:var(--color-elevated)]";
  /** The door cards' glyph ink: indigo only while a door is what the screen is asking about. */
  const doorGlyph = choosingFolder
    ? "text-[color:var(--color-text-tertiary)]"
    : "text-[color:var(--color-indigo-accent)]";

  return (
    <main
      id="main"
      tabIndex={-1}
      /*
       * `my-auto` on the section rather than `items-center` here, and the main owns the
       * scroll — the same contract its twin `DesktopVaultWelcome` already used, and for the
       * reason written there: with fixed centring, content taller than the viewport clips at
       * the top out of reach. Measured at the app's 1040x720 window floor with five known
       * folders, the "create a new folder" card sat 60px below the fold (responsive seat,
       * 2026-09-13).
       */
      className="flex min-h-0 flex-1 justify-center overflow-auto bg-[color:var(--color-canvas)] px-6 py-10"
    >
      <section className="my-auto grid h-fit w-full max-w-[var(--dialog-w-sm)] gap-6">
        <header className="grid justify-items-center gap-3 text-center">
          <div className="inline-flex items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] text-[color:var(--color-indigo-accent)]">
              <Orbit size={ICON_SIZE.md} aria-hidden />
            </span>
            <span className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
              Ontology Atlas
            </span>
          </div>
          <div className="grid gap-1.5">
            <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
              {choosingFolder ? tSwitch("choose.eyebrow") : t("eyebrow")}
            </p>
            <h1 className="break-keep text-display font-[var(--font-weight-signature)] leading-display text-[color:var(--color-text-primary)]">
              {choosingFolder ? tSwitch("choose.title") : t("title")}
            </h1>
            <p className="mx-auto max-w-[360px] break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
              {choosingFolder
                ? isTauriVaultRuntime()
                  ? tSwitch("choose.bodyDesktop")
                  : tSwitch("choose.bodyWeb")
                : t("subtitle")}
            </p>
          </div>
        </header>

        {choosingFor ? (
          <div className="grid gap-2" aria-busy={busy} data-testid="first-run-shape">
            <div className="grid gap-1 px-1">
              <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
                {t("shapeEyebrow")}
              </p>
              <p className="break-keep text-label leading-body text-[color:var(--color-text-tertiary)]">{t("shapeTitle")}</p>
            </div>
            {/* One row of repeated cards keeps one height: the shortest copy does not
                make its card shorter (Don'ts, content-decided card height). */}
            <div className="grid auto-rows-fr gap-2">
            {(
              [
                { id: "wiki", shape: { map: false, wiki: true }, Icon: Library, title: t("shapeWikiTitle"), body: t("shapeWikiBody") },
                { id: "map", shape: { map: true, wiki: false }, Icon: MapIcon, title: t("shapeMapTitle"), body: t("shapeMapBody") },
                { id: "both", shape: { map: true, wiki: true }, Icon: Layers, title: t("shapeBothTitle"), body: t("shapeBothBody") },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => chooseShape(option.shape)}
                disabled={busy}
                data-testid={`first-run-shape-${option.id}`}
                className={`${cardBase} border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)]`}
              >
                <span className={`${iconChip} text-[color:var(--color-indigo-accent)]`}>
                  <option.Icon size={ICON_SIZE.md} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                    {option.title}
                  </span>
                  <span className="mt-0.5 block break-keep text-label leading-body text-[color:var(--color-text-tertiary)]">
                    {option.body}
                  </span>
                </span>
              </button>
            ))}
            </div>
            <Chip
              tone="muted"
              onClick={() => setChoosingFor(null)}
              disabled={busy}
              data-testid="first-run-shape-back"
              className="justify-self-center"
            >
              {t("shapeBack")}
            </Chip>
          </div>
        ) : (
          <>
            {/*
              Known folders lead, because when this screen is the launch chooser they are the
              answer and the create/just-start cards are not. On a genuine first run the list
              is empty and renders nothing, so that screen is unchanged. It sits in this
              branch only: while the new-vault shape question is open, other folders are noise.
            */}
            {/*
              The region is named by its own visible caption (`aria-labelledby`) rather than
              by a copy of it, so a screen reader does not announce the same words twice.
            */}
            {knownFolders.length > 0 ? (
              <section className="grid gap-2" aria-labelledby="known-folders-heading">
                <p
                  id="known-folders-heading"
                  className="px-1 font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]"
                >
                  {tSwitch("choose.listTitle")}
                </p>
                <RecentVaultList
                  records={knownFolders}
                  currentKey={storedFolderKey}
                  busy={busy}
                  emphasis={choosingFolder}
                  onOpen={(record) => void vault.openRecent(record)}
                  onForget={(record) => void vault.forgetRecent(record)}
                  onLocate={() => void handleOpen()}
                />
                {/*
                  The release valve belongs under the list it acts on, not buried as the third
                  clause of the intro paragraph (design-lead seat, 2026-09-13).
                */}
                {choosingFolder ? (
                  <p className="px-1 text-caption leading-body text-[color:var(--color-text-quaternary)]">
                    {tSwitch("choose.releaseValve")}
                  </p>
                ) : null}
              </section>
            ) : null}

        <div className="grid gap-2" aria-busy={busy}>
          {showJustStart ? (
            <button
              type="button"
              onClick={() => setChoosingFor("just-start")}
              disabled={busy}
              data-testid="first-run-just-start"
              /*
               * The accent belongs to whatever answers the screen's question. While this is
               * the launch chooser the answer is the folder list above, and "just start"
               * creates a *third* folder - the last thing a person choosing between two of
               * theirs is asking for.
               */
              className={`${cardBase} ${
                choosingFolder
                  ? "border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)]"
                  : "border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-indigo-a08)]"
              }`}
            >
              {/*
                The accent has more than one channel, and they have to move together. With
                only the border gated, this card's glyph stayed at full-chroma
                `--color-indigo-accent` while its border said `border-soft` - and chroma
                outranks a 1px 32%-alpha line. Measured on the rendered chooser: the door's
                glyph scored s·v = 0.561 against the folder list's 0.153, so the demoted card
                was still the brightest ink in the action region (guardian, 2026-09-13).
              */}
              <span className={`${iconChip} ${doorGlyph}`}>
                <Zap size={ICON_SIZE.md} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                  {justStartScaffolding
                    ? t("scaffolding")
                    : justStartBusy
                      ? t("justStartBusy")
                      : t("justStartTitle")}
                </span>
                <span className="mt-0.5 block break-keep text-label leading-body text-[color:var(--color-text-tertiary)]">
                  {t("justStartBody")}
                </span>
              </span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => void handleOpen()}
            disabled={busy}
            data-testid="first-run-open"
            className={`${cardBase} ${
              showJustStart || choosingFolder
                ? "border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)]"
                : "border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-indigo-a08)]"
            }`}
          >
            <span
              className={`${iconChip} ${showJustStart ? "text-[color:var(--color-text-tertiary)]" : doorGlyph}`}
            >
              <FolderOpen size={ICON_SIZE.md} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {(vault.status === "opening" || vault.status === "loading") && !scaffolding
                  ? t("busy")
                  : t("openTitle")}
              </span>
              <span className="mt-0.5 block break-keep text-label leading-body text-[color:var(--color-text-tertiary)]">
                {t("openBody")}
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setChoosingFor("create")}
            disabled={busy}
            data-testid="first-run-create"
            className={`${cardBase} border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)]`}
          >
            <span className={`${iconChip} text-[color:var(--color-text-tertiary)]`}>
              <Sparkles size={ICON_SIZE.md} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {scaffolding ? t("scaffolding") : t("createTitle")}
              </span>
              <span className="mt-0.5 block break-keep text-label leading-body text-[color:var(--color-text-tertiary)]">
                {t("createBody")}
              </span>
            </span>
          </button>

            </div>
          </>
        )}

        {failure ? (
          <p
            role="alert"
            data-failure-detail={failure.detail ?? undefined}
            className="break-keep text-center text-label text-[color:var(--color-status-danger)]"
          >
            {failure.sentence}
          </p>
        ) : null}

        <p
          data-token="engraved-numeral"
          className="text-center font-mono text-caption uppercase tracking-[var(--tracking-caps-16)]"
          style={{
            color: "var(--engraved-numeral-face)",
            textShadow: "var(--engraved-numeral-text-shadow)",
          }}
        >
          {t("trustLine")}
        </p>
      </section>
    </main>
  );
}
