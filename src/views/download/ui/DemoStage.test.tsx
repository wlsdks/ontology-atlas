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

/**
 * The front-page demo section — locks the playback contract.
 *
 * What this file protects is the **properties of playback**: one clip, muted, no loop, per-locale
 * assets, the poster surviving under reduced-motion, and no section at all without an asset.
 *
 * Values (length, frame share) are verified **only against footage**, and that gate is
 * `/motion-verify` plus ffprobe. This file does not claim them — a check that passes before the
 * shoot pretending to guarantee post-shoot quality is a false green.
 */
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
    /*
     * There used to be two, split across tabs. Most people watch only the first tab and leave, so
     * the second clip became something made but never watched (owner-confirmed 2026-08-03).
     * Reverting turns this red.
     */
    expect(DEMO_CLIPS).toHaveLength(1);
    render(wrap(<DemoStage available={['atlas-tour']} />));
    expect(screen.getByTestId('demo-stage')).toBeInTheDocument();
    expect(screen.queryByTestId('demo-tablist')).toBeNull();
  });

  /**
   * Muted, looping, no controls, nothing preloaded.
   *
   * `loop` and the absence of `controls` both **reverse** earlier decisions (2026-07-29 "no
   * loop"; the control bar that a 199-second tour needed for scrubbing). The owner reversed them
   * on 2026-08-23 for a nine-second clip, and `docs/DECISIONS.md` carries the reasoning — this
   * asserts the state so that going back is a deliberate act with a ledger entry, not a drift.
   */
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
    /*
     * This is not the structure where one master had captions swapped. The video itself is filmed
     * per language, so the locale is baked into the path — breaking this makes a Korean user watch
     * an English screen.
     */
    const clip = DEMO_CLIPS[0];
    expect(demoSources(clip, 'ko')[0].src).toContain('.ko.');
    expect(demoSources(clip, 'en')[0].src).toContain('.en.');
    expect(demoPoster(clip, 'ko')).toContain('.ko-poster');
  });

  it('offers webm first with mp4 as the fallback', () => {
    // The primary visitor is on macOS (i.e. Safari), and Safari's AV1 depends on hardware support —
    // there must be somewhere to fall back to.
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

  /**
   * **The observer must follow the `<video>` across the locale remount.**
   *
   * The element is keyed on the locale, and the locale arrives late: static export freezes the
   * first paint as `en` and hydration corrects it, so on a Korean page React throws the first
   * `<video>` away and mounts a second one. An effect that does not list `locale` keeps observing
   * the discarded node, and a detached node never intersects — the clip simply never starts.
   *
   * This is not hypothetical. Measured 2026-08-22 in Chromium at 1512×982 with the section fully
   * in view: `/en/` reached `currentTime` 2.97s, `/ko/` sat at 0 and paused. It had been live
   * since `key={locale}` landed on 2026-08-20.
   *
   * What is asserted is the property, not the dependency array: **whatever is being observed is
   * the element that is actually in the document.** Writing it the other way — grepping the deps —
   * would pass for any spelling that happens to include the word and fail for a correct rewrite.
   */
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

    // Hydration corrects `lang`; the component re-reads it on its next render and the key flips.
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
    // Switching on from file existence alone would put a half-uploaded asset straight into the
    // first-impression slot.
    expect(availableDemoClips([])).toHaveLength(0);
    expect(availableDemoClips(['atlas-tour'])).toHaveLength(1);
  });
});
