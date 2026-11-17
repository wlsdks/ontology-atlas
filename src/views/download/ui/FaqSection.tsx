'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';
import { useSurfaceSwap } from '@/shared/lib/render-timing/use-presence';
import { useViewportBelow } from '@/shared/lib/use-viewport-below';
import { isMotionPaused, useMotionPaused } from '@/shared/motion/motion-pause';
import { MOTION, MOTION_EASE } from '@/shared/motion/tokens';
import { TabBar } from '@/shared/ui/controls/tab-bar';

import { usePlayOnce } from '../lib/use-play-once';
import { FAQ_KEYS, splitAnswer } from '../model/faq';
import { SectionIntro } from './SectionIntro';

const EASE = `cubic-bezier(${MOTION_EASE.join(', ')})`;
const RISE_MS = MOTION.slow.duration * 1000;
const RISE_PX = 8;
/** How long one answer stays before the next takes its place, while nobody is reading by hand. */
const ADVANCE_MS = 6000;
/** The leaving answer's fade, shorter than the 240ms arrival (`gateway.css`). */
const LEAVE_MS = MOTION.fast.duration * 1000;
/** From this width the questions pick and one answer shows beside them. */
const PICKER_FROM_PX = 1024;

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type Item = { key: (typeof FAQ_KEYS)[number]; question: string; answer: string };

/**
 * Short answers to what a first-time visitor asks before installing. From 1024px the questions are
 * a list to pick from on the left and the picked answer is shown large on the right; it moves on by
 * itself every six seconds while in view, not under the pointer or focus, until a person picks. Narrower, under reduced motion, without a
 * script, or before the script arrives, every question stands over its answer. Every answer is in the page in both
 * layouts, in the same words as the route's FAQPage markup.
 */
export function FaqSection() {
  const t = useTranslations('download.faq');
  const items: Item[] = FAQ_KEYS.map((key) => ({ key, question: t(`items.${key}.q`), answer: t(`items.${key}.a`) }));
  const narrow = useViewportBelow(PICKER_FROM_PX);
  /* Only after hydration, so the server's full list and the first client paint agree. */
  const [pickable, setPickable] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setPickable(!prefersReducedMotion()));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <section
      id="faq"
      data-testid="gateway-faq-section"
      className={cn(PAGE_GUTTER, 'mt-[var(--gateway-section-gap)] w-full scroll-mt-24')}
    >
      <div className={cn(PAGE_COLUMN, 'min-w-0')}>
        <SectionIntro eyebrow={t('eyebrow')} title={t('title')} quiet />
        {pickable && !narrow ? <FaqPicker items={items} label={t('title')} /> : <FaqList items={items} />}
      </div>
    </section>
  );
}

/**
 * The answer's first sentence in full ink and the rest a step quieter. Large, beside the picked
 * question, the first sentence stands on its own line; in the list the two run on in one paragraph.
 */
function Answer({ answer, large = false }: { answer: string; large?: boolean }) {
  const { lead, gap, rest } = splitAnswer(answer);
  if (!large) {
    return (
      <p className="min-w-0 max-w-[36rem] text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
        <span className="text-[color:var(--color-text-primary)]">{lead}</span>
        {gap}
        {rest}
      </p>
    );
  }
  return (
    <p className="min-w-0 max-w-[36rem]">
      <span className="block text-display leading-display tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]">
        {lead}
      </span>
      {gap}
      {rest ? (
        <span className="mt-4 block text-reading leading-prose text-[color:var(--color-text-secondary)]">{rest}</span>
      ) : null}
    </p>
  );
}

function listEntrance(list: HTMLUListElement): Animation[] {
  return [...list.querySelectorAll('li')].map((row, index) =>
    row.animate(
      [
        { opacity: 0, transform: `translateY(${RISE_PX}px)` },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: RISE_MS, delay: index * 40, easing: EASE, fill: 'backwards' },
    ),
  );
}

/** Every question over its answer: the phone, no script, and the first paint. */
function FaqList({ items }: { items: Item[] }) {
  const list = usePlayOnce<HTMLUListElement>(listEntrance);
  return (
    <ul ref={list} data-testid="gateway-faq-list" className="mt-8 flex min-w-0 flex-col">
      {items.map((item) => (
        <li
          key={item.key}
          data-testid="gateway-faq-row"
          className="grid min-w-0 gap-x-12 gap-y-1.5 border-t border-[color:var(--color-divider)] py-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
        >
          <h3 className="min-w-0 text-body-lg leading-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
            {item.question}
          </h3>
          <Answer answer={item.answer} />
        </li>
      ))}
    </ul>
  );
}

/** Whether the picker may move on by itself: in view, untouched, in a visible tab, motion allowed. */
function useAdvanceAllowed(host: HTMLElement | null, held: boolean): boolean {
  const [inView, setInView] = useState(false);
  const [visible, setVisible] = useState(true);
  const paused = useMotionPaused();
  useEffect(() => {
    if (!host || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => setInView(entries[entries.length - 1].intersectionRatio >= 0.2),
      { threshold: [0, 0.2] },
    );
    observer.observe(host);
    const sync = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', sync);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [host]);
  return inView && visible && !held && !paused;
}

/**
 * The wide layout: the questions as tabs on the left, all six answers stacked in one cell on the
 * right with only the picked one shown, so the page holds every answer whichever is picked.
 */
function FaqPicker({ items, label }: { items: Item[]; label: string }) {
  const [active, setActive] = useState(0);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  /** Picked by hand: the picker no longer moves by itself. */
  const [touched, setTouched] = useState(false);
  /** Moved at all: the first answer is simply there, later ones arrive. */
  const [moved, setMoved] = useState(false);
  const allowed = useAdvanceAllowed(host, hovered || focused || touched);
  const { leaving } = useSurfaceSwap(active, LEAVE_MS);
  const progress = useRef<HTMLSpanElement>(null);
  const run = useRef<Animation | null>(null);

  /* The progress line sits under the picked question, inside its surface. */
  useLayoutEffect(() => {
    const line = progress.current;
    const tab = document.getElementById(`gateway-faq-tab-${items[active].key}`);
    if (!line || !tab) return;
    line.style.top = `${tab.offsetTop + tab.offsetHeight - 6}px`;
  }, [active, items]);

  /* One run of the progress line per picked answer; its end moves the picker on. */
  useEffect(() => {
    const line = progress.current;
    if (!line || typeof line.animate !== 'function') return;
    const animation = line.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
      duration: ADVANCE_MS,
      easing: 'linear',
      fill: 'both',
    });
    animation.pause();
    animation.onfinish = () => {
      if (isMotionPaused()) return;
      setMoved(true);
      setActive((active + 1) % items.length);
    };
    run.current = animation;
    return () => {
      animation.onfinish = null;
      animation.cancel();
      run.current = null;
    };
  }, [active, items.length]);

  useEffect(() => {
    const animation = run.current;
    if (!animation) return;
    if (allowed) animation.play();
    else animation.pause();
  }, [allowed, active]);

  return (
    <div
      ref={setHost}
      data-testid="gateway-faq-picker"
      className="mt-8 grid min-w-0 grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-x-10 border-t border-[color:var(--color-divider)] pt-8"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div className="relative min-w-0">
        <TabBar
          items={items.map((item) => ({ key: item.key, label: item.question, testId: `gateway-faq-tab-${item.key}` }))}
          activeKey={items[active].key}
          onSelect={(key) => {
            setTouched(true);
            setMoved(true);
            setActive(items.findIndex((item) => item.key === key));
          }}
          ariaLabel={label}
          idPrefix="gateway-faq"
          orientation="vertical"
          size="reading"
        />
        {/* How long until the next answer; it waits while the picker is in hand, and goes once a question is picked. */}
        <span
          ref={progress}
          aria-hidden
          className={cn(
            'pointer-events-none absolute left-4 right-4 top-0 h-px origin-left [transform:scaleX(0)] bg-[color:var(--color-indigo-accent)]',
            touched && 'invisible',
          )}
        />
      </div>
      {/*
        One panel as tall as the question list beside it, so the answer has a place of its own
        rather than floating over an empty band.
      */}
      <div className="gateway-faq-answers gateway-loop-drawing grid min-w-0 content-start rounded-panel border border-[color:var(--color-border-soft)] p-8 [&>*]:[grid-area:1/1]">
        {items.map((item, index) => {
          const state = index === active ? 'active' : index === leaving ? 'leaving' : 'hidden';
          return (
            <div
              key={item.key}
              role="tabpanel"
              id={`gateway-faq-tabpanel-${item.key}`}
              aria-labelledby={`gateway-faq-tab-${item.key}`}
              data-state={state}
              inert={state !== 'active'}
              className={cn(
                'min-w-0',
                state === 'active' && moved && 'gateway-screen-in',
                state === 'leaving' && 'gateway-screen-out',
                state === 'hidden' && 'invisible',
              )}
            >
              <Answer answer={item.answer} large />
            </div>
          );
        })}
      </div>
    </div>
  );
}
