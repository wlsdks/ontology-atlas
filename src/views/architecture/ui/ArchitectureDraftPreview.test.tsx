import { act, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import en from '../../../../messages/en.json';
import type { DraftPreviewSource } from '../model/draft-preview';
import { ArchitectureDraftPreview } from './ArchitectureDraftPreview';

class FakeAnimation {
  playState: AnimationPlayState = 'running';
  currentTime = 0;
  finished: Promise<void>;
  private settle: () => void = () => undefined;
  play = vi.fn(() => {
    this.playState = 'running';
  });
  pause = vi.fn(() => {
    this.playState = 'paused';
  });
  cancel = vi.fn(() => {
    this.playState = 'idle';
  });

  constructor() {
    this.finished = new Promise<void>((resolve) => {
      this.settle = resolve;
    });
  }

  end() {
    this.playState = 'finished';
    this.settle();
  }
}

const created: FakeAnimation[] = [];
const originalAnimate = Element.prototype.animate;
const widthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');

function renderPreview(source: DraftPreviewSource | null = null) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ArchitectureDraftPreview source={source} />
    </NextIntlClientProvider>,
  );
}

function preferReducedMotion(reduce: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: reduce && query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

beforeEach(() => {
  created.length = 0;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
  Element.prototype.animate = vi.fn(() => {
    const animation = new FakeAnimation();
    created.push(animation);
    return animation as unknown as Animation;
  }) as unknown as typeof Element.prototype.animate;
});

afterEach(() => {
  Element.prototype.animate = originalAnimate;
  if (widthDescriptor) Object.defineProperty(HTMLElement.prototype, 'clientWidth', widthDescriptor);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function supportLinearEasing(supported: boolean) {
  vi.stubGlobal('CSS', { supports: (property: string, value: string) => supported && property === 'transition-timing-function' && value.startsWith('linear(') });
}

const usesLinear = (frames: Keyframe[]) => frames.some((frame) => String(frame.easing ?? '').startsWith('linear('));

const allIn = (state: AnimationPlayState) => created.length > 0 && created.every((animation) => animation.playState === state);

describe('ArchitectureDraftPreview', () => {
  it('labels the illustration as an example when no source folder is connected', () => {
    renderPreview();
    expect(screen.getByTestId('architecture-draft-preview')).toHaveAttribute('data-preview-source', 'example');
    expect(screen.getByTestId('architecture-draft-preview-label')).toHaveTextContent('Example · not data from your folder');
    expect(screen.getByTestId('architecture-draft-preview-description')).toHaveTextContent(/not data from your folder/);
  });

  it('draws the connected source folder by its real folder names and calls the rest an example', () => {
    renderPreview({ name: 'storefront', folders: ['api', 'docs', 'src'] });
    expect(screen.getByTestId('architecture-draft-preview')).toHaveAttribute('data-preview-source', 'connected');
    expect(screen.getByTestId('architecture-draft-preview-label')).toHaveTextContent(
      'Example · only the folder names come from storefront',
    );
    for (const name of ['storefront/', 'api', 'docs', 'src']) expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.queryByText('my-app/')).toBeNull();
  });

  it('shows the finished picture still, with no control, when motion is reduced', () => {
    preferReducedMotion(true);
    renderPreview();
    expect(Element.prototype.animate).not.toHaveBeenCalled();
    expect(screen.getByTestId('architecture-draft-preview')).toHaveAttribute('data-preview-state', 'still');
    expect(screen.queryByTestId('architecture-draft-preview-control')).toBeNull();
  });

  it('falls back to the house ease where linear() easing is not supported', () => {
    supportLinearEasing(false);
    renderPreview();
    const calls = vi.mocked(Element.prototype.animate).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.some(([frames]) => usesLinear(frames as Keyframe[]))).toBe(false);
  });

  it('shows the finished picture still when an engine refuses an easing, instead of breaking the page', async () => {
    supportLinearEasing(true);
    Element.prototype.animate = vi.fn((frames: Keyframe[]) => {
      if (usesLinear(frames)) throw new TypeError('Invalid easing');
      const animation = new FakeAnimation();
      created.push(animation);
      return animation as unknown as Animation;
    }) as unknown as typeof Element.prototype.animate;
    renderPreview();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('architecture-draft-preview')).toHaveAttribute('data-preview-state', 'still');
    expect(screen.queryByTestId('architecture-draft-preview-control')).toBeNull();
    expect(created.every((animation) => animation.cancel.mock.calls.length > 0)).toBe(true);
  });

  it('pauses off-screen and resumes when scrolled back into view', () => {
    let report: (entries: Array<{ isIntersecting: boolean }>) => void = () => undefined;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: typeof report) {
          report = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    renderPreview();
    act(() => report([{ isIntersecting: false }]));
    expect(allIn('paused')).toBe(true);
    expect(screen.getByTestId('architecture-draft-preview')).toHaveAttribute('data-preview-state', 'paused');
    act(() => report([{ isIntersecting: true }]));
    expect(allIn('running')).toBe(true);
  });

  it('pauses while the tab is hidden and resumes when it returns', () => {
    let visibility: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    renderPreview();
    visibility = 'hidden';
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(allIn('paused')).toBe(true);
    visibility = 'visible';
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(allIn('running')).toBe(true);
  });

  it('pauses and resumes every part together, then offers a replay once the loops end', async () => {
    renderPreview();
    expect(created.length).toBeGreaterThan(0);
    const control = screen.getByTestId('architecture-draft-preview-control');
    expect(control).toHaveAccessibleName('Pause example animation');

    fireEvent.click(control);
    expect(created.every((animation) => animation.playState === 'paused')).toBe(true);
    expect(control).toHaveAccessibleName('Resume example animation');

    fireEvent.click(control);
    expect(created.every((animation) => animation.playState === 'running')).toBe(true);

    const firstRun = [...created];
    await act(async () => {
      for (const animation of firstRun) animation.end();
      await Promise.resolve();
    });
    expect(screen.getByTestId('architecture-draft-preview')).toHaveAttribute('data-preview-state', 'finished');
    expect(control).toHaveAccessibleName('Replay example animation');

    fireEvent.click(control);
    expect(created.length).toBeGreaterThan(firstRun.length);
    expect(control).toHaveAccessibleName('Pause example animation');
  });
});
