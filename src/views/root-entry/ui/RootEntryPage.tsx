"use client";

import { useSyncExternalStore } from "react";
import { Bot, HardDrive, Network } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocalVault } from "@/features/docs-vault-local";
import { isDesktopShell } from "@/shared/lib/desktop-shell";
import { GatewayLandingPage } from "@/views/download";
import { HomePage } from "@/views/home";
import { FirstRunPage } from "@/views/first-run";

/**
 * The root `/` entry branch, split by whether a vault is chosen:
 *
 * - **Web with no vault → the gateway.** `/` is that visitor's **face**. The condition matches the
 *   shell's own gateway verdict (`isGatewaySurface`), so chrome and content cannot disagree.
 * - **Desktop with no vault → `FirstRunPage`** (an Obsidian-style first run: open, create, demo). An
 *   installed app enters local work, not promotion.
 * - **Vault chosen, including a restore → `HomePage`.** The **return-visit contract**: when a vault
 *   handle already in use is restored from IndexedDB, you go straight to your own vault hub with no
 *   starter module, no SAMPLE badge, and no bottom-right readout — "do not make people click every time
 *   they come back." The `vault.manifest` check below handles this branch first, for web and desktop
 *   alike, and the INDEX panel's own gate (`restoreAttempted && mode === 'static'`) separately prevents
 *   a one-frame flicker before the restore completes.
 *
 * **The hub is the map.** An earlier design had `/` and `/ontology` each rendering the (then) tree/ego
 * hub `OntologyViewPage` as a deliberate dual surface. Redefining the hub as the map means `/` now
 * renders the same `HomePage` as `/topology` (map + INDEX + datasheet). `/ontology` remains its own
 * route but converges on the same surface through a thin redirect (`OntologyRedirectPage`) — the point
 * that the two URLs are still distinct explicit entry points survives; only the destination merged into
 * one map hub.
 */
export function RootEntryPage() {
  const vault = useLocalVault();
  const clientReady = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  if (!clientReady) return <DesktopVaultRedirect />;
  if (vault.manifest) return <HomePage />;
  if (isDesktopShell()) {
    // Hold a neutral boot frame until the restore has been attempted — if there is a vault to restore,
    // this stops FirstRun from flashing for one frame.
    return vault.restoreAttempted ? <FirstRunPage /> : <DesktopVaultRedirect />;
  }
  // A web visitor who has not opened any folder yet. **For this person `/` is the face.** The condition
  // matches the shell's gateway verdict (`isGatewaySurface`), so chrome and content cannot disagree.
  // Opening a vault moves them to the `vault.manifest` branch above and the map.
  return <GatewayLandingPage />;
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
