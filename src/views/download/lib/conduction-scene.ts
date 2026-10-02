import { MOTION, STAGGER } from '@/shared/motion';
import { SPRING, springSettleMs, springVisualMs } from '@/shared/motion/spring';

import {
  answeredNeighbours,
  castContains,
  CONDUCTION_ANSWER,
  CONDUCTION_CAST,
  CONDUCTION_PROPOSAL,
  CONDUCTION_QUERY,
  type CastKind,
  type CastRelation,
} from '../model/conduction-cast';

const ms = (seconds: number) => Math.round(seconds * 1000);
const SETTLE = ms(MOTION.settle.duration);
const settles = (count: number) => Math.round(count * SETTLE);

export const CONDUCTION_CLOCK = Object.freeze({
  fast: ms(MOTION.fast.duration),
  base: ms(MOTION.base.duration),
  settle: SETTLE,
  stagger: ms(STAGGER),
  canvas: springSettleMs(SPRING.canvas),
  canvasVisual: springVisualMs(SPRING.canvas),
  surface: springSettleMs(SPRING.surface),
  control: springSettleMs(SPRING.control),
  files: settles(1),
  rise: settles(2),
  relations: settles(6),
  domains: settles(6),
  domainEdges: settles(7.5),
  project: settles(8),
  projectEdges: settles(9.5),
  ask: settles(10.5),
  query: settles(11.5),
  reply: settles(15),
  propose: settles(18.5),
  approve: settles(21.5),
  rest: settles(27.5),
  clear: settles(29.5),
  loop: settles(30.5),
});

export const CONDUCTION_LOOPS = 3;
export const BLOOM_RISE_MS = 60;
const PRESS_SCALE = 0.97;
export const LIGHT_LAYERS = ['halo', 'core', 'tip'] as const;
type LightLayer = (typeof LIGHT_LAYERS)[number];

export function conductionTiming(fromRest: boolean): KeyframeAnimationOptions {
  const rest = CONDUCTION_CLOCK.rest / CONDUCTION_CLOCK.loop;
  return {
    duration: CONDUCTION_CLOCK.loop,
    iterations: fromRest ? CONDUCTION_LOOPS : CONDUCTION_LOOPS - 1 + rest,
    iterationStart: fromRest ? rest : 0,
    fill: 'both',
  };
}

export interface ConductionLight {
  speed: number;
  hopMinMs: number;
  hopMaxMs: number;
  tail: number;
  intensity: number;
  bloomTauMs: number;
  restAlpha: number;
}

type SceneLayout = 'wide' | 'narrow';
export const CONDUCTION_WIDE_MIN = 720;
const CANONICAL_WIDTH: Record<SceneLayout, number> = { wide: 1120, narrow: 358 };

interface ScenePoint {
  x: number;
  y: number;
}

export interface ScenePath {
  key: string;
  from: string;
  to: string;
  d: string;
  length: number;
}

interface SceneMark extends ScenePoint {
  id: string;
  kind: CastKind;
  size: number;
  origin: ScenePoint;
}

interface SceneFile extends ScenePoint {
  owner: string;
}

interface SceneLabel extends ScenePoint {
  id: string;
  align: 'start' | 'center';
  maxWidth: number;
}

export interface SceneGeometry {
  layout: SceneLayout;
  width: number;
  height: number;
  tiers: { kind: CastKind | 'code'; y: number }[];
  tierLabelX: number | null;
  planeX0: number;
  planeX1: number;
  marks: SceneMark[];
  files: SceneFile[];
  links: ScenePath[];
  contains: ScenePath[];
  depends: ScenePath[];
  proposal: ScenePath;
  query: ScenePath;
  reply: ScenePath;
  port: ScenePoint;
  mcpLabel: ScenePoint;
  agent: { x: number; y: number; width: number };
  labels: SceneLabel[];
}

interface LayoutSpec {
  pad: number;
  x0: number;
  x1: number;
  rows: Record<CastKind | 'code', number>;
  size: Record<CastKind, number>;
  groupGap: number;
  height: number;
  agent: { x: number; y: number; width: number };
  tierLabelX: number | null;
}

function wideSpec(width: number): LayoutSpec {
  const pad = 24;
  const tierLabelW = 124;
  const agentWidth = Math.min(340, Math.max(264, Math.round(width * 0.3)));
  const gap = 56;
  const x1 = width - pad - agentWidth - gap;
  const k = Math.min(1.25, Math.max(1, width / 1120));
  const row = (y: number) => Math.round(y * k);
  return {
    pad,
    x0: pad + tierLabelW,
    x1,
    rows: { project: row(44), domain: row(112), capability: row(184), element: row(250), code: row(306) },
    size: { project: 26, domain: 18, capability: 13, element: 10 },
    groupGap: 22,
    height: row(306) + 32,
    agent: { x: x1 + gap, y: row(44) - 14, width: agentWidth },
    tierLabelX: pad,
  };
}

function narrowSpec(width: number): LayoutSpec {
  const pad = 16;
  const lane = 30;
  return {
    pad,
    x0: pad,
    x1: width - pad - lane,
    rows: { project: 30, domain: 92, capability: 178, element: 232, code: 280 },
    size: { project: 22, domain: 15, capability: 11, element: 8 },
    groupGap: 8,
    height: 330,
    agent: { x: pad, y: 330, width: width - pad * 2 },
    tierLabelX: null,
  };
}

function rimY(kind: CastKind, size: number): number {
  if (kind === 'project') return size / 2 - 1.2;
  if (kind === 'domain') return (size - 6.8) / 2;
  if (kind === 'capability') return size / 2 - 1.6;
  return (size - 4.8) / 2;
}

function rimX(kind: CastKind, size: number): number {
  if (kind === 'project') return (size / 2 - 1.2) * Math.cos(Math.PI / 6);
  if (kind === 'domain') return (size - 2) / 2;
  if (kind === 'capability') return size / 2 - 1.6;
  return (size - 4.8) / 2;
}

const round = (value: number) => Math.round(value * 100) / 100;

function cubicPoint(p0: ScenePoint, p1: ScenePoint, p2: ScenePoint, p3: ScenePoint, t: number): ScenePoint {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

function cubicPath(key: string, from: string, to: string, points: [ScenePoint, ScenePoint, ScenePoint, ScenePoint]): ScenePath {
  const [p0, p1, p2, p3] = points;
  let length = 0;
  let prev = p0;
  for (let step = 1; step <= 32; step += 1) {
    const next = cubicPoint(p0, p1, p2, p3, step / 32);
    length += Math.hypot(next.x - prev.x, next.y - prev.y);
    prev = next;
  }
  const d = `M ${round(p0.x)} ${round(p0.y)} C ${round(p1.x)} ${round(p1.y)}, ${round(p2.x)} ${round(p2.y)}, ${round(p3.x)} ${round(p3.y)}`;
  return { key, from, to, d, length: round(length) };
}

function linePath(key: string, from: string, to: string, a: ScenePoint, b: ScenePoint): ScenePath {
  const third = { x: (b.x - a.x) / 3, y: (b.y - a.y) / 3 };
  return cubicPath(key, from, to, [a, { x: a.x + third.x, y: a.y + third.y }, { x: b.x - third.x, y: b.y - third.y }, b]);
}

export const relationKey = (relation: Pick<CastRelation, 'from' | 'to'>) => `${relation.from}>${relation.to}`;

function conductionLayout(available: number): SceneLayout {
  return available >= CONDUCTION_WIDE_MIN ? 'wide' : 'narrow';
}

export function buildConductionGeometry(available: number): SceneGeometry {
  const layout = conductionLayout(available);
  const width = Math.max(available, 300);
  const spec = layout === 'wide' ? wideSpec(width) : narrowSpec(width);
  const { rows, size } = spec;

  const domains = CONDUCTION_CAST.filter((concept) => concept.kind === 'domain');
  const capabilities = CONDUCTION_CAST.filter((concept) => concept.kind === 'capability');
  const elements = CONDUCTION_CAST.filter((concept) => concept.kind === 'element');
  const project = CONDUCTION_CAST.find((concept) => concept.kind === 'project')!;

  const roughStep = (spec.x1 - spec.x0 - spec.groupGap * (domains.length - 1)) / capabilities.length;
  const inner = roughStep * 0.2 + 8;
  const trailing = roughStep * 0.4 + 8;
  const span = spec.x1 - trailing - (spec.x0 + inner) - spec.groupGap * (domains.length - 1);
  const step = span / (capabilities.length - 1);
  const position = new Map<string, ScenePoint>();
  capabilities.forEach((capability, index) => {
    const group = domains.findIndex((domain) => domain.id === capability.parent);
    position.set(capability.id, { x: spec.x0 + inner + index * step + group * spec.groupGap, y: rows.capability });
  });
  for (const domain of domains) {
    const xs = capabilities.filter((capability) => capability.parent === domain.id).map((capability) => position.get(capability.id)!.x);
    position.set(domain.id, { x: xs.reduce((sum, x) => sum + x, 0) / xs.length, y: rows.domain });
  }
  const domainXs = domains.map((domain) => position.get(domain.id)!.x);
  position.set(project.id, { x: domainXs.reduce((sum, x) => sum + x, 0) / domainXs.length, y: rows.project });

  const elementStart = step * 0.1;
  const elementGap = step * 0.27;
  const capabilityFileShift = -step * 0.2;
  const fileX = new Map<string, number>();
  for (const capability of capabilities) {
    const own = elements.filter((element) => element.parent === capability.id);
    const capX = position.get(capability.id)!.x;
    own.forEach((element, index) => {
      const x = capX + elementStart + index * elementGap;
      position.set(element.id, { x, y: rows.element });
      fileX.set(element.id, x);
    });
    fileX.set(capability.id, own.length > 0 ? capX + capabilityFileShift : capX);
  }

  const fileTop = rows.code - 5;
  const marks: SceneMark[] = CONDUCTION_CAST.map((concept) => {
    const at = position.get(concept.id)!;
    const origin =
      concept.kind === 'project'
        ? { x: at.x, y: rows.domain }
        : concept.kind === 'domain'
          ? { x: at.x, y: rows.capability }
          : { x: fileX.get(concept.id)!, y: fileTop };
    return { id: concept.id, kind: concept.kind, x: round(at.x), y: at.y, size: size[concept.kind], origin: { x: round(origin.x), y: origin.y } };
  });
  const markOf = new Map(marks.map((mark) => [mark.id, mark]));

  const files: SceneFile[] = CONDUCTION_CAST.filter((concept) => concept.file !== null)
    .map((concept) => ({ owner: concept.id, x: round(fileX.get(concept.id)!), y: rows.code }))
    .sort((a, b) => a.x - b.x);

  const links = files.map((file) => {
    const mark = markOf.get(file.owner)!;
    return linePath(`link:${file.owner}`, file.owner, file.owner, { x: file.x, y: fileTop }, { x: mark.x, y: mark.y + rimY(mark.kind, mark.size) });
  });

  const contains = castContains().map((relation) => {
    const parent = markOf.get(relation.from)!;
    const child = markOf.get(relation.to)!;
    const a = { x: parent.x, y: parent.y + rimY(parent.kind, parent.size) };
    const b = { x: child.x, y: child.y - rimY(child.kind, child.size) };
    const mid = (a.y + b.y) / 2;
    return cubicPath(relationKey(relation), relation.from, relation.to, [a, { x: a.x, y: mid }, { x: b.x, y: mid }, b]);
  });

  const arcRelations = [...CONDUCTION_ANSWER.filter((relation) => relation.relation === 'depends'), CONDUCTION_PROPOSAL];
  const widest = Math.max(...arcRelations.map((relation) => Math.abs(markOf.get(relation.to)!.x - markOf.get(relation.from)!.x)));
  const deepest = rows.element - rows.capability - size.element - 4;
  const towardRim = (mark: SceneMark, toward: ScenePoint): ScenePoint => {
    const dx = toward.x - mark.x;
    const dy = toward.y - mark.y;
    const distance = Math.hypot(dx, dy) || 1;
    const rim = rimY(mark.kind, mark.size) + 1;
    return { x: mark.x + (dx / distance) * rim, y: mark.y + (dy / distance) * rim };
  };
  const arc = (relation: CastRelation): ScenePath => {
    const from = markOf.get(relation.from)!;
    const to = markOf.get(relation.to)!;
    const dx = to.x - from.x;
    const bow = Math.max(10, deepest * (Math.abs(dx) / widest)) / 0.75;
    const c1 = { x: from.x + dx * 0.2, y: from.y + bow };
    const c2 = { x: to.x - dx * 0.2, y: to.y + bow };
    return cubicPath(relationKey(relation), relation.from, relation.to, [towardRim(from, c1), c1, c2, towardRim(to, c2)]);
  };
  const depends = CONDUCTION_ANSWER.filter((relation) => relation.relation === 'depends').map(arc);
  const proposal = arc(CONDUCTION_PROPOSAL);

  const focus = markOf.get(CONDUCTION_QUERY.concept)!;
  const end = { x: focus.x + rimX(focus.kind, focus.size) + 2, y: focus.y };
  const port =
    layout === 'wide'
      ? { x: spec.agent.x - 10, y: spec.agent.y + 8 }
      : { x: spec.agent.x + spec.agent.width - 6, y: spec.agent.y - 8 };
  const controls: [ScenePoint, ScenePoint] =
    layout === 'wide'
      ? [
          { x: port.x - (port.x - end.x) * 0.55, y: port.y },
          { x: end.x + (port.x - end.x) * 0.45, y: end.y },
        ]
      : [
          { x: port.x, y: end.y + (port.y - end.y) * 0.4 },
          { x: end.x + (port.x - end.x) * 0.9, y: end.y },
        ];
  const query = cubicPath('query', 'agent', focus.id, [port, controls[0], controls[1], end]);
  const reply = cubicPath('reply', focus.id, 'agent', [end, controls[1], controls[0], port]);
  const mcpLabel =
    layout === 'wide'
      ? { x: round((port.x + end.x) / 2 + 6), y: round(port.y + (end.y - port.y) * 0.18) }
      : { x: round(port.x - 8), y: round(end.y + (port.y - end.y) * 0.62) };

  const labels: SceneLabel[] = [
    { id: project.id, x: round(position.get(project.id)!.x + size.project / 2 + 8), y: rows.project, align: 'start', maxWidth: 200 },
    ...domains.map((domain, index): SceneLabel => {
      const at = position.get(domain.id)!;
      if (layout === 'narrow') {
        return { id: domain.id, x: round(at.x), y: rows.domain + 8, align: 'center', maxWidth: round(step * 2.4 + spec.groupGap) };
      }
      const x = at.x + size.domain / 2 + 6;
      const next = domains[index + 1];
      const limit = next ? position.get(next.id)!.x - size.domain / 2 - 10 : spec.x1 + 24;
      return { id: domain.id, x: round(x), y: rows.domain, align: 'start', maxWidth: round(limit - x) };
    }),
  ];

  const tiers: SceneGeometry['tiers'] = [
    { kind: 'project', y: rows.project },
    { kind: 'domain', y: rows.domain },
    { kind: 'capability', y: rows.capability },
    { kind: 'element', y: rows.element },
    { kind: 'code', y: rows.code },
  ];

  return {
    layout,
    width,
    height: spec.height,
    tiers,
    tierLabelX: spec.tierLabelX,
    planeX0: spec.x0,
    planeX1: spec.x1,
    marks,
    files,
    links,
    contains,
    depends,
    proposal,
    query,
    reply,
    port,
    mcpLabel,
    agent: spec.agent,
    labels,
  };
}

interface ConductionSets {
  answer: Set<string>;
  held: Set<string>;
}

export function conductionSets(): ConductionSets {
  const answer = new Set<string>([CONDUCTION_QUERY.concept, ...answeredNeighbours()]);
  for (const relation of CONDUCTION_ANSWER) {
    answer.add(relation.from);
    answer.add(relation.to);
    answer.add(relationKey(relation));
  }
  for (const id of [...answer]) answer.add(`link:${id}`);
  const held = new Set<string>([CONDUCTION_PROPOSAL.to, `link:${CONDUCTION_PROPOSAL.to}`]);
  return { answer, held };
}

function hopMs(length: number, light: ConductionLight): number {
  return Math.round(Math.min(light.hopMaxMs, Math.max(light.hopMinMs, (length / light.speed) * 1000)));
}

interface ConductionSchedule {
  fileAt: Map<string, number>;
  riseAt: Map<string, number>;
  queryHop: number;
  arrive: number;
  ego: { key: string; start: number; hop: number; bloomAt: string }[];
  replyHop: number;
  replyArrive: number;
  writeStart: number;
  writeHop: number;
}

export function conductionSchedule(light: ConductionLight, layout: SceneLayout): ConductionSchedule {
  const geometry = buildConductionGeometry(CANONICAL_WIDTH[layout]);
  const c = CONDUCTION_CLOCK;
  const fileAt = new Map<string, number>();
  const riseAt = new Map<string, number>();
  geometry.files.forEach((file, index) => {
    fileAt.set(file.owner, c.files + index * c.stagger);
    riseAt.set(file.owner, c.rise + index * c.stagger);
  });
  for (const mark of geometry.marks) {
    if (mark.kind === 'domain') riseAt.set(mark.id, c.domains);
    if (mark.kind === 'project') riseAt.set(mark.id, c.project);
  }
  const queryHop = hopMs(geometry.query.length, light);
  const arrive = c.query + queryHop;
  const pathOf = new Map([...geometry.contains, ...geometry.depends].map((path) => [path.key, path]));
  const ego = CONDUCTION_ANSWER.map((relation) => {
    const key = relationKey(relation);
    return { key, start: arrive, hop: hopMs(pathOf.get(key)!.length, light), bloomAt: relation.to };
  });
  const replyHop = hopMs(geometry.reply.length, light);
  const writeStart = c.approve + c.fast;
  return {
    fileAt,
    riseAt,
    queryHop,
    arrive,
    ego,
    replyHop,
    replyArrive: c.reply + replyHop,
    writeStart,
    writeHop: hopMs(geometry.proposal.length, light),
  };
}

export interface ConductionEasing {
  ease: string;
  exit: string;
  canvas: string;
  surface: string;
  control: string;
}

type FrameValue = Record<string, string | number>;
type Stop = readonly [at: number, value: FrameValue, easing?: string];

const RISE_REST = 'translate(0px, 0px)';
const PRESS_REST = 'scale(1)';
const SURFACE_RISE = 'translate(0px, 6px)';

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

function lightDash(layer: LightLayer, tail: number): number {
  if (layer === 'halo') return round(tail * 0.6);
  if (layer === 'core') return tail;
  return round(tail * 0.4);
}

function lightAlpha(layer: LightLayer, intensity: number): number {
  if (layer === 'halo') return round(intensity * 0.32);
  return round(intensity * 0.55);
}

export function conductionTracks(
  geometry: SceneGeometry,
  easing: ConductionEasing,
  light: ConductionLight,
): Record<string, Keyframe[][]> {
  const c = CONDUCTION_CLOCK;
  const s = conductionSchedule(light, geometry.layout);
  const { ease, exit, canvas, surface, control } = easing;
  const entries: [string, Keyframe[][]][] = [];
  const on = (key: string, ...lanes: ReadonlyArray<readonly Stop[]>) => {
    entries.push([key, lanes.map((stops) => track(c.loop, stops))]);
  };
  const leave: Stop[] = [
    [c.clear, { opacity: 1 }, exit],
    [c.clear + c.fast, { opacity: 0 }],
  ];
  const appear = (at: number): Stop[] => [[0, { opacity: 0 }], [at, { opacity: 0 }, ease], [at + c.base, { opacity: 1 }], ...leave];
  const draw = (at: number, duration: number, curve: string): Stop[] => [
    [0, { strokeDashoffset: '1' }],
    [at, { strokeDashoffset: '1' }, curve],
    [at + duration, { strokeDashoffset: '0' }],
  ];
  const fromOrigin = (at: number, dx: number, dy: number): Stop[] => [
    [0, { transform: `translate(${round(dx)}px, ${round(dy)}px)` }],
    [at, { transform: `translate(${round(dx)}px, ${round(dy)}px)` }, canvas],
    [at + c.canvas, { transform: RISE_REST }],
  ];
  const surfaceRise = (at: number): Stop[] => [
    [0, { transform: SURFACE_RISE }],
    [at, { transform: SURFACE_RISE }, surface],
    [at + c.surface, { transform: RISE_REST }],
  ];
  const travel = (start: number, hop: number, layer: LightLayer): Stop[] => {
    const dash = lightDash(layer, light.tail);
    const alpha = lightAlpha(layer, light.intensity);
    const end = start + Math.round(hop * (1 + dash));
    const dasharray = `${dash} 3`;
    return [
      [0, { strokeDasharray: dasharray, strokeDashoffset: String(dash), opacity: 0 }],
      [start, { strokeDashoffset: String(dash), opacity: 0 }],
      [start, { opacity: alpha }, 'linear'],
      [end, { strokeDashoffset: '-1', opacity: alpha }],
      [end, { opacity: 0 }],
    ];
  };
  const lightTrack = (key: string, start: number, hop: number) => {
    for (const layer of LIGHT_LAYERS) on(`${key}/${layer}`, travel(start, hop, layer));
  };
  const bloom = (key: string, arrival: number) =>
    on(key, [
      [0, { opacity: 0 }],
      [arrival, { opacity: 0 }, 'linear'],
      [arrival + BLOOM_RISE_MS, { opacity: light.intensity }, 'linear'],
      [arrival + BLOOM_RISE_MS + light.bloomTauMs, { opacity: round(light.intensity * Math.exp(-1)) }, 'linear'],
      [arrival + BLOOM_RISE_MS + light.bloomTauMs * 2, { opacity: round(light.intensity * Math.exp(-2)) }, 'linear'],
      [arrival + BLOOM_RISE_MS + light.bloomTauMs * 3, { opacity: 0 }],
    ]);

  on('plane', appear(0));

  for (const file of geometry.files) {
    on(`file:${file.owner}`, appear(s.fileAt.get(file.owner)!));
    on(`link:${file.owner}`, [...draw(s.riseAt.get(file.owner)!, c.canvas, canvas).map(([at, value, curve]): Stop => [at, { ...value, opacity: 1 }, curve]), ...leave]);
  }

  for (const mark of geometry.marks) {
    const at = s.riseAt.get(mark.id)!;
    on(`rise:${mark.id}`, fromOrigin(at, mark.origin.x - mark.x, mark.origin.y - mark.y), appear(at));
  }

  const domainLabelAt = c.domains + c.canvasVisual;
  const projectLabelAt = c.project + c.canvasVisual;
  for (const label of geometry.labels) {
    on(`label:${label.id}`, appear(label.id.startsWith('project:') ? projectLabelAt : domainLabelAt));
  }

  for (const path of geometry.contains) {
    const fromKind = path.from.slice(0, path.from.indexOf(':'));
    const at = fromKind === 'project' ? c.projectEdges : fromKind === 'domain' ? c.domainEdges : c.relations;
    on(`edge:${path.key}`, [...draw(at, c.base, ease).map(([t, value, curve]): Stop => [t, { ...value, opacity: 1 }, curve]), ...leave]);
  }
  for (const path of geometry.depends) {
    on(`edge:${path.key}`, [...draw(c.relations, c.base, ease).map(([t, value, curve]): Stop => [t, { ...value, opacity: 1 }, curve]), ...leave]);
  }

  const dimmed: Stop[] = [
    [0, { opacity: 1 }],
    [s.arrive, { opacity: 1 }, ease],
    [s.arrive + c.base, { opacity: light.restAlpha }],
  ];
  const held: Stop[] = [
    ...dimmed,
    [c.propose, { opacity: light.restAlpha }, ease],
    [c.propose + c.base, { opacity: 1 }],
  ];
  for (const layer of ['edges', 'files', 'marks', 'labels'] as const) {
    on(`dim:${layer}`, dimmed);
    on(`held:${layer}`, held);
  }

  on('ask', appear(c.ask), surfaceRise(c.ask));
  on('query-line', [...draw(c.query, s.queryHop, 'linear').map(([t, value, curve]): Stop => [t, { ...value, opacity: 1 }, curve]), ...leave]);
  on('mcp-label', appear(c.query));
  lightTrack('light:query', c.query, s.queryHop);
  bloom('bloom:query', s.arrive);
  on('ring', appear(s.arrive));
  on('focus-label', appear(s.arrive));

  s.ego.forEach((hop, index) => {
    lightTrack(`light:ego:${index}`, hop.start, hop.hop);
    bloom(`bloom:ego:${index}`, hop.start + hop.hop);
    on(`lit:${index}`, appear(hop.start + hop.hop));
  });

  lightTrack('light:reply', c.reply, s.replyHop);
  const answerCount = answeredNeighbours().length + 1;
  for (let index = 0; index < answerCount; index += 1) {
    const at = s.replyArrive + index * c.stagger;
    on(`answer:${index}`, appear(at), surfaceRise(at));
  }

  on('proposal', appear(c.propose), surfaceRise(c.propose));
  on('proposal-reveal', draw(c.propose, c.settle, ease));
  on('proposal-label', appear(c.propose));
  on('proposal-pending', [[0, { opacity: 1 }], [s.writeStart, { opacity: 1 }, ease], [s.writeStart + c.fast, { opacity: 0 }]]);
  on('proposal-written', [[0, { opacity: 0 }], [s.writeStart, { opacity: 0 }, ease], [s.writeStart + c.fast, { opacity: 1 }], ...leave]);
  on('press', [
    [0, { transform: PRESS_REST }],
    [c.approve, { transform: PRESS_REST }, ease],
    [c.approve + c.fast, { transform: `scale(${PRESS_SCALE})` }, control],
    [c.approve + c.fast + c.control, { transform: PRESS_REST }],
  ]);
  on('allowed', [[0, { opacity: 0 }], [c.approve + c.fast, { opacity: 0 }, ease], [c.approve + c.fast * 2, { opacity: 1 }], ...leave]);
  on('check', draw(c.approve + c.fast, c.settle, ease));
  lightTrack('light:write', s.writeStart, s.writeHop);
  bloom('bloom:write', s.writeStart + s.writeHop);

  return Object.fromEntries(entries);
}

type StillValue = Record<string, string | number>;

export function conductionStill(part: string, restAlpha: number | string): StillValue {
  if (part.startsWith('light:')) return { opacity: 0, strokeDashoffset: '-1' };
  if (part.startsWith('bloom:') || part === 'proposal-pending') return { opacity: 0 };
  if (part.startsWith('dim:')) return { opacity: restAlpha };
  if (part.startsWith('held:')) return { opacity: 1 };
  if (part.startsWith('rise:') || part === 'ask' || part === 'proposal' || part.startsWith('answer:')) {
    return { opacity: 1, transform: RISE_REST };
  }
  if (part === 'press') return { transform: PRESS_REST };
  if (part === 'proposal-reveal' || part === 'check') return { strokeDashoffset: '0' };
  if (part.startsWith('link:') || part.startsWith('edge:') || part === 'query-line') return { opacity: 1, strokeDashoffset: '0' };
  return { opacity: 1 };
}
