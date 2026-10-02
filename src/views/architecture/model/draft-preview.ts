import { MOTION, STAGGER } from '@/shared/motion';
import { SPRING, springSettleMs } from '@/shared/motion/spring';

export const DRAFT_PREVIEW_ROLES = ['routing', 'views', 'widgets', 'features', 'entities', 'shared'] as const;
type DraftPreviewRole = (typeof DRAFT_PREVIEW_ROLES)[number];

export const DRAFT_PREVIEW_VIOLATION = { from: 'shared', to: 'features' } as const satisfies {
  from: DraftPreviewRole;
  to: DraftPreviewRole;
};

export const DRAFT_PREVIEW_FILE = 'architecture/web.md';

export interface DraftPreviewSource {
  name: string;
  folders: readonly string[];
}

export const EXAMPLE_SOURCE: DraftPreviewSource = Object.freeze({
  name: 'my-app',
  folders: Object.freeze(['app', 'docs', 'public', 'scripts', 'src', 'tests']),
});

const FOLDER_ROW_CAP = 7;

export function foldFolderRows(
  folders: readonly string[],
  cap = FOLDER_ROW_CAP,
): { shown: string[]; hidden: number } {
  if (folders.length <= cap) return { shown: [...folders], hidden: 0 };
  return { shown: folders.slice(0, cap - 1), hidden: folders.length - (cap - 1) };
}

const HEAD_H = 20;
const ROW_PITCH = 24;
const BRANCH = 12;
const TRUNK_X = 124;
const LABEL_GAP = 4;
const CORNER = 10;
const FACE_TOP = HEAD_H + 12;
const FACE_H = 26;
const FACE_GAP = 14;
const FACE_PITCH = FACE_H + FACE_GAP;
const FACE_W_MIN = 160;
const FACE_W_MAX = 248;
const FACE_SHARE_OF_SPARE = 0.45;
const LINK_MIN = 72;
const LINK_MAX = 136;
const PLANE_STEP = 6;
const PLANE_EDGE = 12;
const PLANE_INSET_Y = 3;
const PLANE_LEAN = Math.round((PLANE_STEP * (FACE_H + PLANE_INSET_Y * 2)) / FACE_PITCH);
const ARC_BULGE = 26;
const ARC_PAD = 3;
const SENTENCE_GAP = 10;
export const SENTENCE_W = 160;
const CHIP_GAP = 18;
const CHIP_H = 26;
const ROOMY_RIGHT = ARC_PAD + ARC_BULGE + SENTENCE_GAP + SENTENCE_W;
const COMPACT_RIGHT = Math.max(PLANE_EDGE + PLANE_LEAN, ARC_PAD + ARC_BULGE + LABEL_GAP);

const ROOMY_SCENE_MIN = TRUNK_X + LINK_MIN + FACE_W_MIN + ROOMY_RIGHT;

interface DraftPreviewGeometry {
  width: number;
  height: number;
  sentence: boolean;
  labelRight: number;
  rootY: number;
  rows: Array<{ y: number }>;
  branches: string[];
  trunk: string;
  lightPath: string;
  lightLength: number;
  rowStops: number[];
  linkPort: { x: number; y: number };
  faceX: number;
  faceW: number;
  faceH: number;
  faces: Array<{ role: DraftPreviewRole; y: number }>;
  planes: Array<{ role: DraftPreviewRole; d: string; edge: { x1: number; x2: number; y: number } }>;
  arrows: Array<{ from: DraftPreviewRole; to: DraftPreviewRole; x: number; y1: number; y2: number; head: string }>;
  violation: { d: string; head: string; sentence: { x: number; y: number } };
  chip: { x: number; y: number; h: number };
}

export function buildDraftPreviewGeometry(available: number, rowCount: number): DraftPreviewGeometry {
  const sentence = available >= ROOMY_SCENE_MIN;
  const right = sentence ? ROOMY_RIGHT : COMPACT_RIGHT;
  const spare = Math.max(0, available - (TRUNK_X + LINK_MIN + FACE_W_MIN + right));
  const faceW = FACE_W_MIN + Math.min(FACE_W_MAX - FACE_W_MIN, Math.round(spare * FACE_SHARE_OF_SPARE));
  const link = LINK_MIN + Math.min(LINK_MAX - LINK_MIN, spare - (faceW - FACE_W_MIN));
  const faceX = TRUNK_X + link;
  const width = faceX + faceW + right;

  const faces = DRAFT_PREVIEW_ROLES.map((role, index) => ({ role, y: FACE_TOP + index * FACE_PITCH }));
  const centreOf = (role: DraftPreviewRole) => FACE_TOP + DRAFT_PREVIEW_ROLES.indexOf(role) * FACE_PITCH + FACE_H / 2;
  const foundation = faces[faces.length - 1]!;
  const foundationY = foundation.y + FACE_H / 2;

  const rootY = HEAD_H / 2;
  const rows = Array.from({ length: rowCount }, (_, index) => ({ y: rootY + (index + 1) * ROW_PITCH }));
  const branchStart = TRUNK_X - BRANCH;
  const branches = rows.map((row) => `M ${branchStart} ${row.y} H ${TRUNK_X}`);
  const turnY = Math.max(foundationY, (rows[rows.length - 1]?.y ?? rootY) + CORNER);
  const trunk = `M ${TRUNK_X} ${rootY + CORNER} V ${turnY - CORNER}`;

  const rootRun = TRUNK_X - CORNER - branchStart;
  const quarter = (Math.PI * CORNER) / 2;
  const fall = turnY - CORNER - (rootY + CORNER);
  const run = faceX - (TRUNK_X + CORNER);
  const lightPath = [
    `M ${branchStart} ${rootY}`,
    `H ${TRUNK_X - CORNER}`,
    `Q ${TRUNK_X} ${rootY} ${TRUNK_X} ${rootY + CORNER}`,
    `V ${turnY - CORNER}`,
    `Q ${TRUNK_X} ${turnY} ${TRUNK_X + CORNER} ${turnY}`,
    `H ${faceX}`,
  ].join(' ');
  const lightLength = rootRun + quarter + fall + quarter + run;
  const rowStops = rows.map((row) => (rootRun + quarter + (row.y - (rootY + CORNER))) / lightLength);

  const planes = faces.map((face, index) => {
    const top = face.y - PLANE_INSET_Y;
    const bottom = face.y + FACE_H + PLANE_INSET_Y;
    const left = faceX - PLANE_EDGE - index * PLANE_STEP;
    const planeRight = faceX + faceW + PLANE_EDGE;
    return {
      role: face.role,
      d: `M ${left} ${bottom} H ${planeRight} L ${planeRight + PLANE_LEAN} ${top} H ${left + PLANE_LEAN} Z`,
      edge: { x1: left + PLANE_LEAN, x2: planeRight + PLANE_LEAN, y: top },
    };
  });

  const spineX = faceX + faceW / 2;
  const arrows = faces.slice(0, -1).map((face, index) => {
    const below = faces[index + 1]!;
    const y1 = face.y + FACE_H;
    const y2 = below.y - 1;
    return {
      from: face.role,
      to: below.role,
      x: spineX,
      y1,
      y2,
      head: `M ${spineX - 3} ${y2 - 4} L ${spineX} ${y2} L ${spineX + 3} ${y2 - 4}`,
    };
  });

  const arcX = faceX + faceW + ARC_PAD;
  const fromY = centreOf(DRAFT_PREVIEW_VIOLATION.from);
  const toY = centreOf(DRAFT_PREVIEW_VIOLATION.to);
  const violation = {
    d: `M ${arcX} ${fromY} C ${arcX + ARC_BULGE} ${fromY} ${arcX + ARC_BULGE} ${toY} ${arcX} ${toY}`,
    head: `M ${arcX + 5} ${toY - 3.5} L ${arcX + 1} ${toY} L ${arcX + 5} ${toY + 3.5}`,
    sentence: { x: arcX + ARC_BULGE + SENTENCE_GAP, y: (fromY + toY) / 2 },
  };

  const chip = { x: faceX, y: foundation.y + FACE_H + CHIP_GAP, h: CHIP_H };
  return {
    width,
    height: chip.y + CHIP_H,
    sentence,
    labelRight: branchStart - LABEL_GAP,
    rootY,
    rows,
    branches,
    trunk,
    lightPath,
    lightLength,
    rowStops,
    linkPort: { x: faceX, y: turnY },
    faceX,
    faceW,
    faceH: FACE_H,
    faces,
    planes,
    arrows,
    violation,
    chip,
  };
}

const ms = (seconds: number) => Math.round(seconds * 1000);
const SETTLE = ms(MOTION.settle.duration);

export const DRAFT_PREVIEW_CLOCK = Object.freeze({
  fast: ms(MOTION.fast.duration),
  base: ms(MOTION.base.duration),
  settle: SETTLE,
  stagger: ms(STAGGER),
  spring: springSettleMs(SPRING.surface),
  light: SETTLE * 2,
  lightRead: SETTLE * 4,
  lightTravel: SETTLE * 6,
  build: SETTLE * 8,
  rules: SETTLE * 13,
  catch: SETTLE * 16,
  catchDraw: SETTLE * 2,
  save: SETTLE * 19,
  rest: SETTLE * 25,
  clear: SETTLE * 30,
  loop: SETTLE * 32,
});

const DRAFT_PREVIEW_LOOPS = 3;

export function draftPreviewIterations(loops = DRAFT_PREVIEW_LOOPS): number {
  return loops - 1 + DRAFT_PREVIEW_CLOCK.rest / DRAFT_PREVIEW_CLOCK.loop;
}

interface DraftPreviewEasing {
  ease: string;
  exit: string;
  spring: string;
}

interface DraftPreviewLight {
  haloRest: number;
  haloRaised: number;
  intensity: number;
  bloomTauMs: number;
}

type FrameValue = Record<string, string | number>;
type Stop = readonly [at: number, value: FrameValue, easing?: string];

export const LIGHT_DASH = 0.07;
const UNREAD_ROW_OPACITY = 0.45;
const RISE = 'translateY(6px)';
const RESTED = 'translateY(0px)';

function track(loop: number, stops: readonly Stop[]): Keyframe[] {
  const keys = [...new Set(stops.flatMap(([, value]) => Object.keys(value)))];
  const held: FrameValue = {};
  for (const key of keys) {
    const first = stops.find(([, value]) => key in value);
    if (first) held[key] = first[1][key]!;
  }
  const frames: Keyframe[] = [];
  const place = (at: number, value: FrameValue, easing?: string) => {
    Object.assign(held, value);
    frames.push({ ...held, offset: at / loop, ...(easing ? { easing } : {}) });
  };
  if (stops[0]![0] > 0) place(0, {});
  for (const [at, value, easing] of stops) place(at, value, easing);
  if (stops[stops.length - 1]![0] < loop) place(loop, {});
  return frames;
}

export function draftPreviewTracks(
  geometry: DraftPreviewGeometry,
  easing: DraftPreviewEasing,
  light: DraftPreviewLight,
): Record<string, Keyframe[][]> {
  const c = DRAFT_PREVIEW_CLOCK;
  const { ease, exit, spring } = easing;
  const on = (key: string, ...lanes: ReadonlyArray<readonly Stop[]>) =>
    [key, lanes.map((stops) => track(c.loop, stops))] as const;
  const leave: Stop[] = [
    [c.clear, { opacity: 1 }, exit],
    [c.clear + c.fast, { opacity: 0 }],
  ];
  const appear = (at: number): Stop[] => [[0, { opacity: 0 }], [at, { opacity: 0 }, ease], [at + c.base, { opacity: 1 }], ...leave];
  const rise = (at: number): Stop[] => [
    [0, { transform: RISE }],
    [at, { transform: RISE }, spring],
    [at + c.spring, { transform: RESTED }],
  ];
  const draw = (at: number, duration: number): Stop[] => [
    [0, { strokeDashoffset: '1' }],
    [at, { strokeDashoffset: '1' }, ease],
    [at + duration, { strokeDashoffset: '0' }],
  ];
  const arrival = c.light + c.lightTravel;
  const readTo = (geometry.rowStops[geometry.rowStops.length - 1] ?? 0) + LIGHT_DASH;
  const litAt = (index: number) =>
    c.light + ((geometry.rowStops[index]! + LIGHT_DASH / 2) / (readTo + LIGHT_DASH)) * c.lightRead;
  const buildAt = (index: number) => c.build + (geometry.faces.length - 1 - index) * c.fast;
  const ruleAt = (index: number) => c.rules + index * c.fast;
  const caught = c.catch + c.catchDraw;

  return Object.fromEntries([
    on('folders', appear(0)),
    ...geometry.rows.flatMap((_, index) => {
      const enter = c.stagger * (index + 1);
      const lit = litAt(index);
      return [
        on(`row:${index}`, [
          [0, { opacity: 0 }],
          [enter, { opacity: 0 }, ease],
          [enter + c.base, { opacity: UNREAD_ROW_OPACITY }],
          [lit - c.fast / 2, { opacity: UNREAD_ROW_OPACITY }, ease],
          [lit + c.fast / 2, { opacity: 1 }],
          ...leave,
        ]),
        on(`branch:${index}`, [
          [0, { opacity: 0 }],
          [lit - c.fast / 2, { opacity: 0 }, ease],
          [lit + c.fast / 2, { opacity: 1 }, ease],
          [lit + c.fast / 2 + c.settle, { opacity: 0 }],
        ]),
      ];
    }),
    on('light', [
      [0, { strokeDashoffset: String(LIGHT_DASH), opacity: 0 }],
      [c.light, { opacity: 0 }],
      [c.light, { opacity: light.intensity }, 'linear'],
      [c.light + c.lightRead, { strokeDashoffset: String(-readTo) }, 'linear'],
      [arrival, { strokeDashoffset: '-1', opacity: light.intensity }],
      [arrival, { opacity: 0 }],
    ]),
    on('bloom', [
      [0, { opacity: 0 }],
      [arrival, { opacity: 0 }, ease],
      [arrival + c.fast / 2, { opacity: light.intensity }, ease],
      [arrival + c.fast / 2 + light.bloomTauMs * 3, { opacity: 0 }],
    ]),
    ...geometry.faces.flatMap((face, index) => [
      on(`plane:${face.role}`, appear(buildAt(index))),
      on(`face:${face.role}`, appear(buildAt(index)), rise(buildAt(index))),
    ]),
    ...geometry.arrows.flatMap((_, index) => [
      on(`arrow:${index}`, [...draw(ruleAt(index), c.base).map(([at, value, curve]): Stop => [at, { ...value, opacity: 1 }, curve]), ...leave]),
      on(`port:${index}`, appear(ruleAt(index))),
      on(`head:${index}`, appear(ruleAt(index) + c.base - c.fast)),
    ]),
    on('violation', [[0, { opacity: 1 }], ...leave]),
    on('violation-reveal', draw(c.catch, c.catchDraw)),
    on('violation-halo', [
      [0, { opacity: light.haloRaised }],
      [caught, { opacity: light.haloRaised }, ease],
      [caught + c.settle, { opacity: light.haloRest }],
    ]),
    on('violation-mark', appear(caught)),
    on('chip', appear(c.save), rise(c.save)),
    on('check', draw(c.save + c.fast, c.settle)),
  ]);
}
