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

export const START_WIDE_MIN = 900;
export const START_DURATION = 4000;
/** One write batch drafts the map: 1 project, 4 domains, 7 capabilities. */
export const START_DRAFT_COUNT = 12;

export const START_BEATS = Object.freeze({
  moves: [0, 900, 1900] as const,
  presses: [420, 1300, 2300] as const,
  gutters: [520, 1400] as const,
  gutterHop: 260,
  stamp: 2450,
  tiers: [2600, 2640, 2680] as const,
  light: 2800,
  state: 3300,
  exit: 3500,
});

/** The drafted map in a 400 × 190 box: names stay unknown until the visitor opens a folder. */
export const DRAFT_MAP = (() => {
  const capabilities = [
    { x: 40, parent: 0 },
    { x: 92, parent: 0 },
    { x: 142, parent: 1 },
    { x: 194, parent: 1 },
    { x: 246, parent: 2 },
    { x: 298, parent: 2 },
    { x: 356, parent: 3 },
  ].map((capability) => ({ ...capability, y: 160 }));
  const domains = [0, 1, 2, 3].map((index) => {
    const xs = capabilities.filter((capability) => capability.parent === index).map((capability) => capability.x);
    return { x: xs.reduce((sum, x) => sum + x, 0) / xs.length, y: 96 };
  });
  const project = { x: 200, y: 30 };
  return { width: 400, height: 190, project, domains, capabilities, sizes: { project: 30, domain: 22, capability: 16 } };
})();

export function draftEdges() {
  const { project, domains, capabilities, sizes } = DRAFT_MAP;
  return [
    ...domains.map((domain) => ({
      from: { x: project.x, y: project.y + sizes.project / 2 - 1 },
      to: { x: domain.x, y: domain.y - sizes.domain / 2 + 3 },
    })),
    ...capabilities.map((capability) => ({
      from: { x: domains[capability.parent]!.x, y: domains[capability.parent]!.y + sizes.domain / 2 - 3 },
      to: { x: capability.x, y: capability.y - sizes.capability / 2 + 1 },
    })),
  ];
}

/** The light's walk: project to the first domain to its first capability. */
export function draftLightPaths() {
  const edges = draftEdges();
  return [edges[0]!, edges[DRAFT_MAP.domains.length]!].map(({ from, to }) => ({
    d: `M ${from.x} ${from.y} L ${to.x} ${to.y}`,
    length: Math.hypot(to.x - from.x, to.y - from.y),
  }));
}

const STEPPED = 'var(--map-spotlight-rest-alpha)';
const POINTER_REST = 'translate(24px, 28px)';
const RISE_REST = 'translate(0px, 0px)';

/** Resting values: wide rests windows 1-2 stepped down and 3 full; narrow rests on its third state. */
export function startRest(part: string, wide: boolean): FrameValue {
  if (part.startsWith('light:')) return LIGHT_REST;
  if (part === 'pointer') return { transform: POINTER_REST };
  if (part.startsWith('press:')) return { transform: 'scale(1)' };
  if (part === 'underline') return { transform: 'scaleX(1)' };
  if (part === 'card') return { opacity: 0 };
  if (part === 'stamp') return { opacity: 1, transform: RISE_REST };
  if (part.startsWith('tier:')) return { opacity: 1, transform: RISE_REST };
  if (part === 'relations') return { opacity: STEPPED };
  if (part === 'win:2' || part === 'cap:2') return { opacity: 1 };
  if (part.startsWith('win:')) return { opacity: wide ? STEPPED : 0 };
  if (part.startsWith('cap:')) return { opacity: STEPPED };
  return { opacity: 1 };
}

export interface StartMeasure {
  wide: boolean;
  /** Pointer translations that put its tip on each pressed button. */
  pointer: { x: number; y: number }[];
  stamp: { dx: number; dy: number };
}

export function measureStart(
  stage: HTMLElement,
  wide: boolean,
  box: (element: HTMLElement) => LayoutBox | null,
): StartMeasure {
  const find = (name: string) => {
    const element = stage.querySelector<HTMLElement>(`[data-anchor="${name}"]`);
    return element ? box(element) : null;
  };
  const pointer = find('pointer');
  const targets = ['press-0', 'press-1', 'press-2'].map(find);
  const card = find('card');
  const stamp = find('stamp');
  return {
    wide,
    pointer: targets.map((target) =>
      target && pointer
        ? {
            x: Math.round(target.x + target.width * 0.62 - pointer.x),
            y: Math.round(target.y + target.height * 0.58 - pointer.y),
          }
        : { x: 0, y: 0 },
    ),
    stamp:
      card && stamp
        ? {
            dx: Math.round(card.x + card.width / 2 - (stamp.x + stamp.width / 2)),
            dy: Math.round(card.y + card.height / 2 - (stamp.y + stamp.height / 2)),
          }
        : { dx: 0, dy: 0 },
  };
}

export function startTracks(measure: StartMeasure, env: ShowpieceEnv): ShowpieceTracks {
  const c = SHOWPIECE_CLOCK;
  const b = START_BEATS;
  const { ease, exit, canvas, surface, control } = env.easing;
  const alpha = env.light.restAlpha;
  const fade = (from: number, to: number, at: number, duration: number, curve = ease): Stop[] => [
    [at, { opacity: from }, curve],
    [at + duration, { opacity: to }],
  ];
  const at = (point: { x: number; y: number }) => `translate(${point.x}px, ${point.y}px)`;
  const [p1, p2, p3] = measure.pointer as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
  const travel = 380;
  const tracks: Record<string, Stop[][]> = {
    pointer: [
      [
        [0, { transform: POINTER_REST }],
        [b.moves[0], { transform: POINTER_REST }, surface],
        [b.moves[0] + travel, { transform: at(p1) }],
        [b.moves[1], { transform: at(p1) }, surface],
        [b.moves[1] + travel, { transform: at(p2) }],
        [b.moves[2], { transform: at(p2) }, surface],
        [b.moves[2] + travel, { transform: at(p3) }],
        [b.exit, { transform: at(p3) }, exit],
        [b.exit + c.base * 2, { transform: POINTER_REST }],
      ],
    ],
    fill: [[[0, { opacity: 0 }], ...fade(0, 1, b.presses[2], c.fast)]],
    card: [[[0, { opacity: 1 }], ...fade(1, 0, b.stamp, c.fast, exit)]],
    stamp: [
      [
        [0, { transform: `translate(${measure.stamp.dx}px, ${measure.stamp.dy}px)` }],
        [b.stamp, { transform: `translate(${measure.stamp.dx}px, ${measure.stamp.dy}px)` }, surface],
        [b.stamp + c.surface, { transform: RISE_REST }],
      ],
      [[0, { opacity: 0 }], ...fade(0, 1, b.stamp, c.fast)],
    ],
    relations: [[[0, { opacity: 0 }], ...fade(0, alpha, b.tiers[0], c.base)]],
    unreviewed: [[[0, { opacity: 0 }], ...fade(0, alpha, b.tiers[0], c.base), ...fade(alpha, 1, b.state, c.fast)]],
    underline: [
      [
        [0, { transform: 'scaleX(0)' }],
        [b.presses[2], { transform: 'scaleX(0)' }, ease],
        [b.presses[2] + c.settle, { transform: 'scaleX(1)' }],
      ],
    ],
  };
  b.presses.forEach((press, index) => {
    tracks[`press:${index}`] = [
      [
        [0, { transform: 'scale(1)' }],
        [press, { transform: 'scale(1)' }, ease],
        [press + c.fast, { transform: 'scale(0.97)' }, control],
        [press + c.fast + c.control, { transform: 'scale(1)' }],
      ],
    ];
  });
  b.tiers.forEach((tier, index) => {
    tracks[`tier:${index}`] = [
      [
        [0, { transform: 'translate(0px, 4px)' }],
        [tier, { transform: 'translate(0px, 4px)' }, canvas],
        [tier + c.canvas, { transform: RISE_REST }],
      ],
      [[0, { opacity: 0 }], ...fade(0, 1, tier, c.base)],
    ];
  });
  const [step2, step3] = b.gutters;
  const windows: Stop[][] = measure.wide
    ? [
        [[0, { opacity: alpha }], ...fade(alpha, 1, b.moves[0], c.base), ...fade(1, alpha, step2, c.base)],
        [[0, { opacity: alpha }], ...fade(alpha, 1, step2, c.base), ...fade(1, alpha, step3, c.base)],
        [[0, { opacity: alpha }], ...fade(alpha, 1, step3, c.base)],
      ]
    : [
        [[0, { opacity: alpha }], ...fade(alpha, 1, b.moves[0], c.base), ...fade(1, 0, step2, c.base)],
        [[0, { opacity: 0 }], ...fade(0, 1, step2, c.base), ...fade(1, 0, step3, c.base)],
        [[0, { opacity: 0 }], ...fade(0, 1, step3, c.base)],
      ];
  windows.forEach((stops, index) => {
    tracks[`win:${index}`] = [stops];
  });
  const captions: Stop[][] = [
    [[0, { opacity: alpha }], ...fade(alpha, 1, b.moves[0], c.base), ...fade(1, alpha, step2, c.base)],
    [[0, { opacity: alpha }], ...fade(alpha, 1, step2, c.base), ...fade(1, alpha, step3, c.base)],
    [[0, { opacity: alpha }], ...fade(alpha, 1, step3, c.base)],
  ];
  captions.forEach((stops, index) => {
    tracks[`cap:${index}`] = [stops];
  });
  if (measure.wide) {
    b.gutters.forEach((start, index) => {
      for (const layer of LIGHT_LAYERS) tracks[`light:g${index}/${layer}`] = [lightStops(start, b.gutterHop, layer, env.light)];
    });
  }
  let start = b.light;
  draftLightPaths().forEach((path, index) => {
    const hop = hopMs(path.length, env.light);
    for (const layer of LIGHT_LAYERS) tracks[`light:m${index}/${layer}`] = [lightStops(start, hop, layer, env.light)];
    start += hop;
  });
  return tracks;
}
