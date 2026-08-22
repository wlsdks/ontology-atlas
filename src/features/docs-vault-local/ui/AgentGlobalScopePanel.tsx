'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import type { McpServerLaunch } from '@/shared/config';
import { copyText } from '@/shared/lib/copy-text';
import { controlClass } from '@/shared/ui/control-class';

import { AGENT_CLIENTS, type AgentClientId } from '../lib/agent-clients';
import { globalScopeInstruction } from '../lib/agent-global-scope';

/**
 * **Whole-computer** scope — the global config for all four tools on one screen.
 *
 * Why the app does not edit the home directory on the user's behalf is in the preamble of
 * `lib/agent-global-scope.ts` (auditability, the `~/.claude.json` lost update, 0/12 industry
 * precedent). Here only the two **screen-side contracts** of that conclusion are kept:
 *
 * 1. **The user does not assemble anything.** A finished line with the vault's absolute path already
 *    embedded. "Replace the path with your own" hands the app's job to the user.
 * 2. **The loss is stated.** Writing into the home folder leaves no trace in `git diff`. This product
 *    claims auditability, so where that claim does not hold the screen has to say so first — as a
 *    fact, not an apology.
 */

export interface AgentGlobalScopePanelProps {
  /** The vault's absolute path. A global config does not sit beside the vault, so relative paths cannot work. */
  vaultPath: string | null;
  /** The bundled server's launch contract. Without it (the web) no runnable value can be built, so nothing is drawn. */
  launch: McpServerLaunch | null;
}

export function AgentGlobalScopePanel({ vaultPath, launch }: AgentGlobalScopePanelProps) {
  const t = useTranslations('agentConnect');
  /**
   * **One tool at a time.** With all four expanded, this panel measured 977px at 1512×917 and
   * overflowed the sheet (836px) — step ① alone ate the whole sheet and ② (restart) and ③ (verify)
   * were pushed out of scroll. On a screen that says "three steps", steps 2 and 3 effectively did not
   * exist.
   *
   * A user uses **one** tool. So it matches the project scope's structure — pick a tool, see only the
   * one you picked. As a side effect the 154px height variance disappears too, because it becomes one
   * slot rather than a repeated set.
   */
  const [selected, setSelected] = useState<AgentClientId>(AGENT_CLIENTS[0].id);
  const [copied, setCopied] = useState<AgentClientId | null>(null);

  const copy = useCallback(async (client: AgentClientId, text: string) => {
    if (await copyText(text)) setCopied(client);
  }, []);

  if (!vaultPath || !launch) return null;

  const client = AGENT_CLIENTS.find((entry) => entry.id === selected) ?? AGENT_CLIENTS[0];
  const instruction = globalScopeInstruction(client.id, { launch, vaultAbsolute: vaultPath });
  const isCopied = copied === client.id;

  return (
    <div className="flex flex-col gap-2" data-testid="agent-global-scope">
      <p className="text-label leading-prose text-[color:var(--color-text-tertiary)]">
        {t('scopeGlobalIntro')}
      </p>

      {/* Tool selection — the same structure as the project scope's per-tool buttons. */}
      <div
        role="tablist"
        aria-label={t('scopeGlobalToolLabel')}
        data-testid="agent-global-scope-tools"
        className="flex flex-wrap gap-1"
      >
        {AGENT_CLIENTS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={entry.id === client.id}
            onClick={() => setSelected(entry.id)}
            data-testid={`agent-global-scope-tool-${entry.id}`}
            className={controlClass({
              shape: 'chip',
              active: entry.id === client.id,
              className: 'font-[var(--font-weight-signature)] hover:text-[color:var(--color-text-primary)]',
            })}
          >
            {entry.name}
          </button>
        ))}
      </div>

      <div
        data-testid={`agent-global-scope-${client.id}`}
        className="rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5"
      >
        <p className="font-mono text-caption text-[color:var(--color-text-quaternary)]">
          {instruction.path}
        </p>
        <p className="mt-1 text-caption leading-label text-[color:var(--color-text-tertiary)]">
          {instruction.kind === 'command'
            ? t('scopeGlobalRunHint')
            : t('scopeGlobalPasteHint', { path: instruction.path })}
        </p>
        {/*
          * **Wrapping shows the whole thing.** With `overflow-x: auto` all four were clipped
          * (measured), and what was clipped was exactly the **vault's absolute path** — while this
          * panel's whole value is "the path is already filled in". The copy button copies all of it,
          * but a user does not trust what they cannot see on screen.
          */}
        <pre
          data-testid={`agent-global-scope-body-${client.id}`}
          className="mt-1.5 whitespace-pre-wrap break-all rounded-micro border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-2 py-1.5 font-mono text-caption leading-label text-[color:var(--color-text-secondary)]"
        >
          {instruction.text.trimEnd()}
        </pre>
        <button
          type="button"
          onClick={() => void copy(client.id, instruction.text)}
          data-testid={`agent-global-scope-copy-${client.id}`}
          className={controlClass({ hoverInk: 'strong', hoverBorder: 'strong',
            shape: 'chip',
            tone: 'secondary',
            className: 'mt-1.5 font-[var(--font-weight-signature)]',
          })}
        >
          {isCopied ? (
            <Check size={ICON_SIZE.sm} aria-hidden className="text-[color:var(--color-status-success)]" />
          ) : (
            <Copy size={ICON_SIZE.sm} aria-hidden />
          )}
          {isCopied
            ? t('scopeGlobalCopied')
            : instruction.kind === 'command'
              ? t('scopeGlobalCopyCommand')
              : t('scopeGlobalCopySnippet')}
        </button>
      </div>

      {/*
        * **The loss sentence.** It pairs with the project scope's `connectPlanAuditNote` — one says
        * "this is verifiable with git diff", this one says "that does not work here". With only one
        * of the pair, a user cannot tell where auditability ends.
        */}
      <p
        data-testid="agent-global-scope-loss"
        className="text-caption leading-label text-[color:var(--color-text-quaternary)]"
      >
        {t('scopeGlobalLossNote')}
      </p>
    </div>
  );
}
