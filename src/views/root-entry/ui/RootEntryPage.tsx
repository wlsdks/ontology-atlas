"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Bot, FolderSearch, HardDrive, Network, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useLocalVault } from "@/entities/vault-session";
import type { AppLocale } from "@/i18n/locales";
import { Button, IconButton } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { RouteLoadingFallback } from "@/shared/ui/fallbacks/route-loading-fallback";
import { isDesktopShell } from "@/shared/lib/desktop-shell/desktop-shell";
import { GatewayLandingPage } from "@/views/download";
import { useWorkbenchCatalog } from "@/i18n/workbench-catalog";
import { requestRootWorkbench, useRootWorkbenchViews } from "../model/root-workbench";

/**
 * A chosen or restored vault goes straight to the map; the installed app without one gets
 * `FirstRunPage`; the web gets the gateway by the same rule as the shell's `isGatewaySurface`.
 *
 * The map, first-run and the whole catalog are fetched only once a folder is on its way or this is
 * the app (`root-workbench.ts`). Until they arrive the screen already showing stays: the gateway on
 * the web, the neutral frame in the app, and the shell keeps its rail hidden on the same signal.
 */
export function RootEntryPage() {
  const vault = useLocalVault();
  const locale = useLocale() as AppLocale;
  const views = useRootWorkbenchViews(locale);
  const catalogReady = useWorkbenchCatalog(locale) !== null;
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const clientReady = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const desktop = clientReady && isDesktopShell();
  const vaultOpen = Boolean(vault.manifest || vault.partialTotal);
  /* A remembered folder being restored, one being opened, or the chooser: the map is likely next. */
  const workbenchLikely =
    desktop ||
    vaultOpen ||
    vault.awaitingVaultChoice ||
    vault.handle !== null ||
    vault.status === "opening" ||
    vault.status === "loading";
  useEffect(() => {
    if (workbenchLikely) requestRootWorkbench(locale);
  }, [workbenchLikely, locale]);

  if (!clientReady) return <DesktopVaultRedirect />;
  if (vaultOpen) {
    if (views) return <views.HomePage />;
    if (desktop) return <DesktopVaultRedirect />;
    // With the catalog here the shell already shows the rail, so the gateway would flash beside it.
    if (catalogReady) return <RouteLoadingFallback />;
  }
  /* A person choosing between their folders gets the chooser, not the web gateway. */
  else if (desktop || vault.awaitingVaultChoice) {
    // A neutral frame until the restore is attempted, or FirstRun flashes.
    return vault.restoreAttempted && views ? <views.FirstRunPage /> : <DesktopVaultRedirect />;
  }
  /* The stored handle is kept: a failed restore does not prove the folder is gone. */
  const failedRestore =
    vault.restoreAttempted && vault.status === 'error' && !noticeDismissed;
  return (
    <>
      {failedRestore ? (
        <LostVaultNotice
          folderName={vault.handle?.name ?? vault.recentVaults[0]?.name ?? null}
          missing={vault.errorCode === 'path-missing'}
          onOpen={() => void vault.open()}
          onDismiss={() => setNoticeDismissed(true)}
        />
      ) : null}
      <GatewayLandingPage />
    </>
  );
}

/** Names the folder when known; a neutral tone, since the person did nothing wrong. */
function LostVaultNotice({
  folderName,
  missing,
  onOpen,
  onDismiss,
}: {
  folderName: string | null;
  missing: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const t = useTranslations('rootEntry');
  return (
    <div
      role="status"
      data-testid="root-entry-lost-vault-notice"
      className="flex flex-wrap items-center gap-3 border-b border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-4 py-3"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-chip border border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)]">
        <FolderSearch size={ICON_SIZE.md} aria-hidden />
      </span>
      <p className="min-w-0 flex-1 break-keep text-label leading-prose text-[color:var(--color-text-secondary)]">
        {missing && folderName
          ? t('lostVaultMissing', { name: folderName })
          : t('lostVaultUnreadable')}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="root-entry-lost-vault-open"
        onClick={onOpen}
      >
        {t('lostVaultAction')}
      </Button>
      <IconButton
        label={t('lostVaultDismiss')}
        size="sm"
        data-testid="root-entry-lost-vault-dismiss"
        onClick={onDismiss}
      >
        <X size={ICON_SIZE.md} aria-hidden />
      </IconButton>
    </div>
  );
}

function DesktopVaultRedirect() {
  const t = useTranslations('rootEntry');
  const proofItems = [
    { icon: HardDrive, label: t('redirectFilesProof') },
    { icon: Network, label: t('redirectGraphProof') },
    { icon: Bot, label: t('redirectAgentProof') },
  ] as const;

  return (
    <main
      id="main"
      tabIndex={-1}
      aria-busy="true"
      className="flex min-h-full items-center justify-center bg-[color:var(--color-canvas)] px-6 py-10"
    >
      <section className="grid w-full max-w-2xl justify-items-center gap-5 text-center">
        <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
          {t('redirectEyebrow')}
        </p>
        <div className="grid gap-2">
          <h1 className="text-display font-[var(--font-weight-strong)] leading-display text-[color:var(--color-text-primary)] md:text-hero">
            {t('redirectTitle')}
          </h1>
          <p className="mx-auto max-w-xl text-body leading-title text-[color:var(--color-text-tertiary)]">
            {t('redirectBody')}
          </p>
        </div>
        <div className="grid w-full overflow-hidden rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] sm:grid-cols-3">
          {proofItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className={`flex min-w-0 items-center gap-2 px-3 py-3 text-left ${
                  index > 0
                    ? "border-t border-[color:var(--color-border-soft)] sm:border-l sm:border-t-0"
                    : ""
                }`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-chip border border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)]">
                  <Icon size={14} aria-hidden />
                </span>
                <span className="text-label font-[var(--font-weight-signature)] leading-body text-[color:var(--color-text-secondary)]">
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
        <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
          {t('openingLocalVaultPicker')}
        </p>
      </section>
    </main>
  );
}
