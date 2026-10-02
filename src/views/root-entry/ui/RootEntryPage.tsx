"use client";

import { useState, useSyncExternalStore } from "react";
import { Bot, FolderSearch, HardDrive, Network, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocalVault } from "@/entities/vault-session";
import { Button, IconButton } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { isDesktopShell } from "@/shared/lib/desktop-shell";
import { GatewayLandingPage } from "@/views/download";
import { HomePage } from "@/views/home";
import { FirstRunPage } from "@/views/first-run";

/**
 * The root entry: a chosen or restored vault goes straight to the map (`HomePage`), with no starter; the
 * installed app without one gets `FirstRunPage`; the web without one gets the gateway, by the same
 * verdict as the shell's `isGatewaySurface`, so chrome and content agree.
 */
export function RootEntryPage() {
  const vault = useLocalVault();
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const clientReady = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  if (!clientReady) return <DesktopVaultRedirect />;
  if (vault.manifest || vault.partialTotal) return <HomePage />;
  /* A person choosing between their folders gets the chooser, not the web gateway. */
  if (isDesktopShell() || vault.awaitingVaultChoice) {
    // A neutral frame until the restore is attempted, or FirstRun flashes.
    return vault.restoreAttempted ? <FirstRunPage /> : <DesktopVaultRedirect />;
  }
  /*
   * A visitor whose connected folder no longer reads gets a notice and the picker over the gateway.
   * The stored handle is kept: a failed restore does not prove the folder is gone.
   */
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
