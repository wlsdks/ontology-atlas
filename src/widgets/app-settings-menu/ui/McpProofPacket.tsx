'use client';

import { useTranslations } from 'next-intl';
import { Check, Copy } from 'lucide-react';

import { Chip } from '@/shared/ui';
import {
  ATLAS_CLI,
  ATLAS_CLI_HINT_EN,
  shellQuoteForPacket,
  vaultPathForPacket,
} from '@/shared/config/cli-invocation';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useCopyFeedback } from '@/shared/lib/use-copy-feedback';

/**
 * The commands are built, not frozen, so they run wherever the packet is pasted: `ATLAS_CLI`
 * gives the one invocation form, `vaultPathForPacket` the absolute path or a fill-in
 * instruction, and `shellQuoteForPacket` keeps a path with spaces intact.
 */
function buildMcpFirstCallsPacket(vaultName: string, vaultPath: string | null): string {
  const vaultArg = shellQuoteForPacket(vaultPathForPacket(vaultName, vaultPath));
  return [
    'Ontology Atlas MCP first-contact proof packet',
    '',
    ATLAS_CLI_HINT_EN,
    '',
    // Step 1 is `tools/list`, which every client can answer, not one client's command.
    'Direct MCP proof inside the current agent session:',
    '1. tools/list -> read toolCount from connection_info for the current number; finalize_project_meaning and query_ontology must be present',
    '2. query_ontology({"operation":"agent_brief"})',
    '3. query_ontology({"operation":"workspace_brief"})',
    '4. query_ontology({"operation":"health"})',
    '',
    'If direct MCP tools are missing, this is CLI fallback proof only:',
    `${ATLAS_CLI} mcp-verify ${vaultArg} --timeout-ms 15000`,
    '',
    // The stale-cache hint compares against `connection_info`'s count, never a literal that goes stale.
    'Stale client cache hint:',
    'If tools/list disagrees with connection_info toolCount, or query_ontology is not callable, reload/restart the agent or refresh cached MCP tools.',
    '',
    'Project ontology indexing checkpoint (side effect 0):',
    'Replace [codebase-root] with the current checkout path before running project indexing.',
    'index_project({"rootPath":"[codebase-root]"})',
    `${ATLAS_CLI} index [codebase-root] --vault ${vaultArg} --json --threshold 2`,
    '',
    'Meaning gate: report the business/product domain and capability first, then cite code index rows as implementation evidence.',
    'Business evidence: include meaningGate.businessOntology.evidence rows from README and docs/ontology.',
    'Review queue: include meaningGate.implementationEvidence.reviewRequiredRows so humans can name folders that still lack product meaning.',
    'Do not promote source folders to capabilities when existing ontology evidence maps them through matching slugs or capability elements.',
  ].join('\n');
}

/**
 * The agent's first-contact proof packet, a typed handoff pasted into an agent. One component
 * in two placements (`.claude/rules/surfaces.md`): last in step 3 with a runnable server, and
 * standalone where there is no step 3, so the packet cannot drift between copies.
 */
export function McpProofPacket({
  /** `boxed` draws its own card; `inline` sits inside a step that already has one. */
  frame = 'boxed',
  vaultName,
  /** The folder's absolute path where this surface knows it — `null` in a browser, which cannot. */
  vaultPath = null,
}: {
  frame?: 'boxed' | 'inline';
  vaultName: string;
  vaultPath?: string | null;
}) {
  const t = useTranslations('nav.settingsMenu');
  const { state: copyState, copy } = useCopyFeedback();
  const packet = buildMcpFirstCallsPacket(vaultName, vaultPath);

  return (
    <div
      data-testid="mcp-proof-packet"
      className={
        frame === 'boxed'
          ? 'rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]'
          : 'mt-2'
      }
    >
      <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
        {t('mcpProofTitle')}
      </p>
      <p className="mt-1 break-keep text-label leading-label text-[color:var(--color-text-tertiary)]">
        {t('mcpProofBody')}
      </p>
      {/* No `font-mono`: the label is prose, and monospace has no Hangul metrics. */}
      <Chip
        tone="accentOnTint"
        data-testid="agents-mcp-proof-copy"
        onClick={() => void copy(packet)}
        className="mt-2 w-full justify-center border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] hover:bg-[color:var(--color-indigo-a24)]"
      >
        {copyState === 'copied' ? (
          <Check size={ICON_SIZE.sm} aria-hidden />
        ) : (
          <Copy size={ICON_SIZE.sm} aria-hidden />
        )}
        {copyState === 'copied' ? t('mcpProofCopied') : t('mcpProofCopy')}
      </Chip>
    </div>
  );
}
