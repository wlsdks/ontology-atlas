import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../messages/en.json';
import ko from '../../../../messages/ko.json';
import { MeaningContext } from './MeaningContext';

describe('meaning definition evidence action', () => {
  it.each([{ locale: 'en', messages: en }, { locale: 'ko', messages: ko }])('keeps the selected document action in both preview states for $locale', ({ locale, messages }) => {
    const onEvidence = vi.fn();
    const props = { node: { id: 'capability:retry', title: 'Retry', kind: 'capability', summary: 'Retries but never persists.' as string | undefined }, relations: [], onSelectRelation: vi.fn(), onEvidence };
    const view = render(<NextIntlClientProvider locale={locale} messages={messages}><MeaningContext {...props} /></NextIntlClientProvider>);
    expect(screen.getByText(props.node.summary!)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: messages.analysisWorkbench.openDefinition }));
    expect(onEvidence).toHaveBeenLastCalledWith(props.node.id);
    view.rerender(<NextIntlClientProvider locale={locale} messages={messages}><MeaningContext {...props} node={{ ...props.node, summary: undefined }} /></NextIntlClientProvider>);
    expect(screen.getByText(messages.analysisWorkbench.definitionMissing)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: messages.analysisWorkbench.openDefinition }));
    expect(onEvidence).toHaveBeenCalledTimes(2);
    expect(onEvidence).toHaveBeenLastCalledWith(props.node.id);
  });
});
