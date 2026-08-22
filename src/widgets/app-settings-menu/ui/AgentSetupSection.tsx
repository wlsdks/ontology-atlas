'use client';

import { useTranslations } from 'next-intl';

import { Chip } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useCopyFeedback } from '@/shared/lib/use-copy-feedback';
import { Check, Copy } from 'lucide-react';

import { OpenVaultCta, useAgentServer, useLocalVault } from '@/features/docs-vault-local';
import { summarizeVaultValidation } from '@/shared/lib/validate-vault-document';

import { VaultAgentSetupPanel } from './VaultAgentSetupPanel';

/**
 * The 「MCP 연결」 pane, bundled so it **stands on its own**.
 *
 * ## Why it exists (2026-08-20, ledger 90)
 *
 * While this pane lived only inside the settings sheet, the sheet called the hooks
 * and passed values down. When the 「에이전트」 destination appeared there were two
 * consumers, and copying the derivation logic (the validation summary) into both
 * would make the two screens state different warning counts from that moment on.
 *
 * ## Why it is drawn on the web too (this is the pane's reason to exist)
 *
 * MCP attaches to **the folder**, not to an Atlas screen — the agent starts the
 * server on its own side and that server reads and writes the vault on disk
 * directly. So web users connect too (ledger 2026-08-01, 「웹의 「연결 불가」는
 * 거짓이었다」 — the web's "cannot connect" was a lie). The one thing a browser
 * cannot do is **save the config file for you, because it does not know the
 * absolute path**, and that is answered by building the config on screen for the
 * person to paste.
 *
 * The runners pane, when it says on the web that it cannot launch a program, points
 * at *"the 「MCP 연결」 pane on this screen…"* — and if that pane is not on the same
 * screen, **the sentence points at nothing.** That is why the destination brings
 * this pane along.
 */
/**
 * The AI agent's first-contact proof packet — a typed handoff pasted straight into
 * an agent, rather than a card for a human to read.
 *
 * ⚠️ **Moved into this file** (2026-08-21, ledger 90). It used to live in the
 * settings sheet's MCP section, and when that section left for the 「에이전트」
 * destination it **nearly disappeared with it** — only the 「복사」 button inside the
 * deleted branch used this constant, and lint's unused-variable warning is what
 * revealed that.
 *
 * The surface may move, but **the handoff lives** — this repository already wrote
 * that same sentence back in the five-tab era.
 */
const MCP_FIRST_CALLS_PACKET = [
  'Ontology Atlas MCP first-contact proof packet',
  '',
  'Direct MCP proof inside the current agent session:',
  '1. codex mcp list',
  '2. tools/list -> read toolCount from connection_info for the current number; finalize_project_meaning and query_ontology must be present',
  '3. query_ontology({"operation":"agent_brief"})',
  '4. query_ontology({"operation":"workspace_brief"})',
  '5. query_ontology({"operation":"health"})',
  '',
  'If direct MCP tools are missing, this is CLI fallback proof only:',
  'pnpm cli:mcp-verify docs/ontology --timeout-ms 15000',
  '',
  'Stale client cache hint:',
  'If the client still says 23 tools or query_ontology is not callable, reload/restart the agent or refresh cached MCP tools.',
  '',
  'Project ontology indexing checkpoint (side effect 0):',
  'Replace [codebase-root] with the current checkout path before running project indexing.',
  'index_project({"rootPath":"[codebase-root]"})',
  'node cli/src/index.mjs index [codebase-root] --vault docs/ontology --json --threshold 2',
  '',
  'Meaning gate: report the business/product domain and capability first, then cite code index rows as implementation evidence.',
  'Business evidence: include meaningGate.businessOntology.evidence rows from README and docs/ontology.',
  'Review queue: include meaningGate.implementationEvidence.reviewRequiredRows so humans can name folders that still lack product meaning.',
  'Do not promote source folders to capabilities when existing ontology evidence maps them through matching slugs or capability elements.',
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
        <div className="mt-3">
          <OpenVaultCta testId="agents-open-vault" />
        </div>
      </div>
    );
  }

  return (
    <>
    {/*
      `agent-setup-section` wraps **the config panel only**. The proof packet card
      below stays outside it, because the subject of the e2e inventory that measures
      this name (`agent-connect-panel-census`) is 「the first screen of the pane you
      attach from」. Putting the packet inside took the copy buttons from 4 to 5 and
      blew the ratchet — and **the ratchet was right**: what that check counts is
      "how many copy buttons someone attaching meets on the first screen", not the
      whole page.
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
      **The first-contact proof packet** — instead of a human confirming by eye that
      the agent attached, it is pasted in so **the agent proves it itself**. It came
      along when this section moved from the sheet to the destination.
    */}
    <div className="mt-4 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
      <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
        {t('mcpProofTitle')}
      </p>
      <p className="mt-1 break-keep text-label leading-label text-[color:var(--color-text-tertiary)]">
        {t('mcpProofBody')}
      </p>
      <Chip
        tone="accentOnTint"
        data-testid="agents-mcp-proof-copy"
        onClick={() => void copy(MCP_FIRST_CALLS_PACKET)}
        className="mt-2 w-full justify-center border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] font-mono hover:bg-[color:var(--color-indigo-a24)]"
      >
        {copyState === 'copied' ? (
          <Check size={ICON_SIZE.sm} aria-hidden />
        ) : (
          <Copy size={ICON_SIZE.sm} aria-hidden />
        )}
        {copyState === 'copied' ? t('mcpProofCopied') : t('mcpProofCopy')}
      </Chip>
    </div>
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
