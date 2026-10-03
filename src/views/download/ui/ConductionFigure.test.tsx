import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../messages/en.json';
import {
  castContains,
  CONDUCTION_ANSWER,
  CONDUCTION_CAST,
  CONDUCTION_PROPOSAL,
  CONDUCTION_QUERY,
} from '../model/conduction-cast';
import { ConductionFigure } from './ConductionFigure';
import { useStageGraph } from '../lib/use-stage-graph';

const ROOT = path.resolve(__dirname, '../../../..');
const KIND_FOLDER = { capability: 'capabilities', element: 'elements', domain: 'domains' } as const;

function IntlWrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

function stageGraph() {
  return renderHook(() => useStageGraph(), { wrapper: IntlWrapper }).result.current;
}

function frontmatterPath(id: string): string | null {
  const kind = id.slice(0, id.indexOf(':')) as keyof typeof KIND_FOLDER;
  const file = path.join(ROOT, 'docs/ontology', KIND_FOLDER[kind], `${id.slice(id.indexOf(':') + 1)}.md`);
  const match = /^path:\s*(\S+)\s*$/m.exec(readFileSync(file, 'utf8'));
  return match?.[1] ?? null;
}

describe('the conduction cast is this repository’s own ontology', () => {
  const graph = stageGraph();
  const nodeKind = new Map(graph.nodes.map((node) => [node.id, node.kind]));
  const edges = new Set(graph.edges.map((edge) => `${edge.source}>${edge.target}:${edge.kind}`));

  it('names only concepts the vault holds, at the kind it records', () => {
    for (const concept of CONDUCTION_CAST) expect(nodeKind.get(concept.id), concept.id).toBe(concept.kind);
  });

  it('draws only relations the vault declares, in their direction', () => {
    for (const relation of [...castContains(), ...CONDUCTION_ANSWER, CONDUCTION_PROPOSAL]) {
      expect(edges.has(`${relation.from}>${relation.to}:${relation.relation}`), `${relation.from} → ${relation.to}`).toBe(true);
    }
  });

  it('raises each capability and element from the file its own frontmatter names, and that file exists', () => {
    for (const concept of CONDUCTION_CAST.filter((entry) => entry.file !== null)) {
      expect(frontmatterPath(concept.id), concept.id).toBe(concept.file);
      expect(existsSync(path.join(ROOT, concept.file!)), concept.file!).toBe(true);
    }
  });

  it('asks about the concept the evidence section shows, by the slug MCP accepts', () => {
    expect(CONDUCTION_QUERY.slug).toBe(`capabilities/${CONDUCTION_QUERY.concept.slice('capability:'.length)}`);
  });
});

describe('ConductionFigure', () => {
  const graph = stageGraph();
  const animate = vi.fn();
  let reduced = false;

  beforeEach(() => {
    reduced = false;
    animate.mockReset();
    animate.mockImplementation(() => ({
      pause: vi.fn(),
      play: vi.fn(),
      cancel: vi.fn(),
      finished: new Promise(() => undefined),
      effect: null,
    }));
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1120);
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (Element.prototype as { animate?: unknown }).animate;
  });

  const mount = () =>
    render(
      <IntlWrapper>
        <ConductionFigure graph={graph} />
      </IntlWrapper>,
    );

  it('is a labelled figure that says it is an illustration and names what came from the vault', () => {
    mount();
    const figure = screen.getByRole('figure', { name: /illustration/i });
    expect(figure).toHaveAccessibleDescription(/MCP tool server/);
    const description = screen.getByTestId('download-conduction-description').textContent ?? '';
    for (const fact of ['get_concept', CONDUCTION_QUERY.slug, 'Construction guidance', 'Meaning write safety', 'illustrative']) {
      expect(description).toContain(fact);
    }
  });

  it('plays on the house clock with a pause control', async () => {
    mount();
    await screen.findByTestId('download-conduction-scene');
    expect(animate).toHaveBeenCalled();
    expect(screen.getByTestId('download-conduction-figure')).toHaveAttribute('data-conduction-state', 'running');
    expect(screen.getByRole('button', { name: 'Pause the illustration' })).toBeInTheDocument();
  });

  it('under reduced motion holds the finished frame: no animation and no control', async () => {
    reduced = true;
    mount();
    await screen.findByTestId('download-conduction-scene');
    expect(animate).not.toHaveBeenCalled();
    expect(screen.getByTestId('download-conduction-figure')).toHaveAttribute('data-conduction-state', 'still');
    expect(screen.queryByTestId('download-conduction-control')).toBeNull();
  });

  it('trusts the latest of several intersection entries delivered together, so a scroll right after load still plays', async () => {
    const observers: { callback: IntersectionObserverCallback; options?: IntersectionObserverInit }[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
          observers.push({ callback, options });
        }
        observe() {}
        disconnect() {}
      },
    );
    mount();
    const deliver = (intersecting: boolean[]) =>
      act(() => {
        for (const { callback } of observers) {
          callback(intersecting.map((isIntersecting) => ({ isIntersecting }) as IntersectionObserverEntry), {} as IntersectionObserver);
        }
      });
    await waitFor(() => expect(observers.length).toBeGreaterThanOrEqual(2));
    deliver([false, true]);
    await screen.findByTestId('download-conduction-scene');
    await waitFor(() =>
      expect(screen.getByTestId('download-conduction-figure')).toHaveAttribute('data-conduction-state', 'running'),
    );
    deliver([true, false]);
    await waitFor(() =>
      expect(screen.getByTestId('download-conduction-figure')).toHaveAttribute('data-conduction-state', 'paused'),
    );
  });

  it('falls back to the finished frame when the browser refuses an animation', async () => {
    animate.mockImplementation(() => {
      throw new Error('refused');
    });
    mount();
    await screen.findByTestId('download-conduction-scene');
    await waitFor(() =>
      expect(screen.getByTestId('download-conduction-figure')).toHaveAttribute('data-conduction-state', 'still'),
    );
    expect(screen.queryByTestId('download-conduction-control')).toBeNull();
  });
});
