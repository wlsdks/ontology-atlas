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
  /**
   * **한 번에 한 도구.** 넷을 동시에 펼쳤더니 실측(1512×917)에서 이 패널만 977px 이
   * 돼 시트(836px)를 넘겼다 — 단계 ① 하나가 시트 전체를 먹고 ②(재시작)·③(확인)이
   * 스크롤 밖으로 밀렸다. 3단계라고 말하는 화면에서 2·3단계가 없는 것처럼 됐다.
   *
   * 사용자는 자기 도구 **하나**만 쓴다. 그래서 프로젝트 스코프와 같은 구조로
   * 맞췄다 — 도구를 고르고, 고른 것만 본다. 부수 효과로 높이 편차(154px)도
   * 사라진다: 반복 세트가 아니라 슬롯 하나가 되기 때문이다.
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
      <p className="text-label leading-relaxed text-[color:var(--color-text-tertiary)]">
        {t('scopeGlobalIntro')}
      </p>

      {/* 도구 고르기 — 프로젝트 스코프의 도구별 버튼과 같은 구조. */}
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
            className={`rounded-chip border px-2.5 py-1 text-label font-medium transition-colors ${
              entry.id === client.id
                ? 'border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]'
                : 'border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]'
            }`}
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
        <p className="mt-1 text-caption leading-relaxed text-[color:var(--color-text-tertiary)]">
          {instruction.kind === 'command'
            ? t('scopeGlobalRunHint')
            : t('scopeGlobalPasteHint', { path: instruction.path })}
        </p>
        {/*
          * **줄바꿈으로 전체를 보인다.** `overflow-x: auto` 로 뒀더니 넷 다 잘렸고
          * (실측), 잘린 자리가 정확히 **볼트 절대 경로**였다 — 이 패널의 값이
          * "경로가 이미 채워져 있다" 인데 그 값이 화면에서 안 보였다. 복사 버튼은
          * 전체를 복사하지만, 사용자는 화면에서 확인할 수 없는 것을 믿지 않는다.
          */}
        <pre
          data-testid={`agent-global-scope-body-${client.id}`}
          className="mt-1.5 whitespace-pre-wrap break-all rounded border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-2 py-1.5 font-mono text-caption leading-relaxed text-[color:var(--color-text-secondary)]"
        >
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
      </div>

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
