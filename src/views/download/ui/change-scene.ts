import {
  hopMs,
  LIGHT_LAYERS,
  LIGHT_REST,
  lightStops,
  SHOWPIECE_CLOCK,
  type FrameValue,
  type LayoutBox,
  type ShowpieceEnv,
  type ShowpieceTracks,
  type Stop,
} from './showpiece-player';

export interface ChangeRow {
  file: string;
  added: number;
  removed: number;
  concept: string;
  /** Concepts listed after this one on the map that the commit leaves alone. */
  calm: readonly string[];
}

/** Concepts and files from this repository's vault; the commit around them is an example. */
export const CHANGE_CAST: readonly ChangeRow[] = [
  {
    file: 'src/views/library/ui/LibraryPage.tsx',
    added: 18,
    removed: 4,
    concept: 'capability:library-workspace',
    calm: ['capability:wiki-pages'],
  },
  {
    file: 'src/features/library/lib/judge-page-write.ts',
    added: 9,
    removed: 2,
    concept: 'element:wiki-page-write-judge',
    calm: ['capability:ontology-insights'],
  },
  {
    file: 'src/features/saved-constellations/model/use-saved-constellations.ts',
    added: 6,
    removed: 6,
    concept: 'capability:saved-constellations',
    calm: ['capability:agent-work-visibility', 'capability:graph-block-exchange'],
  },
];

export const CHANGE_WIDE_MIN = 900;
export const CHANGE_DURATION = 2800;

export const CHANGE_BEATS = Object.freeze({
  cause: 0,
  light: [360, 480, 600] as const,
  travel: [1100, 1100 + SHOWPIECE_CLOCK.stagger, 1100 + SHOWPIECE_CLOCK.stagger * 2] as const,
  answer: 1500,
  offer: 1900,
});

export const fileName = (file: string) => file.slice(file.lastIndexOf('/') + 1);
export const folderOf = (file: string) => file.slice(0, file.lastIndexOf('/') + 1);

const RISE_REST = 'translate(0px, 0px)';
const PLACED = 'scale(1)';

/** Every moving part's resting value: the frame React renders, and the one reduced motion keeps. */
export function changeRest(part: string): FrameValue {
  if (part.startsWith('light:')) return LIGHT_REST;
  if (part.startsWith('dot:') || part === 'line-dot') return { transform: PLACED };
  if (part.startsWith('travel:')) return { opacity: 1, transform: RISE_REST };
  if (part === 'underline') return { transform: 'scaleX(1)' };
  return { opacity: 1 };
}

export interface ChangeMeasure {
  /** Per row: how far the travelling path starts from its resting place, and the light's path length. */
  rows: { travel: { dx: number; dy: number }; thread: number }[];
}

export function measureChange(stage: HTMLElement, box: (element: HTMLElement) => LayoutBox | null): ChangeMeasure {
  return {
    rows: CHANGE_CAST.map((_, index) => {
      const source = stage.querySelector<HTMLElement>(`[data-anchor="src-${index}"]`);
      const target = stage.querySelector<HTMLElement>(`[data-anchor="travel-${index}"]`);
      const thread = stage.querySelector<SVGPathElement>(`[data-anchor="thread-${index}"]`);
      const from = source ? box(source) : null;
      const to = target ? box(target) : null;
      return {
        travel: from && to ? { dx: from.x - to.x, dy: from.y - to.y } : { dx: 0, dy: 0 },
        thread: Number(thread?.getAttribute('data-length') ?? 0),
      };
    }),
  };
}

export function changeTracks(measure: ChangeMeasure, env: ShowpieceEnv): ShowpieceTracks {
  const c = SHOWPIECE_CLOCK;
  const b = CHANGE_BEATS;
  const { ease, place, surface } = env.easing;
  const alpha = env.light.restAlpha;
  const inkUp = (at: number, duration: number): Stop[] => [
    [0, { opacity: alpha }],
    [at, { opacity: alpha }, ease],
    [at + duration, { opacity: 1 }],
  ];
  const setDown = (at: number): Stop[] => [
    [0, { transform: 'scale(0)' }],
    [at, { transform: 'scale(0)' }, place],
    [at + c.settle, { transform: PLACED }],
  ];
  const tracks: Record<string, Stop[][]> = {
    card: [inkUp(b.cause, c.base)],
    brief: [inkUp(b.answer, c.base)],
    line: [inkUp(b.answer, c.base)],
    'line-dot': [setDown(b.answer)],
    underline: [
      [
        [0, { transform: 'scaleX(0)' }],
        [b.answer, { transform: 'scaleX(0)' }, ease],
        [b.answer + c.settle, { transform: 'scaleX(1)' }],
      ],
    ],
    ask: [inkUp(b.offer, c.fast)],
  };
  measure.rows.forEach((row, index) => {
    const start = b.light[index]!;
    const hop = hopMs(row.thread, env.light);
    const arrival = start + hop;
    tracks[`row:${index}`] = [inkUp(b.cause + index * c.stagger, c.base)];
    for (const layer of LIGHT_LAYERS) tracks[`light:${index}/${layer}`] = [lightStops(start, hop, layer, env.light)];
    tracks[`chip:${index}`] = [inkUp(arrival, c.fast)];
    tracks[`dot:${index}`] = [setDown(arrival)];
    const away = `translate(${Math.round(row.travel.dx)}px, ${Math.round(row.travel.dy)}px)`;
    const leave = b.travel[index]!;
    tracks[`travel:${index}`] = [
      [
        [0, { transform: away }],
        [leave, { transform: away }, surface],
        [leave + c.surface, { transform: RISE_REST }],
      ],
      [
        [0, { opacity: 0 }],
        [leave, { opacity: 0 }, ease],
        [leave + c.fast, { opacity: 1 }],
      ],
    ];
  });
  return tracks;
}
