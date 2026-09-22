import { act, cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../messages/en.json';
import { InsightsPageEntry } from './InsightsPageEntry';

const work = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock('next/dynamic', () => ({
  default: () => function Analysis() {
    work.render();
    return <div>Analysis ready</div>;
  },
}));
vi.mock('@/entities/vault-session', () => ({ useDataSourceMode: () => 'local' }));

let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
function paint() {
  const batch = [...frames.values()];
  frames.clear();
  act(() => batch.forEach((callback) => callback(0)));
}
function mount() {
  return render(<NextIntlClientProvider locale="en" messages={en}><InsightsPageEntry /></NextIntlClientProvider>);
}

beforeEach(() => {
  frames = new Map();
  nextFrame = 0;
  work.render.mockClear();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Insights entry', () => {
  it('paints the destination and loading state before mounting any analysis work', () => {
    mount();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(en.ontologyPages.insights.title);
    expect(screen.getByRole('status')).toHaveTextContent(en.ontologyPages.insights.loading);
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    expect(work.render).not.toHaveBeenCalled();
    paint();
    expect(work.render).not.toHaveBeenCalled();
    paint();
    expect(screen.getByText('Analysis ready')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('cancels pending analysis when the person leaves before the next paint', () => {
    const view = mount();
    paint();
    view.unmount();
    paint();
    expect(work.render).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });
});
