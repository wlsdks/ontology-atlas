'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { type DemoClip, availableDemoClips, demoPoster, demoSources } from '../model/demo-clips';
import { controlClass } from '@/shared/ui/control-class';

/**
 * Playback contract: one per-locale clip, muted, no captions. Reduced motion keeps the poster and
 * a play button. The section owns the `--gateway-stage-max` cap (`app/styles/tokens.css`), or
 * video and caption edges split.
 */
export function DemoStage({ available }: { available?: readonly DemoClip['id'][] }) {
  const t = useTranslations('download');
  const clip = availableDemoClips(available)[0];

  if (!clip) return null;

  return (
    /* The visible title is the section head's (`SectionIntro`); the name stays as aria. */
    <section
      data-testid="demo-stage"
      aria-label={t('demoHeading')}
      className="min-w-0 max-w-[var(--gateway-stage-max)]"
    >
      <DemoPlayer clip={clip} />
      {/* Rewrite this sentence with every new take: no gate knows what was filmed (`docs/launch/demo-scenario.md`). */}
      <p
        data-testid="demo-provisional-note"
        className="mt-3.5 break-keep text-label leading-label text-[color:var(--color-text-tertiary)]"
      >
        {t('demoProvisionalNote', { seconds: clip.seconds })}
      </p>
    </section>
  );
}

function DemoPlayer({ clip }: { clip: DemoClip }) {
  const t = useTranslations('download');
  const locale = useDocumentLocale();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [started, setStarted] = useState(false);
  const reduced = usePrefersReducedMotion();

  const play = useCallback(() => {
    // jsdom and older browsers return no Promise from `play()`.
    void videoRef.current
      ?.play()
      ?.then(() => setStarted(true))
      .catch(() => setStarted(false));
  }, []);

  /**
   * Plays in view and pauses outside it, so nobody's bandwidth plays to an empty room. `locale`
   * is a dependency because the video is keyed on it, or the effect keeps observing a detached node.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || reduced || typeof IntersectionObserver === 'undefined') return;
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
  }, [reduced, locale]);

  return (
    <div
      data-testid={`demo-panel-${clip.id}`}
      /* The section owns width, or the video and caption edges split. */
      className="mt-4 min-w-0"
    >
      <div className="relative min-w-0 overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]">
        {/* No preload, so the first bytes belong to the map and download button. No controls; a loop for
           late arrivals. Keyed on locale: a video does not re-select its source when its children change.
           Autoplay inline needs both `muted` and `playsInline`. */}
        <video
          key={locale}
          ref={videoRef}
          data-testid={`demo-video-${clip.id}`}
          poster={withBasePath(demoPoster(clip, locale))}
          preload="none"
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
          className={controlClass({ shape: "row", stacked: true, className: "absolute inset-0 justify-center bg-[color:var(--color-backdrop-medium)] text-body leading-body" })}
        >
          <span className="rounded-chip border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] px-4 py-2">
            {t('demoPlay')}
          </span>
        </button>
      </div>
    </div>
  );
}

/** Read from `<html lang>`, not the router; the static export's server snapshot is always `en`. */
function useDocumentLocale(): string {
  return useSyncExternalStore(
    () => () => undefined, // `lang` does not change without a remount.
    () => document.documentElement.lang || 'en',
    () => 'en',
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
