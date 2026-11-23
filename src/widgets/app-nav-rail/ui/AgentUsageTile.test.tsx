import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import en from '../../../../messages/en.json';
import ko from '../../../../messages/ko.json';
import { agentUsage, type UsageReport } from '@/entities/agent-usage';

import { AgentUsageTile } from './AgentUsageTile';

const HOUR_MS = 3_600_000;
const READ_AT = Date.UTC(2026, 10, 24, 5, 51);
const CATALOGUES = { en, ko } as const;

const report = (parts: Partial<UsageReport>): UsageReport => ({ sessionId: 's-1', context: null, cost: null, limits: {}, ...parts });

function renderTile(locale: keyof typeof CATALOGUES = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={CATALOGUES[locale]} timeZone="UTC">
      <AgentUsageTile />
    </NextIntlClientProvider>,
  );
}

const tile = () => screen.getByTestId('agent-usage-tile');
const popover = () => screen.getByTestId('agent-usage-popover');

/** The popover judges reset windows by the moment it opens: ten minutes after the last update. */
beforeEach(() => {
  vi.useFakeTimers({ now: READ_AT + 10 * 60_000, toFake: ['Date'] });
});
afterEach(() => {
  cleanup();
  act(() => agentUsage.reset());
  vi.useRealTimers();
});

describe('the agent usage tile', () => {
  it('draws nothing before the agent reports', () => {
    renderTile();
    expect(screen.queryByTestId('agent-usage-tile')).toBeNull();
  });

  it('shows the context window alone for an agent that reports tokens only', () => {
    act(() => agentUsage.record({ runtimeId: 'codex-acp', name: null }, report({ context: { usedTokens: 68_000, windowTokens: 272_000 } }), READ_AT));
    renderTile();
    expect(tile()).toHaveAccessibleName('Codex usage, context 25% full');
    expect(screen.getByTestId('agent-usage-ring-context')).toHaveAttribute('data-ring-fraction', '0.250');
    fireEvent.click(tile());
    expect(within(popover()).getByTestId('agent-usage-no-limits')).toHaveTextContent('Codex does not send its account limits to Atlas.');
    expect(within(popover()).getByTestId('agent-usage-context')).toHaveTextContent(/25% full.*68,000 of 272,000 tokens · as of 5:51/);
    expect(within(popover()).queryByTestId('agent-usage-cost')).toBeNull();
  });

  it('rings each reported limit and lists it with its reset, then this conversation and its cost', () => {
    act(() => agentUsage.record({ runtimeId: 'claude-acp', name: null }, report({
      context: { usedTokens: 42_180, windowTokens: 200_000 },
      cost: { amount: 0.4213, currency: 'USD' },
      limits: {
        fiveHour: { usedFraction: 0.88, resetsAtMs: READ_AT + 3 * HOUR_MS },
        weekly: { usedFraction: 0.42, resetsAtMs: READ_AT + 50 * HOUR_MS },
      },
    }), READ_AT));
    renderTile();
    expect(tile()).toHaveAccessibleName('Claude Agent usage, 5-hour limit: 88% used, Weekly limit: 42% used');
    expect(screen.getByTestId('agent-usage-ring-fiveHour')).toHaveAttribute('data-level', 'warning');
    expect(screen.getByTestId('agent-usage-ring-weekly')).toHaveAttribute('data-level', 'calm');
    expect(screen.queryByTestId('agent-usage-ring-context')).toBeNull();

    fireEvent.click(tile());
    const rows = within(popover()).getAllByTestId('agent-usage-limit');
    expect(rows.map((row) => row.getAttribute('data-limit-window'))).toEqual(['fiveHour', 'weekly']);
    expect(rows[0]).toHaveTextContent(/5-hour limit88% usedResets 8:51 AM · as of 5:51 AM/);
    expect(rows[1]).toHaveTextContent(/Weekly limit42% usedResets Thu 7:51 AM · as of 5:51 AM/);
    expect(within(popover()).getByTestId('agent-usage-cost')).toHaveTextContent('Cost$0.42Estimate reported by Claude Agent · as of 5:51 AM');
  });

  it('stays in its selected look while open, and a second press or Escape closes it', () => {
    act(() => agentUsage.record({ runtimeId: 'codex-acp', name: null }, report({ context: { usedTokens: 1, windowTokens: 10 } }), READ_AT));
    renderTile();
    fireEvent.click(tile());
    expect(tile()).toHaveAttribute('data-open', 'true');
    expect(tile()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(tile());
    expect(tile()).toHaveAttribute('data-open', 'false');
    fireEvent.click(tile());
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(tile()).toHaveAttribute('data-open', 'false');
  });

  it('leaves out a limit whose window reset before the popover opened', () => {
    act(() => agentUsage.record({ runtimeId: 'claude-acp', name: null }, report({
      limits: {
        fiveHour: { usedFraction: 0.9, resetsAtMs: READ_AT + 5 * 60_000 },
        weekly: { usedFraction: 0.3, resetsAtMs: READ_AT + 50 * HOUR_MS },
      },
    }), READ_AT));
    renderTile();
    fireEvent.click(tile());
    expect(within(popover()).getAllByTestId('agent-usage-limit').map((row) => row.getAttribute('data-limit-window'))).toEqual(['weekly']);
  });

  it.each([
    ['the name the conversation shows', { runtimeId: 'claude-code', name: 'Claude Agent' }, 'Claude Agent'],
    ['a plain word for an agent nobody named', { runtimeId: 'custom-runner-acp', name: null }, 'Your agent'],
  ])('calls the agent by %s everywhere and never by its runtime id', async (_case, agent, shown) => {
    act(() => agentUsage.record(agent, report({
      context: { usedTokens: 10, windowTokens: 100 },
      cost: { amount: 0.1, currency: 'USD' },
    }), READ_AT));
    renderTile();
    expect(tile()).toHaveAccessibleName(`${shown} usage, context 10% full`);
    act(() => tile().focus());
    expect(await screen.findByRole('tooltip')).toHaveTextContent(`${shown} usage`);
    fireEvent.click(tile());
    expect(popover()).toHaveAccessibleName(`${shown} usage`);
    expect(popover()).toHaveTextContent(`${shown} usage`);
    expect(within(popover()).getByTestId('agent-usage-no-limits')).toHaveTextContent(`${shown} does not send its account limits to Atlas.`);
    expect(within(popover()).getByTestId('agent-usage-cost')).toHaveTextContent(`Estimate reported by ${shown}`);
    expect(document.body.textContent).not.toContain(agent.runtimeId);
    expect(tile().getAttribute('aria-label')).not.toContain(agent.runtimeId);
  });

  it('names the limits in plain Korean', () => {
    act(() => agentUsage.record({ runtimeId: 'claude-acp', name: null }, report({ limits: { fiveHour: { usedFraction: 0.42, resetsAtMs: READ_AT + HOUR_MS } } }), READ_AT));
    renderTile('ko');
    fireEvent.click(tile());
    expect(within(popover()).getByTestId('agent-usage-limit')).toHaveTextContent(/5시간 한도42% 사용.*6:51에 초기화 · .*5:51 기준/);
  });
});
