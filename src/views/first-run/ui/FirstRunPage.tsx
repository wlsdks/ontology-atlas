"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderOpen, Layers, Library, Map as MapIcon, Orbit, Sparkles, Zap } from "lucide-react";
import type { VaultShape } from "@/shared/lib/vault-shape";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useLocale, useTranslations } from "next-intl";
import { useLocalVault } from "@/entities/vault-session";
import { useJustStartVault, useVaultCreateFlow } from "@/features/docs-vault-local";
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
  const toast = useToast();
  const vault = useLocalVault();
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

  const errorText =
    justStartError !== null
      ? justStartError || t("errorFallback")
      : actionError !== null
        ? actionError || t("errorFallback")
        : vault.status === "error"
          ? // A "cannot be a vault root" case is a rejection, not a failure. Showing "please try again"
            // here would make the screen lie, since every retry gives the same result.
            vault.errorCode === "root-rejected"
            ? t("errorRootRejected")
            : /*
               * ⚠️ "the folder is gone" is **also not something a retry fixes** (review
               * 2026-08-16). This branch used to fall through to `errorMessage`, but that
               * value is deliberately blank so the raw cause is not leaked — so what
               * actually showed was "please try again", with the same result every press.
               */
              vault.errorCode === "path-missing"
              ? t("errorPathMissing")
              : /*
                 * ⚠️ The operating system refused, and a retry gives the same refusal. The raw
                 * `Operation not permitted (os error 1)` names an errno, not a folder, and never
                 * mentions that the fix is a checkbox in System Settings — so it is replaced by a
                 * sentence that names the folder and where to allow it.
                 */
                vault.errorCode === "permission-denied"
                ? t("errorPermissionDenied", {
                    folder:
                      deniedFolderName(
                        vault.handle ? getTauriVaultRootPath(vault.handle) ?? null : null,
                      ) ?? t("errorPermissionDeniedThisFolder"),
                  })
                : vault.errorMessage ?? t("errorFallback")
          : null;

  const cardBase = controlClass({
    shape: "row",
    className:
      "grid grid-cols-[32px_1fr] items-start gap-3 border bg-[color:var(--color-panel)] px-4 py-3.5",
  });
  const iconChip =
    "flex h-8 w-8 items-center justify-center rounded-chip border border-[color:var(--color-divider)] bg-[color:var(--color-elevated)]";

  return (
    <main
      id="main"
      tabIndex={-1}
      className="flex min-h-full items-center justify-center bg-[color:var(--color-canvas)] px-6 py-10"
    >
      <section className="grid w-full max-w-[440px] gap-6">
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
              {t("eyebrow")}
            </p>
            <h1 className="break-keep text-display font-[var(--font-weight-signature)] leading-display text-[color:var(--color-text-primary)]">
              {t("title")}
            </h1>
            <p className="mx-auto max-w-[360px] break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
              {t("subtitle")}
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
        <div className="grid gap-2" aria-busy={busy}>
          {showJustStart ? (
            <button
              type="button"
              onClick={() => setChoosingFor("just-start")}
              disabled={busy}
              data-testid="first-run-just-start"
              className={`${cardBase} border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-indigo-a08)]`}
            >
              <span className={`${iconChip} text-[color:var(--color-indigo-accent)]`}>
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
              showJustStart
                ? "border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)]"
                : "border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-indigo-a08)]"
            }`}
          >
            <span
              className={`${iconChip} ${
                showJustStart
                  ? "text-[color:var(--color-text-tertiary)]"
                  : "text-[color:var(--color-indigo-accent)]"
              }`}
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
        )}

        {errorText ? (
          <p
            role="alert"
            className="break-keep text-center text-label text-[color:var(--color-status-danger)]"
          >
            {errorText}
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
