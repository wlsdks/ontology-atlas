'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Maximize2 } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { type DemoClip, availableDemoClips, demoPoster, demoSources } from '../model/demo-clips';
import { controlClass } from '@/shared/ui/control-class';
import { useMotionPaused } from '@/shared/motion/motion-pause';

/**
 * Playback contract: one per-locale clip, muted, no captions. Reduced motion keeps the poster and
 * a play button. The hero's window owns the width, so the clip and its note share one edge.
 */
export function DemoStage({ available }: { available?: readonly DemoClip['id'][] }) {
  const t = useTranslations('download');
  const clip = availableDemoClips(available)[0];

  if (!clip) return null;

  return (
    /* The window carries no visible title; the name stays as aria. */
    <section
      data-testid="demo-stage"
      aria-label={t('demoHeading')}
      className="min-w-0"
    >
      <DemoPlayer clip={clip} />
      {/* Rewrite this sentence with every new take: no gate knows what was filmed. */}
      <p
        data-testid="demo-provisional-note"
        className="mt-3.5 break-keep text-center text-label leading-label text-[color:var(--color-text-tertiary)]"
      >
        {t('demoProvisionalNote', { seconds: clip.seconds })}
      </p>
    </section>
  );
}

function DemoPlayer({ clip }: { clip: DemoClip }) {
  const t = useTranslations('download');
  /** The route's locale, which the static export prerenders per page, so each HTML file names its own poster. */
  const locale = useLocale();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [started, setStarted] = useState(false);
  const reduced = usePrefersReducedMotion();
  const stopped = useMotionPaused();

  const play = useCallback(() => {
    // jsdom and older browsers return no Promise from `play()`.
    void videoRef.current
      ?.play()
      ?.then(() => setStarted(true))
      .catch(() => setStarted(false));
  }, []);

  /** iPhone Safari has no element fullscreen for video, only its own player's `webkitEnterFullscreen`. */
  const expand = useCallback(() => {
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!video) return;
    if (typeof video.requestFullscreen === 'function') {
      void video.requestFullscreen().catch(() => video.webkitEnterFullscreen?.());
      return;
    }
    video.webkitEnterFullscreen?.();
  }, []);

  /**
   * Plays in view and pauses outside it, so nobody's bandwidth plays to an empty room. `locale`
   * is a dependency because the video is keyed on it, or the effect keeps observing a detached node.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof IntersectionObserver === 'undefined') return;
    if (reduced || stopped) {
      video.pause?.();
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          void video.play?.()?.catch?.(() => undefined);
        } else {
          video.pause?.();
        }
      },
      { threshold: 0.45 },
    );
    io.observe(video);
    return () => io.disconnect();
  }, [reduced, stopped, locale]);

  return (
    <div
      data-testid={`demo-panel-${clip.id}`}
      /* The section owns width, or the video and caption edges split. */
      className="min-w-0"
    >
      <div className="gateway-window-frame min-w-0">
        {/* No preload, so the first bytes belong to the map and download button. No controls; a loop for
           late arrivals. Keyed on locale: a video does not re-select its source when its children change.
           Autoplay inline needs both `muted` and `playsInline`. */}
        <video
          key={locale}
          ref={videoRef}
          data-testid={`demo-video-${clip.id}`}
          poster={withBasePath(demoPoster(clip, locale))}
          preload="none"
          width={clip.width}
          height={clip.height}
          muted
          loop
          playsInline
          onPlay={() => setStarted(true)}
          className="block h-auto w-full"
        >
          {demoSources(clip, locale).map((source) => (
            <source key={source.src} src={withBasePath(source.src)} type={source.type} />
          ))}
        </video>

        {/* For reduced motion and blocked autoplay. Hidden, not unmounted, or audits walking the controls lose their index. */}
        <button
          type="button"
          hidden={started}
          onClick={play}
          data-testid={`demo-play-${clip.id}`}
          className={controlClass({ shape: "row", stacked: true, className: "absolute inset-0 justify-center leading-body" })}
        >
          <span className="rounded-chip border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] px-4 py-2">
            {t('demoPlay')}
          </span>
        </button>

        {/* On a touch screen the recording of a desktop window is too small to read, so a tap anywhere on it opens the player full screen. */}
        {started ? (
          <button
            type="button"
            onClick={expand}
            data-testid={`demo-expand-${clip.id}`}
            className={controlClass({
              shape: 'row',
              stacked: true,
              className: 'absolute inset-0 hidden items-end justify-end p-3 pointer-coarse:flex',
            })}
          >
            <span className="inline-flex items-center gap-1.5 rounded-chip border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] px-3 py-1.5 text-label leading-label text-[color:var(--color-text-secondary)]">
              <Maximize2 size={ICON_SIZE.sm} aria-hidden />
              {t('demoExpand')}
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** On the server, false is the only correct value. */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
}

function reducedMotionQuery(): MediaQueryList {
  return window.matchMedia('(prefers-reduced-motion: reduce)');
}

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = reducedMotionQuery();
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getReducedMotion(): boolean {
  return reducedMotionQuery().matches;
}
