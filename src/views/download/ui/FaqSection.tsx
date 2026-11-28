import { useId, type CSSProperties } from 'react';
import { useTranslations } from 'use-intl';

import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';
import { MOTION, MOTION_EASE } from '@/shared/motion/tokens';

import { usePlayOnce } from '../lib/page-motion/use-play-once';
import { FAQ_KEYS, splitAnswer } from '../model/faq';
import { SectionIntro } from './SectionIntro';

const EASE = `cubic-bezier(${MOTION_EASE.join(', ')})`;
const RISE_MS = MOTION.slow.duration * 1000;
const RISE_PX = 8;

const ROW =
  'grid min-w-0 gap-x-12 gap-y-6 border-t border-[color:var(--color-divider)] py-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]';
const QUESTION =
  'min-w-0 [text-wrap:balance] text-display leading-display tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]';

export function FaqSection() {
  const t = useTranslations('download.faq');
  const list = usePlayOnce<HTMLUListElement>(rowsEntrance);
  const [privacy, difference] = FAQ_KEYS;
  return (
    <section
      id="faq"
      data-testid="gateway-faq-section"
      className={cn(PAGE_GUTTER, 'mt-[var(--gateway-section-gap)] w-full scroll-mt-24')}
    >
      <div className={cn(PAGE_COLUMN, 'min-w-0')}>
        <SectionIntro eyebrow={t('eyebrow')} title={t('title')} quiet />
        <ul ref={list} data-testid="gateway-faq-list" className="mt-8 flex min-w-0 flex-col">
          <li data-testid="gateway-faq-row" data-faq-key={privacy} className={cn(ROW, 'lg:items-center')}>
            <div className="min-w-0">
              <h3 className={QUESTION}>{t(`items.${privacy}.q`)}</h3>
              <Answer answer={t(`items.${privacy}.a`)} className="mt-3" />
            </div>
            <PrivacyDrawing />
          </li>
          <li data-testid="gateway-faq-row" data-faq-key={difference} className={ROW}>
            <h3 className={QUESTION}>{t(`items.${difference}.q`)}</h3>
            <Answer answer={t(`items.${difference}.a`)} />
          </li>
        </ul>
      </div>
    </section>
  );
}

function Answer({ answer, className }: { answer: string; className?: string }) {
  const { lead, gap, rest } = splitAnswer(answer);
  return (
    <p
      className={cn(
        'min-w-0 max-w-[38rem] text-reading leading-prose text-[color:var(--color-text-secondary)]',
        className,
      )}
    >
      <span className="text-[color:var(--color-text-primary)]">{lead}</span>
      {gap}
      {rest}
    </p>
  );
}

function rowsEntrance(list: HTMLUListElement): Animation[] {
  return [...list.querySelectorAll(':scope > li')].map((row, index) =>
    row.animate(
      [
        { opacity: 0, transform: `translateY(${RISE_PX}px)` },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: RISE_MS, delay: index * 40, easing: EASE, fill: 'backwards' },
    ),
  );
}

/*
 * The privacy drawing. Wide, on a 640×240 field: the reader's computer as a boundary from x 8 to
 * 452 holding the repository folder, the Atlas app and the coding agent on one line at y 120;
 * outside it, the agent's provider reached by the agent's own dashed line, and an empty dashed
 * ring that no line reaches, where an Atlas backend would be. In a container under 30rem (a phone)
 * the same parts stack on a 640×470 field, so every label has room on one or two lines: the
 * boundary takes the width, and the provider and the ring sit under it, the dashed line running
 * down to the provider.
 */
type Point = readonly [x: number, y: number];
type Shape = {
  boundary: { x: number; y: number; width: number; height: number };
  marks: Record<'folder' | 'app' | 'agent' | 'provider' | 'ring', Point>;
  traffic: string;
};
const FIELD_WIDTH = 640;
const MARK_R = 7;
const RADIUS = 14;

function shape(boundary: Shape['boundary'], marks: Shape['marks']): Shape {
  const [ax, ay] = marks.agent;
  const [px, py] = marks.provider;
  const traffic = ay === py ? `M${ax + MARK_R} ${ay} H${px - MARK_R}` : `M${ax} ${ay + MARK_R} V${py - MARK_R}`;
  return { boundary, marks, traffic };
}

const WIDE_SHAPE = shape(
  { x: 8, y: 8, width: 444, height: 224 },
  { folder: [88, 120], app: [230, 120], agent: [372, 120], provider: [572, 120], ring: [572, 196] },
);
const NARROW_SHAPE = shape(
  { x: 8, y: 8, width: 624, height: 244 },
  { folder: [112, 140], app: [296, 140], agent: [520, 140], provider: [520, 372], ring: [200, 372] },
);

const BEAT = {
  boundary: { at: 0, ms: 500 },
  folderApp: { at: 300, ms: 500 },
  appAgent: { at: 700, ms: 400 },
  traffic: { at: 1100, ms: 600 },
  ring: { at: 1700, ms: 400 },
} as const;

type Hang = 'below' | 'belowLeft' | 'above' | 'aboveFrom' | 'from' | 'leftOf';
type Place = { x: number; y: number; hang: Hang; width: number };
type Label = { key: string; at: number; quiet?: boolean; wide: Place; narrow: Place };

const between = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const W = WIDE_SHAPE.marks;
const N = NARROW_SHAPE.marks;
const corner = (s: Shape, width: number): Place => ({ x: s.boundary.x + 14, y: s.boundary.y + 12, hang: 'from', width });

const LABELS: readonly Label[] = [
  { key: 'computer', at: 200, wide: corner(WIDE_SHAPE, 220), narrow: corner(NARROW_SHAPE, 420) },
  {
    key: 'folder',
    at: 300,
    wide: { x: W.folder[0], y: W.folder[1], hang: 'below', width: 140 },
    narrow: { x: N.folder[0], y: N.folder[1], hang: 'below', width: 196 },
  },
  {
    key: 'readsWrites',
    at: 500,
    wide: { x: between(W.folder, W.app)[0], y: W.app[1], hang: 'above', width: 128 },
    narrow: { x: between(N.folder, N.app)[0], y: N.app[1], hang: 'above', width: 190 },
  },
  {
    key: 'app',
    at: 700,
    wide: { x: W.app[0], y: W.app[1], hang: 'below', width: 128 },
    narrow: { x: N.app[0], y: N.app[1], hang: 'below', width: 200 },
  },
  {
    key: 'mcp',
    at: 850,
    wide: { x: between(W.app, W.agent)[0], y: W.agent[1], hang: 'above', width: 128 },
    narrow: { x: between(N.app, N.agent)[0], y: N.agent[1], hang: 'above', width: 190 },
  },
  {
    key: 'agent',
    at: 1000,
    wide: { x: W.agent[0], y: W.agent[1], hang: 'below', width: 128 },
    // The dashed line leaves the agent downwards on a phone, so its name stands left of the line.
    narrow: { x: N.agent[0] - 12, y: N.agent[1], hang: 'belowLeft', width: 146 },
  },
  {
    key: 'traffic',
    at: 1250,
    quiet: true,
    wide: { x: WIDE_SHAPE.boundary.x + WIDE_SHAPE.boundary.width + 10, y: W.provider[1], hang: 'aboveFrom', width: 178 },
    narrow: { x: N.agent[0] - 14, y: between(N.agent, N.provider)[1] + 40, hang: 'leftOf', width: 280 },
  },
  {
    key: 'provider',
    at: 1550,
    quiet: true,
    wide: { x: W.provider[0], y: W.provider[1], hang: 'below', width: 136 },
    narrow: { x: N.provider[0], y: N.provider[1], hang: 'below', width: 210 },
  },
  {
    key: 'noBackend',
    at: 1850,
    quiet: true,
    wide: { x: W.ring[0], y: W.ring[1], hang: 'below', width: 136 },
    narrow: { x: N.ring[0], y: N.ring[1], hang: 'below', width: 240 },
  },
];

const CQW = (value: number) => `${(value / FIELD_WIDTH) * 100}cqw`;
const GAP: Record<Hang, string> = {
  below: '0.75rem',
  belowLeft: '0.75rem',
  above: '-0.5rem',
  aboveFrom: '-0.5rem',
  from: '0rem',
  leftOf: '0rem',
};
const SHIFT: Record<Hang, string> = {
  below: '-50% 0',
  belowLeft: '-100% 0',
  above: '-50% -100%',
  aboveFrom: '0 -100%',
  from: '0 0',
  leftOf: '-100% -50%',
};
const ALIGN: Record<Hang, string> = {
  below: 'center',
  belowLeft: 'right',
  above: 'center',
  aboveFrom: 'left',
  from: 'left',
  leftOf: 'right',
};

function labelStyle({ wide, narrow }: Label): CSSProperties {
  const top = (place: Place) => `calc(${CQW(place.y)} + ${GAP[place.hang]})`;
  return {
    '--faq-label-left': CQW(wide.x),
    '--faq-label-top': top(wide),
    '--faq-label-shift': SHIFT[wide.hang],
    '--faq-label-width': CQW(wide.width),
    '--faq-label-align': ALIGN[wide.hang],
    '--faq-label-left-narrow': CQW(narrow.x),
    '--faq-label-top-narrow': top(narrow),
    '--faq-label-shift-narrow': SHIFT[narrow.hang],
    '--faq-label-width-narrow': CQW(narrow.width),
    '--faq-label-align-narrow': ALIGN[narrow.hang],
  } as CSSProperties;
}

const LABEL_PLACE = cn(
  'left-[var(--faq-label-left-narrow)] top-[var(--faq-label-top-narrow)] max-w-[var(--faq-label-width-narrow)]',
  '[translate:var(--faq-label-shift-narrow)] [text-align:var(--faq-label-align-narrow)]',
  '@[30rem]:left-[var(--faq-label-left)] @[30rem]:top-[var(--faq-label-top)] @[30rem]:max-w-[var(--faq-label-width)]',
  '@[30rem]:[translate:var(--faq-label-shift)] @[30rem]:[text-align:var(--faq-label-align)]',
);

function drawingEntrance(figure: HTMLElement): Animation[] {
  const draw = [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }];
  const pop = [
    { opacity: 0, transform: 'scale(0.4)' },
    { opacity: 1, transform: 'scale(1)' },
  ];
  const rise = [
    { opacity: 0, transform: `translateY(${RISE_PX}px)` },
    { opacity: 1, transform: 'translateY(0)' },
  ];
  const once = (delay: number, duration: number) => ({ delay, duration, easing: EASE, fill: 'backwards' as const });
  const animations: Animation[] = [];
  const play = (selector: string, keyframes: Keyframe[], delay: number, duration: number) => {
    for (const element of figure.querySelectorAll(selector)) {
      animations.push(element.animate(keyframes, once(delay, duration)));
    }
  };
  play('[data-faq-boundary]', draw, BEAT.boundary.at, BEAT.boundary.ms);
  play('[data-faq-mark="folder"]', pop, BEAT.folderApp.at, RISE_MS);
  play('[data-faq-link="folderApp"]', draw, BEAT.folderApp.at, BEAT.folderApp.ms);
  play('[data-faq-mark="app"]', pop, BEAT.appAgent.at, RISE_MS);
  play('[data-faq-link="appAgent"]', draw, BEAT.appAgent.at, BEAT.appAgent.ms);
  play('[data-faq-mark="agent"]', pop, BEAT.traffic.at - 100, RISE_MS);
  play('[data-faq-traffic-reveal]', draw, BEAT.traffic.at, BEAT.traffic.ms);
  play('[data-faq-mark="provider"]', pop, BEAT.traffic.at + BEAT.traffic.ms - 160, RISE_MS);
  play('[data-faq-mark="ring"]', pop, BEAT.ring.at, BEAT.ring.ms);
  figure.querySelectorAll<HTMLElement>('[data-faq-label]').forEach((label, index) => {
    animations.push(label.animate(rise, once(LABELS[index].at, RISE_MS)));
  });
  return animations;
}

function Shapes({ shape: s, id, className }: { shape: Shape; id: string; className: string }) {
  const mark = { transformBox: 'fill-box', transformOrigin: 'center' } as const;
  const drawn = { pathLength: 1, strokeDasharray: '1 1' } as const;
  const link = (from: Point, to: Point) => `M${from[0] + MARK_R} ${from[1]} H${to[0] - MARK_R}`;
  const { boundary, marks } = s;
  return (
    <g className={className}>
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={FIELD_WIDTH} height={480}>
          <path data-faq-traffic-reveal d={s.traffic} {...drawn} stroke="white" strokeWidth={8} />
        </mask>
      </defs>
      <rect
        data-faq-boundary
        {...boundary}
        rx={RADIUS}
        {...drawn}
        strokeWidth={1}
        className="stroke-[color:var(--color-border-strong)]"
      />
      {(
        [
          ['folderApp', marks.folder, marks.app],
          ['appAgent', marks.app, marks.agent],
        ] as const
      ).map(([key, from, to]) => (
        <path
          key={key}
          data-faq-link={key}
          d={link(from, to)}
          {...drawn}
          strokeWidth={2}
          className="stroke-[color:var(--map-indigo-bright)]"
        />
      ))}
      <path
        d={s.traffic}
        mask={`url(#${id})`}
        strokeWidth={1.5}
        strokeDasharray="5 5"
        className="stroke-[color:var(--color-text-tertiary)]"
      />
      {(['folder', 'app', 'agent'] as const).map((key) => (
        <circle
          key={key}
          data-faq-mark={key}
          cx={marks[key][0]}
          cy={marks[key][1]}
          r={MARK_R}
          style={mark}
          className="fill-[color:var(--map-indigo-bright)]"
        />
      ))}
      <circle
        data-faq-mark="provider"
        cx={marks.provider[0]}
        cy={marks.provider[1]}
        r={MARK_R}
        style={mark}
        className="fill-[color:var(--color-text-tertiary)]"
      />
      <circle
        data-faq-mark="ring"
        cx={marks.ring[0]}
        cy={marks.ring[1]}
        r={MARK_R}
        style={mark}
        strokeWidth={1.5}
        strokeDasharray="3 3"
        className="stroke-[color:var(--color-text-tertiary)]"
      />
    </g>
  );
}

function PrivacyDrawing() {
  const t = useTranslations('download.faq.diagram');
  const figure = usePlayOnce<HTMLElement>(drawingEntrance);
  const id = useId();
  return (
    <figure ref={figure} data-testid="gateway-faq-drawing" className="@container w-full min-w-0 max-w-[40rem]">
      {/* The field: 640×470 under 30rem, 640×240 wide; the SVG draws past its 240 rows there. */}
      <div className="relative aspect-[640/470] w-full @[30rem]:aspect-[640/240]">
        <svg
          aria-hidden
          viewBox={`0 0 ${FIELD_WIDTH} 240`}
          className="absolute left-0 top-0 aspect-[640/240] w-full overflow-visible"
          fill="none"
        >
          <Shapes shape={WIDE_SHAPE} id={`${id}-wide`} className="hidden @[30rem]:inline" />
          <Shapes shape={NARROW_SHAPE} id={`${id}-narrow`} className="@[30rem]:hidden" />
        </svg>
        {LABELS.map((label) => (
          <span
            key={label.key}
            data-faq-label
            className={cn(
              'absolute block w-max text-pretty [word-break:auto-phrase] text-body leading-body',
              '@[30rem]:text-body-lg @[30rem]:leading-body-lg',
              LABEL_PLACE,
              label.quiet ? 'text-[color:var(--color-text-tertiary)]' : 'text-[color:var(--color-text-secondary)]',
            )}
            style={labelStyle(label)}
          >
            {t(label.key)}
          </span>
        ))}
      </div>
    </figure>
  );
}
