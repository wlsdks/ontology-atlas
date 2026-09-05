import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AcpPresentationTrace } from '@/features/acp-session';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import { AcpPresentationPanel } from './AcpPresentationPanel';

const trace: AcpPresentationTrace = {
  status: 'ready',
  intent: 'business-flow',
  sourceHidden: {
    proven: true,
    atlasReadCalls: 3,
    fullBodyConcepts: 3,
    toolDiscoveryCalls: 0,
    nonAtlasSourceCalls: 0,
  },
  scenes: [
    {
      id: 'scene-1-project',
      title: 'Product',
      body: 'ontology-atlas explains the product.',
      citations: ['ontology-atlas'],
      citationReads: [{ slug: 'ontology-atlas', toolCallId: 'read-project' }],
      qualification: 'cited',
      focus: { slug: 'ontology-atlas', toolCallId: 'read-project' },
    },
    {
      id: 'scene-2-domain',
      title: 'Boundary',
      body: 'domains/core remains partial.',
      citations: ['domains/core'],
      citationReads: [{ slug: 'domains/core', toolCallId: 'read-domain' }],
      qualification: 'limited',
      focus: { slug: 'domains/core', toolCallId: 'read-domain' },
    },
  ],
};

describe('AcpPresentationPanel outside Map', () => {
  it('keeps citations readable and makes Map an explicit optional continuation', () => {
    const onOpenMap = vi.fn();
    render(
      <AcpPresentationPanel
        trace={trace}
        activeIndex={0}
        onChangeScene={vi.fn()}
        onOpenMap={onOpenMap}
        onAsk={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const citation = screen.getByTestId('acp-presentation-citation');
    expect(citation.tagName).toBe('SPAN');
    fireEvent.click(screen.getByTestId('acp-presentation-open-map'));
    expect(onOpenMap).toHaveBeenCalledWith(trace.scenes[0]);
  });

  it('keeps direct citation focus on the Map-owned version', () => {
    const onFocusCitation = vi.fn();
    render(
      <AcpPresentationPanel
        trace={trace}
        activeIndex={0}
        onChangeScene={vi.fn()}
        onFocusCitation={onFocusCitation}
        onAsk={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('acp-presentation-citation'));
    expect(onFocusCitation).toHaveBeenCalledWith('ontology-atlas', 'read-project');
    expect(screen.queryByTestId('acp-presentation-open-map')).toBeNull();
  });
});
