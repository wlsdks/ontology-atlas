import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { GLOSSARY_TERMS } from '@/shared/config/term-glossary';
import { TermHint } from './term-hint';
import en from '../../../messages/en.json';
import ko from '../../../messages/ko.json';

function renderHint(locale: 'en' | 'ko' = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ko}>
      <TermHint term="mcp">MCP connections</TermHint>
    </NextIntlClientProvider>,
  );
}

const panel = () => screen.queryByTestId('term-hint-panel-mcp');

describe('TermHint', () => {
  it('names the term on the icon button and keeps the label beside it', () => {
    renderHint('ko');
    expect(screen.getByText('MCP connections')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'MCP 설명' })).toBeInTheDocument();
    expect(panel()).toBeNull();
  });

  it('opens on hover with the expansion and the explanation', async () => {
    renderHint();
    fireEvent.pointerMove(screen.getByRole('button', { name: 'About MCP' }), { pointerType: 'mouse' });
    expect(await screen.findByTestId('term-hint-panel-mcp')).toHaveTextContent(
      en.termHints.mcp.expansion + en.termHints.mcp.explanation,
    );
  });

  it('opens on keyboard focus and closes on Escape', async () => {
    renderHint();
    const button = screen.getByRole('button', { name: 'About MCP' });
    act(() => button.focus());
    expect(await screen.findByTestId('term-hint-panel-mcp')).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(panel()).toBeNull());
  });

  it('toggles on tap', async () => {
    renderHint();
    const button = screen.getByRole('button', { name: 'About MCP' });
    await act(async () => {
      fireEvent.pointerDown(button, { pointerType: 'touch' });
      fireEvent.click(button);
    });
    expect(await screen.findByTestId('term-hint-panel-mcp')).toBeInTheDocument();
    await act(async () => {
      fireEvent.pointerDown(button, { pointerType: 'touch' });
      fireEvent.click(button);
    });
    await waitFor(() => expect(panel()).toBeNull());
  });

  it('has an expansion and an explanation for every term in both locales', () => {
    for (const messages of [en, ko]) {
      for (const term of GLOSSARY_TERMS) {
        const entry = (messages.termHints as Record<string, { expansion?: string; explanation?: string }>)[term];
        expect(entry?.expansion?.trim(), term).toBeTruthy();
        expect(entry?.explanation?.trim(), term).toBeTruthy();
      }
    }
  });
});
