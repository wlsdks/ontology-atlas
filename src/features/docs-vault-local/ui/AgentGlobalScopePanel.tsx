'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy } from 'lucide-react';

import type { McpServerLaunch } from '@/shared/config';
import { copyText } from '@/shared/lib/copy-text';

import { AGENT_CLIENTS, type AgentClientId } from '../lib/agent-clients';
import { globalScopeInstruction } from '../lib/agent-global-scope';

/**
 * **이 컴퓨터 전체** 스코프 — 네 도구의 전역 설정을 한 화면에서.
 *
 * 앱이 홈 디렉토리를 대신 고치지 않는 이유는 `lib/agent-global-scope.ts` 의 머리말에
 * 있다(감사 가능성 · `~/.claude.json` lost-update · 업계 선례 0/12). 여기서는 그
 * 결론의 **화면 쪽 계약** 둘만 지킨다:
 *
 * 1. **사용자가 조립하지 않는다.** 볼트 절대 경로가 이미 박힌 완성된 한 줄을 준다.
 *    "경로를 당신 것으로 바꾸세요" 는 앱이 할 일을 사용자에게 넘기는 것이다.
 * 2. **상실을 말한다.** 홈 폴더에 쓰면 `git diff` 에 남지 않는다. 이 제품이 감사
 *    가능성을 주장하므로, 그 주장이 성립하지 않는 자리에서는 화면이 먼저 말해야
 *    한다 — 사과문이 아니라 사실로.
 */

export interface AgentGlobalScopePanelProps {
  /** 볼트 절대 경로. 전역 설정은 볼트 옆이 아니라서 상대 경로가 성립하지 않는다. */
  vaultPath: string | null;
  /** 번들 서버 실행 계약. 없으면(웹) 실행 가능한 값을 만들 수 없어 그리지 않는다. */
  launch: McpServerLaunch | null;
}

export function AgentGlobalScopePanel({ vaultPath, launch }: AgentGlobalScopePanelProps) {
  const t = useTranslations('agentConnect');
  const [copied, setCopied] = useState<AgentClientId | null>(null);

  const copy = useCallback(async (client: AgentClientId, text: string) => {
    if (await copyText(text)) setCopied(client);
  }, []);

  if (!vaultPath || !launch) return null;

  return (
    <div className="flex flex-col gap-2" data-testid="agent-global-scope">
      <p className="text-label leading-relaxed text-[color:var(--color-text-tertiary)]">
        {t('scopeGlobalIntro')}
      </p>

      <ul className="flex flex-col gap-2">
        {AGENT_CLIENTS.map((client) => {
          const instruction = globalScopeInstruction(client.id, { launch, vaultAbsolute: vaultPath });
          const isCopied = copied === client.id;
          return (
            <li
              key={client.id}
              data-testid={`agent-global-scope-${client.id}`}
              className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-body font-medium text-[color:var(--color-text-primary)]">{client.name}</p>
                <p className="shrink-0 font-mono text-caption text-[color:var(--color-text-quaternary)]">
                  {instruction.path}
                </p>
              </div>
              <p className="mt-1 text-caption leading-relaxed text-[color:var(--color-text-tertiary)]">
                {instruction.kind === 'command'
                  ? t('scopeGlobalRunHint')
                  : t('scopeGlobalPasteHint', { path: instruction.path })}
              </p>
              <pre className="mt-1.5 overflow-x-auto rounded border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-2 py-1.5 font-mono text-caption leading-relaxed text-[color:var(--color-text-secondary)]">
                {instruction.text.trimEnd()}
              </pre>
              <button
                type="button"
                onClick={() => void copy(client.id, instruction.text)}
                data-testid={`agent-global-scope-copy-${client.id}`}
                className="mt-1.5 inline-flex items-center gap-1.5 rounded border border-[color:var(--color-border-soft)] px-2 py-1 text-label font-medium text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
              >
                {isCopied ? (
                  <Check size={12} aria-hidden className="text-[color:var(--color-status-success)]" />
                ) : (
                  <Copy size={12} aria-hidden />
                )}
                {isCopied
                  ? t('scopeGlobalCopied')
                  : instruction.kind === 'command'
                    ? t('scopeGlobalCopyCommand')
                    : t('scopeGlobalCopySnippet')}
              </button>
            </li>
          );
        })}
      </ul>

      {/*
        * **상실 문장.** 프로젝트 스코프의 `connectPlanAuditNote` 와 짝이다 — 한쪽은
        * "git diff 로 확인된다"고 말하고, 이쪽은 "여기서는 그게 안 된다"고 말한다.
        * 짝 없이 한쪽만 있으면 사용자는 감사 가능성이 어디서 끝나는지 모른다.
        */}
      <p
        data-testid="agent-global-scope-loss"
        className="text-caption leading-relaxed text-[color:var(--color-text-quaternary)]"
      >
        {t('scopeGlobalLossNote')}
      </p>
    </div>
  );
}
