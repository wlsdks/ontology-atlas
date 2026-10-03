import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../messages/en.json';
import { CONDUCTION_CAST } from '../model/conduction-cast';
import { CHANGE_BEATS, CHANGE_CAST, changeRest, changeTracks } from './change-scene';
import { ChangeSection } from './ChangeFigure';
import { frames, TEST_ENV } from './showpiece-player';
import { useStageGraph } from '../lib/use-stage-graph';

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

const MEASURE = { rows: CHANGE_CAST.map(() => ({ travel: { dx: -420, dy: -60 }, thread: 240 })) };

describe('the after-a-commit cast is this repository’s own ontology', () => {
  const nodeKind = new Map(graph.nodes.map((node) => [node.id, node.kind]));

  it('names each changed file’s concept, whose frontmatter path is that file, and the file exists', () => {
    for (const row of CHANGE_CAST) {
      expect(nodeKind.get(row.concept), row.concept).toBe(row.concept.slice(0, row.concept.indexOf(':')));
      expect(frontmatterPath(row.concept), row.concept).toBe(row.file);
      expect(existsSync(path.join(ROOT, row.file)), row.file).toBe(true);
    }
  });

  it('shows only calm concepts the vault holds, and none of the conduction figure’s cast', () => {
    const conduction = new Set(CONDUCTION_CAST.map((concept) => concept.id));
    for (const id of CHANGE_CAST.flatMap((row) => [row.concept, ...row.calm])) {
      expect(nodeKind.has(id), id).toBe(true);
      expect(conduction.has(id), id).toBe(false);
    }
  });
});

describe('the after-a-commit choreography', () => {
  const tracks = changeTracks(MEASURE, TEST_ENV);

  it('runs its beats on the spec’s clock', () => {
    expect(CHANGE_BEATS.light).toEqual([360, 480, 600]);
    expect(CHANGE_BEATS.travel).toEqual([1100, 1135, 1170]);
    expect(CHANGE_BEATS.answer).toBe(1500);
    expect(CHANGE_BEATS.offer).toBe(1900);
  });

  it('moves at most 32 elements', () => {
    expect(Object.keys(tracks).length).toBeLessThanOrEqual(32);
  });

  it('ends every lane on the frame React renders at rest', () => {
    for (const [part, lanes] of Object.entries(tracks)) {
      const rest = changeRest(part);
      for (const stops of lanes) {
        const last = frames(2800, stops).at(-1)!;
        for (const key of Object.keys(last)) {
          if (key === 'offset' || key === 'easing' || !(key in rest)) continue;
          expect(String(last[key]), `${part}.${key}`).toBe(String(rest[key]));
        }
      }
    }
  });

  it('animates only opacity, transform and the light’s dash', () => {
    const allowed = new Set(['opacity', 'transform', 'strokeDasharray', 'strokeDashoffset']);
    for (const lanes of Object.values(tracks)) {
      for (const stops of lanes) for (const [, value] of stops) for (const key of Object.keys(value)) expect(allowed).toContain(key);
    }
  });
});

describe('ChangeSection', () => {
  const animate = vi.fn();
  let reduced = false;
  const observers: IntersectionObserverCallback[] = [];

  beforeEach(() => {
    reduced = false;
    observers.length = 0;
    animate.mockReset();
    animate.mockImplementation(() => ({
      pause: vi.fn(),
      play: vi.fn(),
      cancel: vi.fn(),
      finished: new Promise(() => undefined),
    }));
    Element.prototype.animate = animate as unknown as Element['animate'];
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('reduce') ? reduced : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          observers.push(callback);
        }
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (Element.prototype as { animate?: unknown }).animate;
  });

  const mount = () =>
    render(
      <IntlWrapper>
        <ChangeSection graph={graph} />
      </IntlWrapper>,
    );

  const deliver = (ratio: number) =>
    act(() => {
      for (const callback of observers) {
        callback([{ isIntersecting: ratio > 0, intersectionRatio: ratio } as IntersectionObserverEntry], {} as IntersectionObserver);
      }
    });

  it('is a labelled illustration whose description tells the whole story', () => {
    mount();
    expect(screen.getByRole('figure', { name: /illustration/i })).toHaveAccessibleDescription(/Library workspace/);
    const section = screen.getByTestId('download-change-section');
    for (const text of ['which meanings to recheck', '3 concepts whose meaning stands while the code under it moved', 'Ask the agent']) {
      expect(section.textContent).toContain(text);
    }
    for (const row of CHANGE_CAST) expect(section.textContent).toContain(row.file);
  });

  it('plays once it is a third in view, with a pause control', async () => {
    mount();
    deliver(0);
    expect(animate).not.toHaveBeenCalled();
    deliver(0.5);
    await waitFor(() => expect(animate).toHaveBeenCalled());
    expect(screen.getByTestId('download-change-figure')).toHaveAttribute('data-showpiece-state', 'running');
    expect(screen.getByRole('button', { name: 'Pause the illustration' })).toBeInTheDocument();
    deliver(0.1);
    await waitFor(() => expect(screen.getByTestId('download-change-figure')).toHaveAttribute('data-showpiece-state', 'paused'));
  });

  it('shows the rest frame on a reload with the figure already in view', async () => {
    mount();
    deliver(0.6);
    await waitFor(() => expect(screen.getByTestId('download-change-figure')).toHaveAttribute('data-showpiece-state', 'finished'));
    expect(animate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Play the illustration again' })).toBeInTheDocument();
  });

  it('under reduced motion is the rest frame: no animation and no control', () => {
    reduced = true;
    mount();
    deliver(0);
    deliver(0.6);
    expect(animate).not.toHaveBeenCalled();
    expect(screen.getByTestId('download-change-figure')).toHaveAttribute('data-showpiece-state', 'still');
    expect(screen.queryByTestId('download-change-figure-control')).toBeNull();
  });

  it('falls back to the rest frame when the browser refuses an animation', async () => {
    animate.mockImplementation(() => {
      throw new Error('refused');
    });
    mount();
    deliver(0);
    deliver(0.6);
    await waitFor(() => expect(screen.getByTestId('download-change-figure')).toHaveAttribute('data-showpiece-state', 'still'));
    expect(screen.queryByTestId('download-change-figure-control')).toBeNull();
  });
});
