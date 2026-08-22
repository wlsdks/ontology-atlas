import { render, screen } from '@testing-library/react';
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

  it('무음이고 루프가 없고 미리 받지 않는다', () => {
    render(wrap(<DemoStage available={['atlas-tour']} />));
    const video = screen.getByTestId('demo-video-atlas-tour') as HTMLVideoElement;
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(false);
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

  it('등록부와 자산 목록이 둘 다 있어야 켜진다', () => {
    // Switching on from file existence alone would put a half-uploaded asset straight into the
    // first-impression slot.
    expect(availableDemoClips([])).toHaveLength(0);
    expect(availableDemoClips(['atlas-tour'])).toHaveLength(1);
  });
});
