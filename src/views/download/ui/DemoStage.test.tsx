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
 * 첫 페이지 시연 절 — 재생 계약을 잠근다.
 *
 * 이 파일이 지키는 것은 **재생의 성질**이다: 한 클립 · 무음 · 루프 없음 ·
 * 로케일별 자산 · reduced-motion 에서 포스터 생존 · 자산 없으면 절 자체가 없음.
 *
 * 값(길이·프레임 지분)은 **촬영본으로만** 검증되고 그 게이트는 `/motion-verify`
 * 와 ffprobe 다. 여기서 그것까지 주장하지 않는다 — 촬영 전에 통과하는 검사가
 * 촬영 후 품질을 보증하는 척하면 그게 가짜 초록이다.
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
     * 종전엔 둘이었고 탭으로 갈렸다. 대부분은 첫 탭만 보고 떠나므로 두 번째
     * 클립은 만들었지만 아무도 안 보는 것이 됐다(소유자 확정 2026-08-03).
     * 되돌리면 여기가 터진다.
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
     * 한 마스터에 자막만 갈아 끼우던 구조가 아니다. 영상 자체를 언어별로
     * 찍으므로 경로에 로케일이 박힌다 — 이게 깨지면 한국어 사용자가 영어
     * 화면을 본다.
     */
    const clip = DEMO_CLIPS[0];
    expect(demoSources(clip, 'ko')[0].src).toContain('.ko.');
    expect(demoSources(clip, 'en')[0].src).toContain('.en.');
    expect(demoPoster(clip, 'ko')).toContain('.ko-poster');
  });

  it('webm 을 먼저 제안하고 mp4 를 보루로 둔다', () => {
    // 주 방문자가 macOS(=Safari)이고 Safari 의 AV1 은 하드웨어 지원에 따라
    // 갈린다 — 떨어질 자리가 있어선 안 된다.
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
    // 파일 존재만으로 켜면 반쯤 올라간 자산이 첫인상 자리에 그대로 나간다.
    expect(availableDemoClips([])).toHaveLength(0);
    expect(availableDemoClips(['atlas-tour'])).toHaveLength(1);
  });
});
