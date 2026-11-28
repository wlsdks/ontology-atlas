import { useRef } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { AnimatePresence, motion } from 'framer-motion';
import { FileText, Search } from 'lucide-react';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { formatSize } from '@/shared/lib/format-size';
import { MOTION, OVERLAY_RISE, OVERLAY_SETTLED } from '@/shared/motion';
import { useGuideClock } from '../lib/use-guide-clock';
import { GUIDE_FILES, GUIDE_LOOP_MS, GUIDE_RESULTS, GUIDE_MODEL_BYTES, GUIDE_STILL_MS, guideFrame, type GuideFrame } from '../model/guide-script';
import { MeaningRunStage } from './MeaningRunStage';

const noop = () => undefined;
const STILL = { duration: 0 };

function SampleFacts({ frame }: { frame: GuideFrame }) {
  const t = useTranslations('library.questionDesk.meaning');
  const locale = useLocale();
  const sentence = frame.scene === 'download'
    ? t('modelDownloading', {
      percent: Math.floor((frame.downloadedBytes / GUIDE_MODEL_BYTES) * 100),
      done: formatSize(frame.downloadedBytes, locale),
      total: formatSize(GUIDE_MODEL_BYTES, locale),
    })
    : frame.scene === 'fit'
      ? t('modelConverting')
      : t('preparing', { done: frame.filesDone, total: GUIDE_FILES });
  return <div className="flex h-6 min-w-0 items-center text-label leading-label tabular-nums text-[color:var(--color-text-tertiary)]">
    <span className="min-w-0 truncate">{sentence}</span>
  </div>;
}

function SampleAnswer({ frame, reduced }: { frame: GuideFrame; reduced: boolean }) {
  const t = useTranslations('library.questionDesk');
  const question = t('meaning.guide.question');
  const typed = question.slice(0, Math.round(frame.typed * question.length));
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex h-10 items-center gap-2.5 rounded-card border border-[color:var(--color-indigo-line-a40)] bg-[color:var(--color-overlay-1)] px-3">
        <Search aria-hidden className="size-4 flex-none text-[color:var(--color-text-tertiary)]" />
        <span className="min-w-0 flex-1 truncate text-body leading-body text-[color:var(--color-text-primary)]">
          {typed}
          {frame.typed < 1 ? <span aria-hidden className="ml-px inline-block h-3.5 w-px translate-y-0.5 bg-[color:var(--color-indigo-accent)]" /> : null}
        </span>
        <span className="flex-none rounded-chip bg-[color:var(--color-overlay-2)] px-2 py-0.5 text-label leading-label text-[color:var(--color-text-secondary)]">{t('search')}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {GUIDE_RESULTS.map((result, index) => (
          <AnimatePresence key={result.file} initial={false}>
            {frame.results > index ? (
              <motion.li
                initial={reduced ? false : OVERLAY_RISE}
                animate={OVERLAY_SETTLED}
                exit={{ opacity: 0 }}
                transition={reduced ? STILL : MOTION.slow}
                className="rounded-card px-1"
              >
                <p className="line-clamp-2 text-body leading-body text-[color:var(--color-text-primary)]">{result.text}</p>
                <p className="mt-1 flex min-w-0 items-center gap-x-2 text-label leading-label text-[color:var(--color-text-tertiary)]">
                  <FileText aria-hidden className="size-3 flex-none opacity-60" />
                  <span className="min-w-0 truncate text-[color:var(--color-text-secondary)]">{result.file}</span>
                  <span className="flex-none">{t('meaning.guide.line', { line: result.line })}</span>
                  <span aria-hidden>·</span>
                  <span className="flex-none text-[color:var(--color-indigo-accent)]">{t('meaning.reasonMeaning')}</span>
                </p>
              </motion.li>
            ) : null}
          </AnimatePresence>
        ))}
      </ul>
    </div>
  );
}

/** Reads nothing from the folder, takes no input, and holds still on the answered question under reduced motion. */
export function MeaningGuidePreview({ playing }: { playing: boolean }) {
  const t = useTranslations('library.questionDesk.meaning.guide');
  const reduced = usePrefersReducedMotion();
  const frameRef = useRef<HTMLDivElement>(null);
  const elapsed = useGuideClock(frameRef, playing && !reduced, GUIDE_LOOP_MS);
  const frame = guideFrame(reduced ? GUIDE_STILL_MS : elapsed);
  const asking = frame.scene === 'ask';
  const swap = reduced ? STILL : MOTION.expressive;

  return (
    <figure className="m-0 flex flex-col gap-2" data-testid="meaning-guide-preview" data-guide-scene={frame.scene}>
      <div ref={frameRef} inert aria-hidden="true" className="relative h-56 overflow-hidden rounded-panel sm:h-44 border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)]">
        <AnimatePresence initial={false}>
          <motion.div
            key={asking ? 'ask' : 'stage'}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={swap}
          >
            {asking ? <SampleAnswer frame={frame} reduced={reduced} /> : (
              <div className="flex h-full flex-col justify-center px-3">
                <MeaningRunStage
                  stage={frame.stage}
                  done={frame.scene === 'done' ? { passages: frame.stage.passagesDone, files: GUIDE_FILES } : null}
                  download={null}
                  measure={frame.scene === 'download' ? 'bytes' : frame.scene === 'read' ? 'files' : null}
                  facts={<SampleFacts frame={frame} />}
                  onAsk={noop}
                  onDismiss={noop}
                />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <figcaption className="flex min-w-0 items-center gap-2 text-label leading-label text-[color:var(--color-text-tertiary)]">
        <span className="flex-none rounded-chip border border-[color:var(--color-border-soft)] px-1.5 py-px text-[color:var(--color-text-secondary)]">{t('sample')}</span>
        <span className="min-w-0">{t('caption')}</span>
      </figcaption>
    </figure>
  );
}
