import { useTranslations } from 'use-intl';

import { Surface } from '@/shared/ui';

import { AgentHandoffPacket } from '../AgentHandoffPacket';
import { AgentPromptText } from '../AgentPromptText';
import { MetaToggle } from './MetaToggle';

export type AgentMetaBranch = 'prompt' | 'handoff';

/**
 * The two side branches below the composer, "View instructions" and "Continue in the terminal". They
 * open one at a time: they are needed only when leaving or in doubt, so they do not sit permanently.
 */
export function AgentMetaDisclosure({
  meta,
  heldMeta,
  onToggle,
  vaultPath,
  focusedSlug,
  systemPrompt,
  constructionBoundary,
}: {
  meta: AgentMetaBranch | null;
  /** `meta` held through the exit window: once `meta` is null the box would otherwise collapse while empty. */
  heldMeta: AgentMetaBranch | null;
  onToggle: (branch: AgentMetaBranch) => void;
  vaultPath: string | null;
  focusedSlug: string | null;
  systemPrompt: string;
  /** Construction narrows what leaves the machine, so its boundary replaces the usual one. */
  constructionBoundary: boolean;
}) {
  const t = useTranslations('vaultAgentPanel');
  return (
    <>
      {/* One row of side branches: only the toggle sits permanently, and the two buttons close each other. */}
      <div className="mt-2 flex items-center gap-2">
        <MetaToggle
          testId="agent-meta-prompt"
          open={meta === 'prompt'}
          label={t('promptDisclosure.summary')}
          onToggle={() => onToggle('prompt')}
        />
        {vaultPath ? (
          <>
            <span
              aria-hidden="true"
              className="text-label text-[color:var(--color-text-quaternary)]"
            >
              ·
            </span>
            <MetaToggle
              testId="agent-meta-handoff"
              open={meta === 'handoff'}
              label={t('handoffSummary')}
              onToggle={() => onToggle('handoff')}
            />
          </>
        ) : null}
      </div>

      {/* `origin` is the trigger's direction, up and to the left of the box. */}
      <Surface
        open={meta !== null}
        origin="top left"
        data-testid="agent-meta-disclosure"
        className="mt-2 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-2.5"
      >
        {heldMeta === 'prompt' ? (
          <AgentPromptText
            systemPrompt={systemPrompt}
            note={t('promptDisclosure.note')}
          />
        ) : vaultPath ? (
          <AgentHandoffPacket
            vaultPath={vaultPath}
            focusedSlug={focusedSlug}
            labels={{
              boundary: t(constructionBoundary ? 'construction.boundary' : 'boundary'),
              note: t('handoffNote'),
              copy: t('handoffCopy'),
              copied: t('handoffCopied'),
            }}
          />
        ) : null}
      </Surface>
    </>
  );
}
