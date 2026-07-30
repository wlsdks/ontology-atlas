import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../messages/en.json';
import { DemoStage, parseVtt } from './DemoStage';
import { DEMO_CLIPS, availableDemoClips, hasDemoClips } from '../model/demo-clips';

/**
 * 첫 페이지 시연 절 — 원장(`docs/DECISIONS.md` 2026-07-29) 재생 계약을 잠근다.
 *
 * 이 파일이 지키는 것은 **재생의 성질**이다: 무음 · 루프 없음 · 이탈 시 되감기 ·
 * 자막이 DOM · reduced-motion 에서 포스터+자막 생존 · 자산 없으면 절 자체가 없음.
 *
 * 값(길이·자막 문구·프레임 지분)은 **촬영본으로만** 검증되고 그 게이트는
 * `/motion-verify` 와 ffprobe 다. 여기서 그것까지 주장하지 않는다 — 촬영 전에
 * 통과하는 검사가 촬영 후 품질을 보증하는 척하면 그게 가짜 초록이다.
 */

const wrap = (ui: React.ReactNode) => (
  <NextIntlClientProvider locale="en" messages={messages}>
    {ui}
  </NextIntlClientProvider>
);

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      text: async () =>
        'WEBVTT\n\n00:00:00.000 --> 00:00:04.000\nYou hand this folder to an AI agent\n\n00:00:04.200 --> 00:00:07.600\nThe agent reads the documents in it directly\n',
    })),
  );
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: vi.fn(async () => undefined),
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: vi.fn(),
  });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

describe('DemoStage', () => {
  /**
   * **촬영본이 없는 동안 이 절은 존재하지 않는다.** 재생할 것 없는 플레이어를
   * 관문 첫인상 자리에 두는 것은 「곧 됩니다는 강등이 아니라 거짓말」과 같은
   * 결함이다(`.claude/rules/surfaces.md`).
   */
  it('자산이 없으면 절 자체를 그리지 않는다', () => {
    render(wrap(<DemoStage available={[]} />));
    expect(screen.queryByTestId('demo-stage')).toBeNull();
    expect(hasDemoClips([])).toBe(false);
  });

  it('클립이 하나면 탭을 만들지 않는다 — 고를 것이 없는 탭은 크롬 낭비다', () => {
    render(wrap(<DemoStage available={['one-button']} />));
    expect(screen.getByTestId('demo-stage')).toBeInTheDocument();
    expect(screen.queryByTestId('demo-tablist')).toBeNull();
  });

  it('두 클립이면 탭 둘, 기본 탭은 클립 A 다', () => {
    render(wrap(<DemoStage available={['one-folder', 'one-button']} />));
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(screen.getByTestId('demo-tab-one-folder')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('demo-tab-one-button')).toHaveAttribute('aria-selected', 'false');
  });

  /**
   * 원장이 **BGM 포함 0** 으로 못박았고, 무음이 아니면 자동재생 자체가 브라우저에
   * 막힌다. 루프도 명시적으로 없다 — 루프는 헤더/무드용이고 서사는 1회 재생이다.
   */
  it('무음이고 루프가 없고 미리 받지 않는다', () => {
    render(wrap(<DemoStage available={['one-folder']} />));
    const video = screen.getByTestId('demo-video-one-folder') as HTMLVideoElement;
    expect(video.muted).toBe(true);
    expect(video.hasAttribute('loop')).toBe(false);
    expect(video.getAttribute('preload')).toBe('none');
    expect(video.hasAttribute('playsinline')).toBe(true);
    expect(video.getAttribute('poster')).toContain('one-folder-poster.png');
  });

  /** AV1(webm) 이 먼저, MP4 가 최종 보루 — Safari 의 AV1 지원이 기계마다 갈린다. */
  it('webm 을 먼저 제안하고 mp4 를 보루로 둔다', () => {
    render(wrap(<DemoStage available={['one-folder']} />));
    const sources = [
      ...screen.getByTestId('demo-video-one-folder').querySelectorAll('source'),
    ].map((el) => el.getAttribute('type'));
    expect(sources).toEqual(['video/webm', 'video/mp4']);
  });

  /**
   * **이탈하면 멈추고 처음으로.** 돌아왔을 때 중간부터 재생되면 "무컷 한 테이크"
   * 라는 주장이 깨진다 — 관객이 본 것은 자른 조각이다.
   */
  it('탭을 떠나면 멈추고 되감는다', async () => {
    render(wrap(<DemoStage available={['one-folder', 'one-button']} />));
    const video = screen.getByTestId('demo-video-one-folder') as HTMLVideoElement;
    video.currentTime = 7;

    fireEvent.click(screen.getByTestId('demo-tab-one-button'));

    await waitFor(() => expect(video.currentTime).toBe(0));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  /** 나가는 프레임은 상호작용을 받지 않는다 — 안 보이는 재생 버튼에 Tab 이 닿으면 유령이다. */
  it('숨은 패널은 inert 다', () => {
    render(wrap(<DemoStage available={['one-folder', 'one-button']} />));
    expect(screen.getByTestId('demo-panel-one-button')).toHaveAttribute('inert');
    expect(screen.getByTestId('demo-panel-one-folder')).not.toHaveAttribute('inert');
  });

  /** 자동재생이 아닌 클립은 사람이 시작한다 — 포스터 + 재생 버튼(원장 클립 B). */
  it('클립 B 는 자동재생하지 않고 재생 버튼을 준다', () => {
    render(wrap(<DemoStage available={['one-button']} />));
    expect(screen.getByTestId('demo-play-one-button')).toBeInTheDocument();
  });

  /**
   * 자막이 DOM 인 이유가 여기서 증명된다 — 영상을 끈 사용자에게 **글자가 남는다**.
   * 구웠다면 포스터에 글자가 없어 정보가 통째로 사라진다.
   */
  it('reduced-motion 에서 자동재생을 멈추고 자막 첫 줄을 남긴다', async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    render(wrap(<DemoStage available={['one-folder']} />));

    await waitFor(() =>
      expect(screen.getByTestId('demo-caption-one-folder')).toHaveTextContent(
        'You hand this folder to an AI agent',
      ),
    );
    // 자동재생 클립인데도 사람이 시작하도록 재생 버튼이 선다.
    expect(screen.getByTestId('demo-play-one-folder')).toBeInTheDocument();
  });

  /** 등록부는 촬영 전에도 **무엇을 찍어야 하는가**를 들고 있어야 한다. */
  it('등록부가 시나리오의 두 클립을 선언한다', () => {
    expect(DEMO_CLIPS.map((clip) => clip.id)).toEqual(['one-folder', 'one-button']);
    expect(DEMO_CLIPS.find((c) => c.id === 'one-folder')?.autoplay).toBe(true);
    expect(DEMO_CLIPS.find((c) => c.id === 'one-button')?.autoplay).toBe(false);
    // 선언은 둘이지만 붙은 자산은 별개다 — 그 분리가 죽은 UI 를 막는다.
    expect(availableDemoClips([]).length).toBe(0);
  });
});

describe('parseVtt', () => {
  it('타임스탬프와 본문을 읽고 시작 시각으로 정렬한다', () => {
    const cues = parseVtt(
      'WEBVTT\n\n00:00:04.200 --> 00:00:07.600\nsecond\n\n00:00:00.000 --> 00:00:04.000\nfirst\n',
    );
    expect(cues.map((cue) => cue.text)).toEqual(['first', 'second']);
    expect(cues[0]).toMatchObject({ start: 0, end: 4 });
    expect(cues[1]).toMatchObject({ start: 4.2, end: 7.6 });
  });

  it('큐 번호 줄과 빈 블록을 흘린다', () => {
    expect(parseVtt('WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nhi\n\n\n')).toHaveLength(1);
  });
});
