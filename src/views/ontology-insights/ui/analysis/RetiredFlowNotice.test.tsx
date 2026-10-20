import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../../messages/en.json';
import { RetiredFlowNotice } from './RetiredFlowNotice';

function notice(count: number, onOpenHistory: (() => void) | null) {
  return render(<NextIntlClientProvider locale="en" messages={en}><RetiredFlowNotice count={count} onOpenHistory={onOpenHistory} /></NextIntlClientProvider>);
}

describe('the retired Written explanations notice', () => {
  it('says only the first sentence when the folder holds no saved explanation', () => {
    notice(0, vi.fn());
    expect(screen.getByTestId('analysis-flow-retired')).toHaveTextContent('The Written explanations tab is gone.');
    expect(screen.queryByTestId('analysis-flow-retired-count')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/MCP/)).toBeNull();
  });

  it('counts the saved explanations and offers the history when an agent is ready', () => {
    const open = vi.fn();
    notice(2, open);
    expect(screen.getByTestId('analysis-flow-retired-count')).toHaveTextContent('The 2 explanations saved in this folder stay in .ontology-atlas/analyses/.');
    fireEvent.click(screen.getByRole('button', { name: 'Open in Findings & history' }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/MCP/)).toBeNull();
  });

  it('names one explanation in the singular and points at MCP without an agent', () => {
    notice(1, null);
    expect(screen.getByTestId('analysis-flow-retired-count')).toHaveTextContent('The 1 explanation saved in this folder stays');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Ask your coding agent to read them through MCP.')).toBeInTheDocument();
  });
});
