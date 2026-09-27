import { act, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../messages/en.json';
import { DemoStage } from './DemoStage';
import {
  DEMO_CLIPS,
  availableDemoClips,
  demoPoster,
  demoSources,
  hasDemoClips,
} from '../model/demo-clips';

/** Playback properties only; length and framing are checked against footage by `/motion-verify`. */
const wrap = (ui: React.ReactNode) => (
  <NextIntlClientProvider locale="en" messages={messages}>
    {ui}
  </NextIntlClientProvider>
);

beforeEach(() => {
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: vi.fn(async () => undefined),
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

describe('DemoStage', () => {
  it('renders no section without assets, since a player with nothing to play is dead UI', () => {
    render(wrap(<DemoStage available={[]} />));
    expect(screen.queryByTestId('demo-stage')).toBeNull();
    expect(hasDemoClips([])).toBe(false);
  });

  it('plays one clip with no picker, since choosing what to watch costs a first impression', () => {
    expect(DEMO_CLIPS).toHaveLength(1);
    render(wrap(<DemoStage available={['atlas-tour']} />));
    expect(screen.getByTestId('demo-stage')).toBeInTheDocument();
    expect(screen.queryByTestId('demo-tablist')).toBeNull();
  });

  /** Loop and no controls reverse earlier decisions (`docs/DECISIONS.md`); going back needs a new one. */
  it('plays muted in an endless loop with no controls and no preload', () => {
    render(wrap(<DemoStage available={['atlas-tour']} />));
    const video = screen.getByTestId('demo-video-atlas-tour') as HTMLVideoElement;
    expect(video.muted).toBe(true);
    expect(video.loop, 'loop is off: the 9-second clip freezes on its last frame').toBe(true);
    expect(
      video.hasAttribute('controls'),
      'controls are back: 9 seconds leaves nothing to scrub, only a timecode',
    ).toBe(false);
    expect(video.getAttribute('preload')).toBe('none');
  });

  it('picks assets by locale because the text inside the video is in that language', () => {
    const clip = DEMO_CLIPS[0];
    expect(demoSources(clip, 'ko')[0].src).toContain('.ko.');
    expect(demoSources(clip, 'en')[0].src).toContain('.en.');
    expect(demoPoster(clip, 'ko')).toContain('.ko-poster');
  });

  it('offers webm first with mp4 as the fallback', () => {
    const [first, second] = demoSources(DEMO_CLIPS[0], 'en');
    expect(first.type).toBe('video/webm');
    expect(second.type).toBe('video/mp4');
  });

  it('adds no caption track, since per-locale videos leave captions nothing to add', () => {
    render(wrap(<DemoStage available={['atlas-tour']} />));
    const video = screen.getByTestId('demo-video-atlas-tour');
    expect(video.querySelector('track')).toBeNull();
    expect(screen.queryByTestId('demo-caption-atlas-tour')).toBeNull();
  });

  /** Asserts the observed element is the one in the document, not the effect's dependency list. */
  it('observes the new video when a late locale remounts it', () => {
    const observed: Element[] = [];
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe(target: Element) {
          observed.push(target);
        }
        disconnect = disconnect;
        unobserve = vi.fn();
        takeRecords = vi.fn(() => []);
      },
    );

    document.documentElement.lang = 'en';
    const { rerender } = render(wrap(<DemoStage available={['atlas-tour']} />));
    const first = screen.getByTestId('demo-video-atlas-tour');
    expect(observed.at(-1), 'the first render did not observe the video, so this test is vacuous').toBe(first);

    act(() => {
      document.documentElement.lang = 'ko';
    });
    rerender(wrap(<DemoStage available={['atlas-tour']} />));

    const second = screen.getByTestId('demo-video-atlas-tour');
    expect(second, 'the key did not change, so no remount happened and this test is vacuous').not.toBe(first);
    expect(
      observed.at(-1),
      'still observing the discarded video: a detached node never intersects, so playback never starts',
    ).toBe(second);
    expect(observed.at(-1)?.isConnected).toBe(true);
  });

  it('turns on only when both the registry and the asset list have the clip', () => {
    expect(availableDemoClips([])).toHaveLength(0);
    expect(availableDemoClips(['atlas-tour'])).toHaveLength(1);
  });
});
