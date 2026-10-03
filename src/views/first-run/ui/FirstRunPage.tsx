"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleHelp, FolderOpen, Layers, Library, Map as MapIcon, Sparkles, Zap } from "lucide-react";
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
import { FirstRunFolderActions } from "./FirstRunFolderActions";
import { Chip } from '@/shared/ui/controls';
import { Button, Dialog, IconButton } from '@/shared/ui';
import { BrandPortrait } from '@/shared/ui/brand-portrait';
import styles from './first-run-chooser.module.css';

/**
 * The installed app's `/` with no vault: open a folder, create one, or just start in a real folder
 * under `~/Ontology Atlas/<name>` that agents can reach (never OPFS). No bundled demo here, or it
 * reads as the person's data before their project restores; the website keeps the demo.
 */
export function FirstRunPage() {
  const [chooserHelpOpen, setChooserHelpOpen] = useState(false);
  const t = useTranslations("firstRun");
  // Shared with the `/docs` chooser.
  const tSwitch = useTranslations("vaultSwitch");
  const toast = useToast();
  const vault = useLocalVault();
  const failureSentence = useFailureSentence();
  // Both creation paths seed a starter in the screen's language.
  const locale = useLocale();
  /* After a folder opens this screen is already gone, so later words go through a toast. */
  const showToast = toast.show;
  const starterFailed = useCallback(
    (error: unknown) => showToast(failureSentence(error, t("starterFailed")).sentence, "error"),
    [showToast, failureSentence, t],
  );
  const justStartCreated = useCallback(
    (path: string) => showToast(t("justStartToast", { path }), "success"),
    [showToast, t],
  );
  const { handleCreate, scaffolding, actionError, setActionError } =
    useVaultCreateFlow(vault, locale, { starterFailed });
  const {
    justStart,
    busy: justStartBusy,
    actionError: justStartError,
  } = useJustStartVault(vault, locale, { created: justStartCreated, starterFailed });
  // A browser under ?shell=desktop has no Tauri bridge. Client-only mount, so no hydration mismatch.
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
  /* The folder-shape question is asked once, at creation, and answered as files. */
  const createTrigger = useRef<HTMLButtonElement>(null);
  const shapePanel = useRef<HTMLDivElement>(null);
  const previousChoice = useRef<string | null>(null);
  const [choosingFor, setChoosingFor] = useState<"just-start" | "create" | null>(null);
  useEffect(() => {
    if (choosingFor) shapePanel.current?.focus();
    else if (previousChoice.current) createTrigger.current?.focus();
    previousChoice.current = choosingFor;
  }, [choosingFor]);
  const chooseShape = useCallback(
    (shape: VaultShape) => {
      const door = choosingFor;
      setChoosingFor(null);
      if (door === "just-start") void justStart(shape);
      else if (door === "create") void handleCreate(shape);
    },
    [choosingFor, handleCreate, justStart],
  );

  /*
   * Hooks hand over codes, never thrown English. Only `sentence` renders; `detail` reaches only
   * the data-failure-detail attribute.
   */
  const failure: FailureCopy | null =
    justStartError !== null
      ? failureSentence(justStartError, t("errorFallback"))
      : actionError !== null
        ? failureSentence(actionError, t("errorFallback"))
        : vault.status === "error"
          ? // Rejections, a missing folder and an OS refusal are not fixed by a retry.
            vault.errorCode === "root-rejected"
            ? { sentence: t("errorRootRejected"), detail: null }
            : vault.errorCode === "grant-needed"
              ? /* A folder not yet re-granted since the access-scope update: confirm once, not "gone". */
                { sentence: t("errorGrantNeeded"), detail: null }
              : vault.errorCode === "path-missing"
              ? { sentence: t("errorPathMissing"), detail: null }
              : /* The errno never names the System Settings checkbox, so the sentence does. */
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
                : /* `access-failed` carries a raw cause string, so it goes through the same lookup, never onto the screen. */
                  failureSentence(vault.errorMessage, t("errorFallback"))
          : null;

  /* Also the installed app's only launch chooser, where a cold restore asks which folder; the header changes with it. */
  const choosingFolder = vault.awaitingVaultChoice;
  const choosingFolderHome = choosingFolder && choosingFor === null;
  const knownFolders = vault.recentVaults;
  const storedFolderKey = vault.storedVaultRecord
    ? recentVaultRowKey(vault.storedVaultRecord)
    : null;

  const cardBase = controlClass({
    shape: "row",
    className:
      "grid grid-cols-[32px_1fr] items-start gap-3 border bg-[color:var(--color-panel)] px-4 py-3.5",
  });
  const secondaryCardBase = controlClass({
    shape: "row",
    className: choosingFolderHome
      ? "grid grid-cols-[28px_1fr] items-start gap-2.5 border bg-[color:var(--color-panel)] px-3 py-2.5"
      : // Centred, or one-line doors show a blank band under the copy.
        "grid grid-cols-[32px_1fr] items-center gap-3 border bg-[color:var(--color-panel)] px-4 py-3.5",
  });
  const iconChip =
    "flex h-8 w-8 items-center justify-center rounded-chip border border-[color:var(--color-divider)] bg-[color:var(--color-elevated)]";
  const secondaryIconChip = choosingFolderHome
    ? "flex h-7 w-7 items-center justify-center rounded-chip border border-[color:var(--color-divider)] bg-[color:var(--color-elevated)]"
    : iconChip;
  /** Indigo only while a door answers the screen's question. */
  const doorGlyph = choosingFolder
    ? "text-[color:var(--color-text-tertiary)]"
    : "text-[color:var(--color-indigo-accent)]";

  return (
    <main
      id="main"
      tabIndex={-1}
      data-folder-chooser={choosingFolderHome ? 'fixed' : undefined}
      className={`flex min-h-0 flex-1 justify-center bg-[color:var(--color-canvas)] px-6 ${choosingFolderHome ? `${styles.chooser} overflow-hidden pt-6 pb-[calc(var(--topology-mobile-bottom-tab-reserve)+1.5rem)] lg:pb-6` : "overflow-auto py-10"}`}
    >
      <section
        className={choosingFolderHome
          ? `${styles.frame} architecture-result-arrive flex min-h-0 w-full max-w-3xl flex-col gap-5`
          : "my-auto grid h-fit w-full max-w-[var(--dialog-w-md)] gap-6"}
      >
        <header
          className={`grid shrink-0 gap-3 ${choosingFolderHome ? "justify-items-start text-left" : "justify-items-center text-center"}`}
        >
          <div className={`${styles.identity} inline-flex items-center gap-3`}>
            <BrandPortrait expression="welcome" />
            <span className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
              Ontology Atlas
            </span>
          </div>
          <div className="grid gap-1.5">
            {!choosingFolderHome ? <p className="font-mono text-label uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
              {choosingFolder ? tSwitch("choose.eyebrow") : t("eyebrow")}
            </p> : null}
            {/* Centred with the other lines when the screen is centred. */}
            <div className={`flex items-center gap-3 ${choosingFolderHome ? "justify-start" : "justify-center"}`}><h1 className={`${styles.title} min-w-0 break-keep font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] ${choosingFolderHome ? "text-hero" : "text-display"}`}>
              {choosingFolder ? tSwitch("choose.title") : t("title")}
            </h1>{choosingFolderHome ? <div className={styles.help}><IconButton label={tSwitch('choose.helpLabel')} size="lg" className="atlas-touch-floor atlas-touch-floor-wide" onClick={()=>setChooserHelpOpen(true)}><CircleHelp size={ICON_SIZE.md} aria-hidden /></IconButton></div> : null}</div>
            <p
              className={`${styles.description} break-keep text-[color:var(--color-text-tertiary)] ${choosingFolderHome ? "text-body-lg" : "mx-auto max-w-[440px] text-body-lg"}`}
            >
              {choosingFolder
                ? isTauriVaultRuntime()
                  ? tSwitch("choose.bodyDesktop")
                  : tSwitch("choose.bodyWeb")
                : t("subtitle")}
            </p>
          </div>
        </header>

        {choosingFor ? (
          <div ref={shapePanel} tabIndex={-1} className="grid gap-2" aria-busy={busy} data-testid="first-run-shape">
            <div className="grid gap-1 px-1">
              <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
                {t("shapeEyebrow")}
              </p>
              <p className="break-keep text-label leading-body text-[color:var(--color-text-tertiary)]">{t("shapeTitle")}</p>
            </div>
            {/* Equal-height cards (Don'ts, content-decided card height). */}
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
                  <span className="mt-0.5 block break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
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
            {/* Known folders lead as the launch chooser's answer; named by their visible caption. */}
            {knownFolders.length > 0 ? (
              <section className={choosingFolderHome ? `${styles.listRegion} grid min-h-0 shrink grid-rows-[auto_minmax(0,1fr)_auto] gap-2` : "grid gap-2"} aria-labelledby="known-folders-heading">
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
                  <p
                    id="known-folders-heading"
                    className="px-1 text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]"
                  >
                    {tSwitch("choose.listTitle")}
                  </p>
                  {choosingFolderHome ? (
                    <FirstRunFolderActions trigger={createTrigger} busy={busy} showJustStart={showJustStart} onOpen={() => void handleOpen()} onCreate={setChoosingFor} />
                  ) : null}
                </div>
                <RecentVaultList
                  records={knownFolders}
                  currentKey={storedFolderKey}
                  busy={busy}
                  emphasis={choosingFolder}
                  scroll={choosingFolderHome ? "viewport" : "contained"}
                  onOpen={(record) => void vault.openRecent(record)}
                  onForget={(record) => void vault.forgetRecent(record)}
                  onForgetAll={(records) => void vault.forgetRecent(records)}
                  onLocate={() => void handleOpen()}
                  /* Under the list it acts on, arriving with it. */
                  footnote={choosingFolder ? (
                    <p className={`${styles.release} px-1 text-label text-[color:var(--color-text-tertiary)]`}>
                      {tSwitch("choose.releaseValve")}
                    </p>
                  ) : null}
                />
              </section>
            ) : null}

        {/* Equal-height cards (Don'ts, content-decided card height). */}
        {!choosingFolderHome ? <div className="grid auto-rows-fr gap-2" aria-busy={busy}>
          {showJustStart ? (
            <button
              type="button"
              onClick={() => setChoosingFor("just-start")}
              disabled={busy}
              data-testid="first-run-just-start"
              /* As the launch chooser, the folder list answers; just start would make a third folder. */
              className={`${secondaryCardBase} ${
                choosingFolder
                  ? "border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)]"
                  : "border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-indigo-a08)]"
              }`}
            >
              {/* The glyph demotes with the border, or its chroma stays the brightest ink. */}
              <span className={`${secondaryIconChip} ${doorGlyph}`}>
                <Zap size={ICON_SIZE.md} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                  {justStartBusy ? t("justStartBusy") : t("justStartTitle")}
                </span>
                <span className="mt-0.5 block break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
                  {choosingFolderHome ? tSwitch("choose.justStartBody") : t("justStartBody")}
                </span>
              </span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => void handleOpen()}
            disabled={busy}
            data-testid="first-run-open"
            className={`${secondaryCardBase} ${
              showJustStart || choosingFolder
                ? "border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)]"
                : "border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-indigo-a08)]"
            }`}
          >
            <span
              className={`${secondaryIconChip} ${showJustStart ? "text-[color:var(--color-text-tertiary)]" : doorGlyph}`}
            >
              <FolderOpen size={ICON_SIZE.md} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {(vault.status === "opening" || vault.status === "loading") && !scaffolding
                  ? t("busy")
                  : t("openTitle")}
              </span>
              <span className="mt-0.5 block break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
                {choosingFolderHome ? tSwitch("choose.openBody") : t("openBody")}
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setChoosingFor("create")}
            disabled={busy}
            data-testid="first-run-create"
            className={`${secondaryCardBase} border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)]`}
          >
            <span className={`${secondaryIconChip} text-[color:var(--color-text-tertiary)]`}>
              <Sparkles size={ICON_SIZE.md} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {scaffolding ? t("scaffolding") : t("createTitle")}
              </span>
              <span className="mt-0.5 block break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
                {choosingFolderHome ? tSwitch("choose.createBody") : t("createBody")}
              </span>
            </span>
          </button>

            </div> : null}
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

      </section>
      <Dialog open={chooserHelpOpen} onClose={()=>setChooserHelpOpen(false)} labelledBy="folder-chooser-help-title" size="sm">
        <h2 id="folder-chooser-help-title" className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{tSwitch('choose.helpLabel')}</h2>
        <div className="mt-4 grid gap-3 text-body-lg text-[color:var(--color-text-secondary)]">
          <p>{isTauriVaultRuntime()?tSwitch('choose.bodyDesktop'):tSwitch('choose.bodyWeb')}</p>
          <p>{tSwitch('choose.releaseValve')}</p>
          <p>{t('trustLine')}</p>
        </div>
        <div className="mt-6 flex justify-end"><Button variant="outline" className="atlas-touch-floor atlas-touch-floor-wide" onClick={()=>setChooserHelpOpen(false)}>{tSwitch('choose.closeHelp')}</Button></div>
      </Dialog>
    </main>
  );
}
