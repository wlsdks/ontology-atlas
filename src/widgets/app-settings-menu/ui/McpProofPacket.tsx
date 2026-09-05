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
 * The AI agent's first-contact proof packet - a typed handoff pasted straight into an agent,
 * rather than a card for a human to read.
 *
 * ## Why it is a component now (2026-09-05)
 *
 * It used to be a card sitting on its own, below the connect pane. On the installed app that put
 * it **after** the three steps that end in "check the connection", so the thing that actually
 * proves the connection stood outside the step whose whole job is proving it. It is now the last
 * thing inside step 3.
 *
 * On the web there is no step 3 - no runnable server means steps 2 and 3 do not exist, and
 * drawing a greyed-out step is a dead end rather than guidance - so the same component stands on
 * its own at the end of the pane there. **One component, two placements**, because the two
 * surfaces really do have different shapes (`.claude/rules/surfaces.md`); a second copy is what
 * would let the packet drift between them.
 *
 * ⚠️ **Moved once before** (2026-08-21, ledger 90) and it nearly disappeared with the surface it
 * lived on - only the "Copy" button inside a deleted branch used the constant, and lint's
 * unused-variable warning is what revealed it. The surface may move; the handoff lives.
 */
/**
 * ⚠️ **The commands are built, not frozen** (2026-09-05, design council).
 *
 * This was a module constant, so it shipped two lines nobody could run:
 * `pnpm cli:mcp-verify docs/ontology` needs the checkout as its working directory and exits
 * "Vault root not found" from anywhere else, and `node cli/src/index.mjs` is a relative path to a
 * file the reader does not have. A packet exists to be pasted into an agent that is somewhere
 * else; a command that only works where it was written is not a proof step, it is a trap.
 *
 * So both lines go through the same three pieces the connect panel already uses — `ATLAS_CLI`
 * (the repo's one invocation form, carrying `$ATLAS` plus the hint that says how to set it),
 * `vaultPathForPacket` (the real absolute path when this surface knows it, an instruction to fill
 * in when it does not), and `shellQuoteForPacket` (so a folder with a space in its name survives).
 */
function buildMcpFirstCallsPacket(vaultName: string, vaultPath: string | null): string {
  const vaultArg = shellQuoteForPacket(vaultPathForPacket(vaultName, vaultPath));
  return [
    'Ontology Atlas MCP first-contact proof packet',
    '',
    ATLAS_CLI_HINT_EN,
    '',
    /*
     * `codex mcp list` was the first step and is **one client's command**. Somebody in Claude Code
     * or Cursor met an instruction naming a program they do not have as step 1 of proving their
     * own connection. What every client can answer is `tools/list`, which is now step 1.
     */
    'Direct MCP proof inside the current agent session:',
    '1. tools/list -> read toolCount from connection_info for the current number; finalize_project_meaning and query_ontology must be present',
    '2. query_ontology({"operation":"agent_brief"})',
    '3. query_ontology({"operation":"workspace_brief"})',
    '4. query_ontology({"operation":"health"})',
    '',
    'If direct MCP tools are missing, this is CLI fallback proof only:',
    `${ATLAS_CLI} mcp-verify ${vaultArg} --timeout-ms 15000`,
    '',
    /*
     * The stale-cache hint used to name **23 tools**. `connection_info` reports 36 today, so the
     * number was telling a reader that a correct client was broken. A count that has to be
     * maintained by hand in prose is a count that will be wrong again, so the hint compares
     * against what `connection_info` says instead of against a literal.
     */
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
      {/*
        ⚠️ **No `font-mono` on the label** (2026-09-05). What gets copied is a command packet; the
        word on the button is ordinary prose, and in Korean a monospace face does nothing but make
        that prose harder to read - monospace has no Hangul metrics to align. Monospace is for a
        command or an address, and this button is neither.
      */}
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
