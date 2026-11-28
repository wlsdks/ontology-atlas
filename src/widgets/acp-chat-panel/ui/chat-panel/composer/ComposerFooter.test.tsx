import { act, cleanup, render, screen } from '@testing-library/react';
import { IntlProvider, useTranslations } from 'use-intl';
import { afterEach, describe, expect, it } from 'vitest';

import en from '../../../../../../messages/en.json';
import ko from '../../../../../../messages/ko.json';
import { agentUsage } from '@/entities/agent-usage';

import { LimitNearNote } from './ComposerFooter';

const READ_AT = Date.UTC(2026, 10, 24, 5, 51);
const HOUR_MS = 3_600_000;
const CATALOGUES = { en, ko } as const;

function Note({ runtimeId }: { runtimeId: string }) {
  return <LimitNearNote t={useTranslations('acpChat')} runtimeId={runtimeId} />;
}

function renderNote(locale: keyof typeof CATALOGUES = 'en') {
  render(
    <IntlProvider locale={locale} messages={CATALOGUES[locale]}>
      <Note runtimeId="claude-acp" />
    </IntlProvider>,
  );
}

const fiveHour = (usedFraction: number, runtimeId = 'claude-acp') => act(() => agentUsage.record({ runtimeId, name: null }, {
  sessionId: 's-1',
  context: null,
  cost: null,
  limits: { fiveHour: { usedFraction, resetsAtMs: READ_AT + HOUR_MS } },
}, READ_AT));

const note = () => screen.queryByTestId('acp-chat-limit-near');

afterEach(() => {
  cleanup();
  act(() => agentUsage.reset());
});

describe('the limit note beside the agent name', () => {
  it('stays away below 70 percent', () => {
    fiveHour(0.69);
    renderNote();
    expect(note()).toBeNull();
  });

  it('names the five-hour limit from 70 percent in the calm tone', () => {
    fiveHour(0.7);
    renderNote();
    expect(note()).toHaveTextContent('70% of 5-hour limit');
    expect(note()).toHaveAttribute('data-level', 'notice');
  });

  it('turns the warning tone at 85 percent as the agent reports it', () => {
    fiveHour(0.72);
    renderNote();
    fiveHour(0.86);
    expect(note()).toHaveTextContent('86% of 5-hour limit');
    expect(note()).toHaveAttribute('data-level', 'warning');
  });

  it('follows only its own agent', () => {
    fiveHour(0.95, 'codex-acp');
    renderNote();
    expect(note()).toBeNull();
  });

  it('speaks Korean', () => {
    fiveHour(0.88);
    renderNote('ko');
    expect(note()).toHaveTextContent('5시간 한도 88%');
  });
});
