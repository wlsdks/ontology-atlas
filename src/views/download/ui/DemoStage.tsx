'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { withBasePath } from '@/shared/lib/base-path';
import { type DemoClip, availableDemoClips, demoPoster, demoSources } from '../model/demo-clips';
import { controlClass } from '@/shared/ui/control-class';

/**
 * The front-page demo section — **one clip, no cuts, no loop, no sound.**
 *
 * This component implements only the scenario's **playback contract**. What is filmed is decided
 * by the shoot, and which assets are attached by `model/demo-clips.ts`.
 *
 * ## Revised 2026-08-03 — tabs and captions were removed
 *
 * **Why tabs went**: there is one clip. In the first-impression slot, «choosing what to watch» is
 * a cost rather than a value, and since most people watch only the first tab the second clip
 * becomes something made but never watched (owner-confirmed).
 *
 * **Why captions went**: each locale is filmed separately — the text inside the frame is already
 * in that language. Captions add no information, and leaving the `.vtt` plumbing behind leaves an
 * empty track and an empty slot (`min-h-[2.5rem]`). The previous structure was «one master plus
 * per-language captions», where that plumbing was right; **the premise changed, so the plumbing changes.**
 *
 * ## reduced-motion is not an empty slot
 *
 * The video is disabled and **the poster stays** — a person starts it with the play button.
 * Reduced motion means switching off autoplay, not taking away the content.
 *
 * ## [Revised 2026-08-19] The stage stops at 48rem and centres
 *
 * Owner: *"'Install without setup, I start by watching it move.' This video part is too big right now."* (the video in the
 * "see it move before installing" part is too big right now).
 *
 * The 2026-07-30 version used the section's column with no cap and no centring, on the grounds
 * that "the title and the video start at the same x and end at the same x". That alignment did
 * hold, but it never counted the cost in **size**: the column grows to the cap (`--page-max` 1600
 * then, `--gateway-page-max` 1920 now), so a 1512×918 clip (1.65:1) filling the column gives
 * these heights — at a 1512 viewport, column 1112 → **675px**; at 1920, 1520 → **923px**; at 2560,
 * 1600 → **971px**. That is a dimension that eats the entire first-impression slot. The demo is
 * **one scene** showing what is being built, not the screen itself.
 *
 * Measured 2026-08-19 (dev, `/ko/download/`): stage 768, video **766×465**, identical at all three widths.
 *
 * The cap value was not newly invented — it is the `48rem` the agent section's scene
 * (`AcpChatScene`) directly below already uses. Two scenes at one width means the page says "this
 * much is the stage" only once.
 *
 * ⚠️ The cap is **owned by the section** — applying it to the video while leaving the caption in
 * the column splits their right edges and brings back the "one section, two grids" that 2026-07-30
 * existed to stop.
 *
 * ## [Revised 2026-08-23] The centring is gone; the cap stays
 *
 * 2026-08-19 added `mx-auto` alongside the cap, on owner instruction, reviving the centring that
 * 2026-07-30 had rejected. Keeping the size but centring it produced exactly the defect the
 * warning above names, and it went unmeasured for four days. Measured 2026-08-23 on the published
 * page at a 1920 viewport: all three section heads sit at **x=200**, and their stages at
 * **200** (evidence map) and **200** (agent scene) — except this one, at **569**. One section in
 * three, off by 369px, under a heading that starts where the other two do.
 *
 * So the stage is left-aligned to its own heading again. **The 2026-08-19 decision is not undone**
 * — that decision was about *size*, the video is still capped at `--gateway-stage-max`, and the
 * screenshot that prompted it is still answered. Only the horizontal origin changed
 * (`docs/DECISIONS.md` 2026-08-23).
 *
 * ## [Revised evening 2026-08-19] The cap grows proportionally at wide widths
 *
 * The owner noted the screen looked empty in a 2560 screenshot. The 48rem decision above protected
 * "a proportion where the stage does not eat the first impression", but freezing it in absolute px
 * made it wrong in the other direction at wide widths — measured at 2560 the stage was 30% of the
 * viewport (768/2560). So the cap's source of truth moved up to `--gateway-stage-max`
 * (`clamp(48rem, 40vw, 80rem)`). **At 1920 and below it is the same 768px as before** (40vw meets
 * 48rem at exactly 1920, so the floor wins) — the rationale for all three values and the gate are
 * in the token doc-block (`app/globals.css`). The agent section's scene consumes the same token,
 * so "this much is the stage" is still said only once.
 */
export function DemoStage({ available }: { available?: readonly DemoClip['id'][] }) {
  const t = useTranslations('download');
  const clip = availableDemoClips(available)[0];

  // With no asset there is no section — a player with nothing to play is dead UI.
  if (!clip) return null;

  return (
    /* The title moved up into the section head (`SectionIntro`) in the 2026-08-18 remake — two
       headings in one section is a list, not a hierarchy. The name stays as aria. */
    <section
      data-testid="demo-stage"
      aria-label={t('demoHeading')}
      className="mx-auto min-w-0 max-w-[var(--gateway-stage-max)]"
    >
      <DemoPlayer clip={clip} />
      {/*
       * **The screen states honestly what clip is currently attached** (2026-08-18).
       *
       * ⚠️ **This sentence really did become false once** (2026-08-20). It said "starting from
       * choosing a folder", but when the shoot changed to pre-selecting the vault for privacy, that
       * scene disappeared from the video. Only the asset was swapped and this line was left, so the
       * first-impression slot was claiming a scene that does not exist.
       * **When replacing an asset, read this sentence as well as `seconds`** — the length is caught
       * by a gate (`demo-clip-assets.contract`), but only a person knows what was filmed.
       *
       * Since 2026-08-22 each locale carries its own take, so the clause admitting they shared one
       * Korean recording is gone. That swap was a file swap plus this sentence — the markup was
       * untouched, which is what this registry-and-copy split is for (`docs/DEMO-SCENARIO.md`).
       */}
      <p
        data-testid="demo-provisional-note"
        className="mt-3.5 break-keep text-center font-mono text-caption leading-caption text-[color:var(--color-text-quaternary)]"
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
    // `play()` may not return a Promise — jsdom does not (it leaked as an unhandled rejection and
    // turned CI red), and neither did older browsers.
    void videoRef.current
      ?.play()
      ?.then(() => setStarted(true))
      .catch(() => setStarted(false));
  }, []);

  /**
   * **Plays itself on entering the viewport and pauses on leaving** (remake 2026-08-18, owner: the
   * demo is not hidden behind a button). The old `autoPlay` attribute, now that the section is
   * below the fold, would spend the playback "while nobody is watching", so it became an
   * IntersectionObserver. Reduced-motion users still start it themselves from the poster and play
   * button. Where IO is unavailable (jsdom) it does not autoplay — the tests measure the playback
   * contract (muted, no loop, no preload), not autoplay.
   *
   * ⚠️ **`locale` is a dependency because the `<video>` below is keyed on it.** Without it this
   * effect ran once against the element of the first paint and then kept observing it after React
   * had thrown it away — a detached node never intersects, so the callback fired once at
   * `ratio: 0` and never again. That is not a theoretical hazard: it took out **the Korean page
   * only**, because `en` is the server snapshot and so only `ko` remounts. Measured 2026-08-22 at
   * 1512×982 with the section scrolled fully into view — `/en/` reached `currentTime` 2.97s while
   * `/ko/` sat at 0 and paused. It arrived with `key={locale}` on 2026-08-20 and shipped, because
   * the fix and the breakage are twenty lines apart and neither has anything to do with the other.
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
      /* Width and alignment are owned by the section (`DemoStage`) — capping again here splits the
         right edges of the video and the caption. */
      className="mt-4 min-w-0"
    >
      <div className="relative min-w-0 overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)]">
        {/*
         * `preload="none"` — the gateway's first bytes belong to the map and the download button.
         * `muted` + `playsInline` are the conditions for silent autoplay, and the sound is **zero,
         * including any BGM**.
         *
         * ## [Revised 2026-08-23] No controls, and it loops
         *
         * Owner, looking at the shipped page: the timecode should not be there, and the clip
         * should keep playing. Both halves reverse an earlier decision, so both are in the ledger
         * (`docs/DECISIONS.md` 2026-08-23) rather than changed quietly.
         *
         * **No `controls`.** The bar existed for scrubbing a 199-second tour. At nine seconds
         * there is nothing to scrub to, and `0:04 / 0:09` plus a progress rail is chrome that
         * says "this is a video player" over a scene meant to read as the product.
         *
         * **`loop`.** The 2026-07-29 scenario said *no loop*, deciding for a three-minute take
         * that would have restarted in a reader's peripheral vision. Nine seconds is a different
         * object: without a loop it freezes on its last frame, and with no controls there is then
         * no way back to the start. Looping makes the section self-restoring — arrive at any
         * moment and the whole scene still plays.
         *
         * The consequence to keep in view: `onEnded` never fires now, so the play button no
         * longer returns after playback. It is still the entry point for reduced-motion readers
         * and for browsers that refuse autoplay, which is the case it was written for.
         */}
        {/*
         * Without `key={locale}`, **a Korean page plays the English video.**
         * This component's locale comes from `document.documentElement.lang`, and the server
         * snapshot is `'en'`, so the first paint always ships the English asset and switches to
         * `ko` on hydration. React then swaps the `poster` attribute and the `<source>` children to
         * the new values — but **a `<video>` does not re-select its source because its children
         * changed** (re-selection happens only on `load()` or a remount). The result is a mismatch
         * where only the poster is Korean while what plays is English. Both locales point at the
         * same recording today so it is invisible, but it surfaces the moment English footage is
         * attached (found 2026-08-20 by instrumenting playback: on `/ko/`, `currentSrc` was
         * `.en.webm` while `poster` was `.ko-poster.png`). Keying on the locale remounts the
         * element when the locale is decided, so source selection starts over.
         */}
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

        {/* Reduced-motion users and browsers that block autoplay start it themselves.
            `hidden` rather than unmounting — if the control vanished from the DOM the moment
            playback starts, an audit that snapshots the page's controls and walks them (hover
            contrast and the like) loses its index and hangs on a 30-second protocol wait (measured
            2026-08-18). `hidden` gives rect 0, so every audit skips it normally. */}
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

/**
 * The locale is read from `<html lang>` so this component is not tied to the router.
 *
 * `useSyncExternalStore` is used not to dodge lint but because **the server snapshot is explicit**:
 * static export's first HTML always freezes as `en` and is corrected once to the real `lang` on hydration.
 */
function useDocumentLocale(): string {
  return useSyncExternalStore(
    () => () => undefined, // `lang` does not change without a remount — nothing to subscribe to
    () => document.documentElement.lang || 'en',
    () => 'en',
  );
}

/** An external store for the same reason — on the server, "not reduced" (false) is the only correct value. */
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
