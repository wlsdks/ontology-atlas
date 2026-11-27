"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Bot, HardDrive, Network } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useLocalVault } from "@/entities/vault-session";
import type { AppLocale } from "@/i18n/locales";
import { RouteLoadingFallback } from "@/shared/ui/fallbacks/route-loading-fallback";
import { isDesktopShell } from "@/shared/lib/desktop-shell/desktop-shell";
import { useWorkbenchCatalog } from "@/i18n/workbench-catalog";
import { requestRootWorkbench, useRootWorkbenchViews } from "../model/root-workbench";

/**
 * The installed app's `/`: the map when a folder is open, the first-run screen when none is. A plain
 * browser never mounts it (`GatewayHandOverScript` sends that visitor to `/download` from the
 * document head), so nothing here offers a download. The map, first-run and the whole catalog are fetched once a folder is on its
 * way (`root-workbench.ts`); until they arrive the neutral frame stays up, and the shell keeps its
 * rail hidden on the same signal.
 */
export function RootEntryPage() {
  const vault = useLocalVault();
  const locale = useLocale() as AppLocale;
  const views = useRootWorkbenchViews(locale);
  const catalogReady = useWorkbenchCatalog(locale) !== null;
  const clientReady = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const desktop = clientReady && isDesktopShell();
  const vaultOpen = Boolean(vault.manifest || vault.partialTotal);
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

  // Not yet known whether this is the installed app.
  if (!clientReady) return <DesktopVaultRedirect />;
  if (vaultOpen) {
    if (views) return <views.HomePage />;
    if (desktop) return <DesktopVaultRedirect />;
    // With the catalog here the shell already shows the rail, so a bare frame would flash beside it.
    if (catalogReady) return <RouteLoadingFallback />;
  } else if (desktop || vault.awaitingVaultChoice) {
    // A neutral frame until the restore is attempted, or FirstRun flashes.
    return vault.restoreAttempted && views ? <views.FirstRunPage /> : <DesktopVaultRedirect />;
  }
  return <DesktopVaultRedirect />;
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
