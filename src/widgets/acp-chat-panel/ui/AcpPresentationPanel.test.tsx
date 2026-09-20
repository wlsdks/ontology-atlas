import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AcpPresentationTrace } from '@/features/acp-session';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
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

/**
 * **The two arrows had no test anywhere in the repository** (checked 2026-09-20: every other
 * control on this panel — the citation, the ask, the map continuation — is referenced by a test,
 * and `acp-presentation-previous` and `acp-presentation-next` by none).
 *
 * They are the most pressed controls the panel has: walking a presentation is Next, Next, Next.
 */
describe('walking the scenes', () => {
  const walk = (activeIndex: number, handlers: Partial<{ onChangeScene: () => void; onClose: () => void }> = {}) => {
    const onChangeScene = vi.fn();
    const onClose = vi.fn();
    render(
      <AcpPresentationPanel
        trace={trace}
        activeIndex={activeIndex}
        onChangeScene={handlers.onChangeScene ?? onChangeScene}
        onOpenMap={vi.fn()}
        onAsk={vi.fn()}
        onClose={handlers.onClose ?? onClose}
      />,
    );
    return { onChangeScene, onClose };
  };

  it('offers no way back from the first scene', () => {
    walk(0);
    expect(screen.getByTestId('acp-presentation-previous')).toBeDisabled();
    expect(screen.getByTestId('acp-presentation-next')).toBeEnabled();
  });

  it('goes forward and back by one scene', () => {
    const { onChangeScene } = walk(1);
    fireEvent.click(screen.getByTestId('acp-presentation-previous'));
    expect(onChangeScene).toHaveBeenCalledWith(0);
  });

  it('the last scene ends the walk rather than pretending there is another', () => {
    const { onChangeScene, onClose } = walk(trace.scenes.length - 1);
    const next = screen.getByTestId('acp-presentation-next');
    expect(next.textContent).toContain('finish');
    fireEvent.click(next);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onChangeScene, 'the walk ran past its last scene').not.toHaveBeenCalled();
  });

  it('every control a walk presses carries the coarse touch floor', () => {
    /*
     * `--control-h-sm` is 28px and the `button` shape has no coarse promotion — only `chip`,
     * `row`, `pill` and `segment` do — so these three sat 16px under `--touch-target-min`.
     * jsdom cannot measure the box, so this checks the class that carries it; the pixel proof
     * for the same mistake on the auto-allowed receipt is in `agent-auto-allowed-receipt.spec.ts`.
     */
    walk(0);
    for (const id of ['acp-presentation-ask', 'acp-presentation-previous', 'acp-presentation-next']) {
      expect(screen.getByTestId(id).className, `${id} has no coarse floor`).toContain('atlas-touch-floor');
    }
  });
});
