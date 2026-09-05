'use client';

import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

import { Chip } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useCopyFeedback } from '@/shared/lib/use-copy-feedback';
import { Check, Copy } from 'lucide-react';

import { useAgentServer, useLocalVault } from '@/entities/vault-session';
import { OpenVaultCta } from '@/features/docs-vault-local';
import { getTauriVaultRootPath } from '@/shared/lib/tauri-vault-fs';
import { summarizeVaultValidation } from '@/shared/lib/validate-vault-document';

import { McpProofPacket } from './McpProofPacket';
import { VaultAgentSetupPanel } from './VaultAgentSetupPanel';

/**
 * The "MCP Connection" pane, bundled so it **stands on its own**.
 *
 * ## Why it exists (2026-08-20, ledger 90)
 *
 * While this pane lived only inside the settings sheet, the sheet called the hooks
 * and passed values down. When the "Agent" destination appeared there were two
 * consumers, and copying the derivation logic (the validation summary) into both
 * would make the two screens state different warning counts from that moment on.
 *
 * ## Why it is drawn on the web too (this is the pane's reason to exist)
 *
 * MCP attaches to **the folder**, not to an Atlas screen — the agent starts the
 * server on its own side and that server reads and writes the vault on disk
 * directly. So web users connect too (ledger 2026-08-01, "The web's 'cannot connect' was a lie" — the web's "cannot connect" was a lie). The one thing a browser
 * cannot do is **save the config file for you, because it does not know the
 * absolute path**, and that is answered by building the config on screen for the
 * person to paste.
 *
 * The runners pane on `/agents`, when it says on the web that it cannot launch a
 * program, still has to name a place a person can actually reach. Since 2026-09-05 that
 * place is **another destination**, so the sentence carries a link to `/mcp` rather than
 * a section name — a name is only guidance while the thing named is on the same screen.
 */
/**
 * **The terminal path, for someone who will not hand the browser a folder.**
 *
 * Measured 2026-09-04: `/en/agents/` with no folder open showed exactly two things — "No
 * workspace connected" and "Open my folder". A person who does not want to grant a browser
 * File System Access, which is most of the people this destination is written for, had no way
 * to see how an agent connects at all. The whole point of this pane is that MCP attaches to the
 * folder rather than to an Atlas screen, and that is precisely what the terminal can do without
 * the browser being involved.
 *
 * Two lines, copied as one block so the order survives the paste: `init` makes the vault,
 * `agent-setup --write` writes the config files that point the coding tools at it.
 */
const CLI_TERMINAL_SETUP = [
  'node $ATLAS/cli/src/index.mjs init my-vault',
  'node $ATLAS/cli/src/index.mjs agent-setup my-vault --write',
].join('\n');

export function AgentSetupSection({ onBeforeNavigate }: { onBeforeNavigate?: () => void } = {}) {
  const t = useTranslations('nav.settingsMenu');
  const localVault = useLocalVault();
  const { state: copyState, copy } = useCopyFeedback();
  const serverAvailability = useAgentServer();
  const isLoaded = localVault.status === 'loaded';

  if (!isLoaded) {
    return (
      /* The section box's inset comes from the ramp — 16px is not written again by
         hand (`static-card-adoption-ratchet`: a new file is at 0 from day one). */
      <div className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
        <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
          {t('agentStatusNoVault')}
        </p>
        <p className="mt-1 break-keep text-label leading-label text-[color:var(--color-text-tertiary)]">
          {t('agentNoVaultHint')}
        </p>
        {/*
          ⚠️ **The way to open it has to sit where it is mentioned** (2026-08-20,
          caught by e2e). The first version moved only the sentence "open the
          folder and …" and **did not bring the button** — exactly the "dead-end
          CTA" this repository forbids by name. The action being asked for happens
          right there.
        */}
        {/*
          ⚠️ **The ask is the indigo one** (design council, 2026-09-05). This card asks for a
          folder, and it asked in neutral ink while "Get the macOS app" below it was the only
          indigo on the screen — one emphasis per region, and it was on the wrong control.
        */}
        <div className="mt-3">
          <OpenVaultCta
            testId="agents-open-vault"
            tone="accentOnTint"
            className="border-[color:var(--color-indigo-line-a35)] bg-[color:var(--color-indigo-a10)] hover:border-[color:var(--color-indigo-line-a54)] hover:bg-[color:var(--color-indigo-a16)]"
          />
        </div>
        <div
          data-testid="agents-terminal-setup"
          className="mt-4 border-t border-[color:var(--color-divider)] pt-3"
        >
          <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
            {t('agentTerminalTitle')}
          </p>
          <p className="mt-1 break-keep text-label leading-label text-[color:var(--color-text-tertiary)]">
            {t('agentTerminalBody')}
          </p>
          <pre className="mt-2 overflow-x-auto rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2 font-mono text-label leading-prose text-[color:var(--color-text-secondary)] shadow-[inset_0_1px_2px_var(--color-shadow-a35)]">
            {CLI_TERMINAL_SETUP}
          </pre>
          <p className="mt-2 text-label leading-prose text-[color:var(--color-text-quaternary)]">
            {t('cliPlaceholderHint')}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* Neutral on purpose: the card's own ask is "Open my folder" above, and
                measured on 2026-09-04 an indigo-tinted chip here was the only chromatic
                control in the card and outranked it. One emphasis per region. */}
            {/*
              ⚠️ **No `font-mono` on the label** (2026-09-05). The block above is a command and
              wears monospace correctly; the word on this button is prose, and in Korean a
              monospace face only makes prose harder to read - there are no Hangul metrics for it
              to align.
            */}
            <Chip
              data-testid="agents-terminal-setup-copy"
              onClick={() => void copy(CLI_TERMINAL_SETUP)}
            >
              {copyState === 'copied' ? (
                <Check size={ICON_SIZE.sm} aria-hidden />
              ) : (
                <Copy size={ICON_SIZE.sm} aria-hidden />
              )}
              {copyState === 'copied' ? t('agentTerminalCopied') : t('agentTerminalCopy')}
            </Chip>
            {/* The app path stays in the same place as the terminal path — someone who
                does not want either the browser folder or the terminal still has one.
                Only where there is no bundled server: the installed app must never
                offer its own download (AGENTS.md), and `launch` is non-null exactly there. */}
            {serverAvailability.launch === null ? (
              <Link
                href="/download/"
                onClick={onBeforeNavigate}
                data-testid="agents-terminal-setup-download"
                /* Secondary now: the folder above is what this card is asking for. */
                className={controlClass({
                  shape: 'link',
                  tone: 'muted',
                  hoverInk: 'strong',
                  className: 'h-8',
                })}
              >
                {t('agentTerminalAppLink')}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    {/*
      `agent-setup-section` wraps **the config panel only**. On this surface the proof packet
      stays outside it, because the subject of the e2e inventory that measures this name
      (`agent-connect-panel-census`) is 「the first screen of the pane you attach from」. Putting
      the packet inside took the copy buttons from 4 to 5 and blew the ratchet — and **the ratchet
      was right**: what that check counts is "how many copy buttons someone attaching meets on the
      first screen", not the whole page.
    */}
    <div data-testid="agent-setup-section" className="min-w-0">
    <VaultAgentSetupPanel
      canEditCurrent
      localVault={localVault}
      serverAvailability={serverAvailability}
      validationSummary={deriveValidationSummary(localVault)}
      // On the destination there is no sheet to close. The prop is still required,
      // so a no-op is passed explicitly — leaking `undefined` makes the caller
      // re-decide «is it fine to omit this» every time.
      onOpenWorkflowGuide={onBeforeNavigate ?? (() => undefined)}
    />
    </div>
    {/*
      **The proof packet, on the surface that has no step 3.** With a runnable server the packet
      lives inside step 3, where confirming the connection is the step's whole job. Here there is
      no step 3 to live in — `launch === null` is the exact condition the panel calls
      `publicPackagesReady`, and without it steps 2 and 3 are not drawn at all — and the handoff
      still has to be reachable, so the same component stands on its own.
    */}
    {serverAvailability.launch === null ? (
      <div className="mt-4">
        {/*
          `getTauriVaultRootPath` answers only inside the installed app; in a browser it is null
          and the packet prints the fill-in-the-path instruction, which is the true state here.
        */}
        <McpProofPacket
          vaultName={localVault.handle?.name ?? 'vault'}
          vaultPath={localVault.handle ? getTauriVaultRootPath(localVault.handle) : null}
        />
      </div>
    ) : null}
    </>
  );
}

/**
 * Vault validation summary — **it only has a value when something is wrong.**
 *
 * Both consumers must state the same number, so it is written once here (with two
 * copies, one day one of them starts counting warnings differently — Carbon).
 */
function deriveValidationSummary(
  localVault: ReturnType<typeof useLocalVault>,
): { errorCount: number; warningCount: number } | null {
  if (localVault.status !== 'loaded' || !localVault.manifest) return null;
  const summary = summarizeVaultValidation(
    localVault.manifest.docs.map((doc) => ({ slug: doc.slug, frontmatter: doc.frontmatter })),
  );
  if (summary.errorCount === 0 && summary.warningCount === 0) return null;
  return { errorCount: summary.errorCount, warningCount: summary.warningCount };
}
