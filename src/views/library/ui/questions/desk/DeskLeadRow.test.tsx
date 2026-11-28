import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'use-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../../../messages/en.json';
import type { DeskLead } from '@/features/library';

import { DeskLeadRow } from './DeskLeadRow';

/** A row shows at most 320 characters and an ellipsis at each cut end. */
const SHOWN_MAX = 322;

describe('Question desk lead row', () => {
  it('shows a one-line megabyte unit as a bounded window around its first matched word', () => {
    const before = 'a ledger entry with no answer in it, '.repeat(42_000);
    const after = 'stock moves, '.repeat(120_000);
    const text = `${before}the refund is queued for approval, ${after}`;
    expect(text.length).toBeGreaterThan(3_000_000);
    const lead: DeskLead = { kind: 'source', key: 'source:sources/ledger.md#l1', hit: { path: 'sources/ledger.md', anchor: 'l1', text, score: 1 }, reason: 'words' };
    render(<IntlProvider locale="en" messages={en}>
      <ul><DeskLeadRow lead={lead} terms={['refund', 'approval', 'stock']} reason={null} citationState={() => 'observed'} jev={null} jevResult={null}
        rise={false} riseDelay={0} onOpenWiki={vi.fn()} onOpenSource={vi.fn()} /></ul>
    </IntlProvider>);
    const open = screen.getByRole('button', { name: /the refund is queued/u });
    const shown = open.querySelector('[data-lead-sentence]')!;
    expect(shown.textContent!.length).toBeLessThanOrEqual(SHOWN_MAX);
    expect(open.getAttribute('aria-label')).toBe(shown.textContent);
    expect(shown.textContent).toMatch(/^….*…$/u);
    // After the first match the unit holds 120,000 more; the runs come from the window alone.
    expect(shown.querySelectorAll('.font-\\[var\\(--font-weight-emphasis\\)\\]').length).toBeGreaterThan(0);
    expect(shown.childNodes.length).toBeLessThanOrEqual(2 * Math.ceil(SHOWN_MAX / 'stock'.length) + 1);
  });
});
