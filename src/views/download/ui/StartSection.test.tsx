import { existsSync } from 'node:fs';
import path from 'node:path';

import { act, render, renderHook, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../messages/en.json';
import { useStageGraph } from '../lib/use-stage-graph';
import { START_DRAFT, START_FOLDER, START_PATH } from '../model/start-cast';
import { setMotionPaused } from '@/shared/motion/motion-pause';
import { StartSection } from './StartSection';

const ROOT = path.resolve(__dirname, '../../../..');

function IntlWrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

const graph = renderHook(() => useStageGraph(), { wrapper: IntlWrapper }).result.current;


describe('the start steps show this repository’s own folder and concepts', () => {
  it('lists folders that exist and picks the folder that holds the map', () => {
    const paths = ['docs/', 'docs/ontology/', 'src/', 'AGENTS.md'];
    START_FOLDER.forEach((row, index) => expect(paths[index].endsWith(row.name), row.name).toBe(true));
    for (const entry of paths) expect(existsSync(path.join(ROOT, entry)), entry).toBe(true);
    expect(existsSync(path.join(ROOT, START_PATH, 'README.md'))).toBe(true);
  });

  it('proposes a domain the vault holds and two capabilities it contains, under the names the map gives them', () => {
    render(<StartSection graph={graph} />, { wrapper: IntlWrapper });
    const scene = screen.getByTestId('gateway-step-scene-1');
    const names = new Map(graph.nodes.map((node) => [node.id, node.label]));
    const contains = new Set(graph.edges.filter((edge) => edge.kind === 'contains').map((edge) => `${edge.source}>${edge.target}`));
    START_DRAFT.forEach((id, index) => {
      expect(scene.textContent, id).toContain(names.get(id));
      if (index) expect(contains.has(`${START_DRAFT[0]}>${id}`), id).toBe(true);
    });
  });

  it('names the app’s own buttons in the steps after install', () => {
    render(<StartSection graph={graph} />, { wrapper: IntlWrapper });
    const steps = screen.getByTestId('gateway-start-steps');
    expect(steps.querySelectorAll(':scope > li')).toHaveLength(3);
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
    render(<StartSection graph={graph} />, { wrapper: IntlWrapper });
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

describe('the step scenes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(Element.prototype, 'animate');
    act(() => setMotionPaused(false));
  });

  function watch() {
    const deliver = stubObserver();
    const runs: { pause: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> }[] = [];
    Element.prototype.animate = vi.fn(() => {
      const run = { pause: vi.fn(), play: vi.fn(), cancel: vi.fn(), ready: new Promise(() => {}) };
      runs.push(run);
      return run;
    }) as unknown as Element['animate'];
    render(<StartSection graph={graph} />, { wrapper: IntlWrapper });
    return { deliver, runs };
  }

  it('builds its tracks once the rail is seen and cancels them while the page’s motion is paused', () => {
    const { deliver, runs } = watch();
    expect(runs).toHaveLength(0);
    act(() => deliver[1]([{ isIntersecting: true }]));
    expect(runs.length).toBeGreaterThan(3);
    act(() => setMotionPaused(true));
    expect(runs.every((run) => run.cancel.mock.calls.length > 0)).toBe(true);
  });

  it('builds nothing under reduced motion, so the final frames stand', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    const { runs } = watch();
    expect(runs).toHaveLength(0);
  });
});
