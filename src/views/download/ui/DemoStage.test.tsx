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
  it('자산이 없으면 절 자체가 없다 — 재생할 것 없는 플레이어는 죽은 UI 다', () => {
    render(wrap(<DemoStage available={[]} />));
    expect(screen.queryByTestId('demo-stage')).toBeNull();
    expect(hasDemoClips([])).toBe(false);
  });

  it('클립은 하나다 — 첫인상 자리에서 「무엇을 볼지 고르기」는 비용이지 값이 아니다', () => {
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
  it('무음이고 무한 반복이며 컨트롤 바가 없고 미리 받지 않는다', () => {
    render(wrap(<DemoStage available={['atlas-tour']} />));
    const video = screen.getByTestId('demo-video-atlas-tour') as HTMLVideoElement;
    expect(video.muted).toBe(true);
    expect(video.loop, '루프가 꺼졌다 — 9초짜리가 마지막 프레임에 얼어붙는다').toBe(true);
    expect(
      video.hasAttribute('controls'),
      '컨트롤 바가 돌아왔다 — 9초에는 되감을 곳이 없고 타임코드만 남는다',
    ).toBe(false);
    expect(video.getAttribute('preload')).toBe('none');
  });

  it('자산은 로케일을 탄다 — 화면 안의 글자가 그 언어이기 때문이다', () => {
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

  it('webm 을 먼저 제안하고 mp4 를 보루로 둔다', () => {
    // The primary visitor is on macOS (i.e. Safari), and Safari's AV1 depends on hardware support —
    // there must be somewhere to fall back to.
    const [first, second] = demoSources(DEMO_CLIPS[0], 'en');
    expect(first.type).toBe('video/webm');
    expect(second.type).toBe('video/mp4');
  });

  it('자막 배관이 없다 — 로케일별 영상에 자막이 더할 정보가 없다', () => {
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
  it('로케일이 늦게 도착해 video 가 다시 태어나도 관찰 대상이 따라온다', () => {
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
    expect(observed.at(-1), '첫 그림에서 video 를 관찰하지 않았다 — 이 시험이 헛돈다').toBe(first);

    // Hydration corrects `lang`; the component re-reads it on its next render and the key flips.
    act(() => {
      document.documentElement.lang = 'ko';
    });
    rerender(wrap(<DemoStage available={['atlas-tour']} />));

    const second = screen.getByTestId('demo-video-atlas-tour');
    expect(second, 'key 가 안 바뀌어 remount 가 안 일어났다 — 이 시험이 헛돈다').not.toBe(first);
    expect(
      observed.at(-1),
      '버려진 video 를 계속 보고 있다 — 떨어져 나간 노드는 절대 교차하지 않으므로 재생이 시작되지 않는다',
    ).toBe(second);
    expect(observed.at(-1)?.isConnected).toBe(true);
  });

  it('등록부와 자산 목록이 둘 다 있어야 켜진다', () => {
    // Switching on from file existence alone would put a half-uploaded asset straight into the
    // first-impression slot.
    expect(availableDemoClips([])).toHaveLength(0);
    expect(availableDemoClips(['atlas-tour'])).toHaveLength(1);
  });
});
