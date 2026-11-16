import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { act, render, renderHook, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../messages/en.json';
import { useStageGraph } from '../lib/use-stage-graph';
import { LOOP_CHANGED, LOOP_PROPOSAL, LOOP_READ } from '../model/loop-cast';
import { setMotionPaused } from '../lib/motion-pause';
import { LoopSection, StartSection } from './LoopSection';

const ROOT = path.resolve(__dirname, '../../../..');
const KIND_FOLDER = { capability: 'capabilities', element: 'elements' } as const;

function IntlWrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

const graph = renderHook(() => useStageGraph(), { wrapper: IntlWrapper }).result.current;

function frontmatterPath(id: string): string | null {
  const kind = id.slice(0, id.indexOf(':')) as keyof typeof KIND_FOLDER;
  const file = path.join(ROOT, 'docs/ontology', KIND_FOLDER[kind], `${id.slice(id.indexOf(':') + 1)}.md`);
  return /^path:\s*(\S+)\s*$/m.exec(readFileSync(file, 'utf8'))?.[1] ?? null;
}

describe('the loop section shows this repository’s own ontology', () => {
  const edges = new Set(graph.edges.map((edge) => `${edge.source}>${edge.target}:${edge.kind}`));

  it('answers the read with relations the vault declares and the file the concept names', () => {
    expect(LOOP_READ.slug).toBe(`capabilities/${LOOP_READ.concept.slice('capability:'.length)}`);
    expect(edges.has(`${LOOP_READ.domain}>${LOOP_READ.concept}:contains`), LOOP_READ.domain).toBe(true);
    for (const id of LOOP_READ.contains) expect(edges.has(`${LOOP_READ.concept}>${id}:contains`), id).toBe(true);
    for (const id of LOOP_READ.dependsOn) expect(edges.has(`${LOOP_READ.concept}>${id}:depends`), id).toBe(true);
    expect(frontmatterPath(LOOP_READ.concept)).toBe(LOOP_READ.path);
    expect(existsSync(path.join(ROOT, LOOP_READ.path)), LOOP_READ.path).toBe(true);
  });

  it('marks each changed file’s concept, whose frontmatter path is that file, and the file exists', () => {
    for (const row of LOOP_CHANGED) {
      expect(frontmatterPath(row.concept), row.concept).toBe(row.file);
      expect(existsSync(path.join(ROOT, row.file)), row.file).toBe(true);
    }
  });

  it('proposes a relation the vault declares, in its direction', () => {
    expect(edges.has(`${LOOP_PROPOSAL.from}>${LOOP_PROPOSAL.to}:depends`)).toBe(true);
  });

  it('draws each concept under the name the map gives it, and says which parts are examples', () => {
    render(<LoopSection graph={graph} />, { wrapper: IntlWrapper });
    const cards = screen.getByTestId('gateway-loop-cards');
    const names = new Map(graph.nodes.map((node) => [node.id, node.label]));
    for (const id of [LOOP_READ.concept, ...LOOP_READ.contains, ...LOOP_CHANGED.map((row) => row.concept)]) {
      expect(cards.textContent, id).toContain(names.get(id));
    }
    expect(cards.textContent).toContain(enMessages.acpChat.permission.allowOnce);
    expect(screen.getByText(enMessages.download.loop.note)).toBeVisible();
  });

  it('names the app’s own buttons in the steps after install', () => {
    render(<StartSection />, { wrapper: IntlWrapper });
    const steps = screen.getByTestId('gateway-start-steps');
    expect(steps.querySelectorAll('li')).toHaveLength(3);
    for (const word of [
      enMessages.firstRun.openTitle,
      enMessages.topology.startSteps.analyze.ctaAgent,
      `${enMessages.navRail.agents} › ${enMessages.navRail.mcp}`,
      enMessages.agentConnect.short.connect,
    ]) {
      expect(steps.textContent, word).toContain(word);
    }
  });
});

type Deliver = (entries: Partial<IntersectionObserverEntry>[]) => void;

function stubObserver(): Deliver[] {
  const deliver: Deliver[] = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        deliver.push((entries) => callback(entries as IntersectionObserverEntry[], this as never));
      }
      observe() {}
      disconnect() {}
    },
  );
  return deliver;
}

describe('the steps’ entrance', () => {
  afterEach(() => vi.unstubAllGlobals());

  function watch() {
    const deliver = stubObserver();
    render(<StartSection />, { wrapper: IntlWrapper });
    return { deliver, steps: screen.getByTestId('gateway-start-steps') };
  }

  it('is the whole picture until a script has seen the block below the fold', () => {
    expect(watch().steps).toHaveAttribute('data-gateway-entrance', 'still');
  });

  it('waits below the fold, then enters once when the block is seen', () => {
    const { deliver, steps } = watch();
    act(() => deliver[0]([{ isIntersecting: false }]));
    expect(steps).toHaveAttribute('data-gateway-entrance', 'waiting');
    act(() => deliver[0]([{ isIntersecting: false }, { isIntersecting: true }]));
    expect(steps).toHaveAttribute('data-gateway-entrance', 'entering');
  });

  it('never hides a block that is already in view when the page loads', () => {
    const { deliver, steps } = watch();
    act(() => deliver[0]([{ isIntersecting: true }]));
    expect(steps).toHaveAttribute('data-gateway-entrance', 'still');
  });
});

describe('the loop cards’ scene', () => {
  afterEach(() => vi.unstubAllGlobals());

  function watch() {
    const deliver = stubObserver();
    render(<LoopSection graph={graph} />, { wrapper: IntlWrapper });
    return { deliver, cards: screen.getByTestId('gateway-loop-cards') };
  }

  it('leaves every line standing until a script has seen the row', () => {
    expect(watch().cards).not.toHaveAttribute('data-gateway-scene-motion');
  });

  it('plays only while the row is in view, and holds its place when it leaves', () => {
    const { deliver, cards } = watch();
    act(() => deliver[0]([{ isIntersecting: true }]));
    expect(cards).toHaveAttribute('data-gateway-scene-motion', 'running');
    act(() => deliver[0]([{ isIntersecting: false }]));
    expect(cards).toHaveAttribute('data-gateway-scene-motion', 'paused');
  });

  it('pauses while the tab is hidden', () => {
    const { deliver, cards } = watch();
    act(() => deliver[0]([{ isIntersecting: true }]));
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(cards).toHaveAttribute('data-gateway-scene-motion', 'paused');
    hidden.mockRestore();
  });

  it('holds still while the page’s motion is paused, in view or not', () => {
    const { deliver, cards } = watch();
    act(() => deliver[0]([{ isIntersecting: true }]));
    act(() => setMotionPaused(true));
    expect(cards).toHaveAttribute('data-gateway-scene-motion', 'paused');
    act(() => setMotionPaused(false));
    expect(cards).toHaveAttribute('data-gateway-scene-motion', 'running');
  });

  it('never starts under reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    const { deliver, cards } = watch();
    expect(deliver).toHaveLength(0);
    expect(cards).not.toHaveAttribute('data-gateway-scene-motion');
  });
});
