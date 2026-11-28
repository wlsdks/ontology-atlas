import { motion } from 'framer-motion';

import { MOTION } from '@/shared/motion';
import { FeatureStagePulse, type FeatureStageMotion } from '@/shared/ui';
import { OntologyMapKindGlyph } from '@/shared/ui/ontology-node/map-kind-glyph';

const VIEW = { width: 320, height: 200 };
const PROJECT = { x: 160, y: 100, size: 34 };
const DOMAIN_SIZE = 22;
const CAPABILITY_SIZE = 11;

const DOMAINS = [
  { x: 72, y: 50, capabilities: [{ x: 22, y: 26 }, { x: 34, y: 90 }] },
  { x: 250, y: 44, capabilities: [{ x: 300, y: 20 }, { x: 296, y: 78 }] },
  { x: 258, y: 152, capabilities: [{ x: 302, y: 182 }, { x: 214, y: 188 }] },
  { x: 64, y: 156, capabilities: [{ x: 18, y: 184 }, { x: 112, y: 190 }] },
] as const;

const RIM_GAP = 3;
const ARC_BOW = 0.12;

const BEAT = MOTION.slow.duration;
const LINE_GAP = MOTION.choreography.duration / 8;
const DOMAIN_LINE_START = BEAT;
const CAPABILITY_LINE_START = DOMAIN_LINE_START + BEAT * 1.5;
const PULSE_START = CAPABILITY_LINE_START + BEAT * 2;
export const CONSTELLATION_ARRIVAL_MS =
  (PULSE_START + LINE_GAP * (DOMAINS.length - 1) + MOTION.choreography.duration) * 1000;

interface Point { x: number; y: number }

function arc(from: Point, fromRadius: number, to: Point, toRadius: number): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  const start = { x: from.x + ux * (fromRadius + RIM_GAP), y: from.y + uy * (fromRadius + RIM_GAP) };
  const end = { x: to.x - ux * (toRadius + RIM_GAP), y: to.y - uy * (toRadius + RIM_GAP) };
  const bow = length * ARC_BOW;
  const control = { x: (start.x + end.x) / 2 - uy * bow, y: (start.y + end.y) / 2 + ux * bow };
  const f = (n: number) => n.toFixed(1);
  return `M${f(start.x)} ${f(start.y)}Q${f(control.x)} ${f(control.y)} ${f(end.x)} ${f(end.y)}`;
}

const PROJECT_ARCS = DOMAINS.map(domain => arc(PROJECT, PROJECT.size / 2, domain, DOMAIN_SIZE / 2));
const CAPABILITY_ARCS = DOMAINS.map(domain =>
  domain.capabilities.map(capability => arc(domain, DOMAIN_SIZE / 2, capability, CAPABILITY_SIZE / 2)),
);

/**
 * What the map becomes once the folder holds concepts: a project in the middle, its domains around
 * it and their capabilities at the rim, joined by arcs that draw in, then one light along each arc.
 * The glyphs are the map's own kind marks; reduced motion draws the finished constellation.
 */
export function MapConstellationArtwork({ arriving, engaged, reduced }: FeatureStageMotion) {
  const enter = (delay: number) => (reduced ? MOTION.fast : { ...MOTION.expressive, delay });
  return (
    <div data-map-constellation-artwork className="relative w-full" style={{ aspectRatio: `${VIEW.width} / ${VIEW.height}` }}>
      <svg viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} className="absolute inset-0 h-full w-full" fill="none">
        <motion.g
          initial={false}
          animate={{ opacity: engaged ? 1 : 0.72 }}
          transition={reduced ? MOTION.fast : arriving ? MOTION.choreography : MOTION.slow}
        >
          {CAPABILITY_ARCS.flatMap((arcs, domainIndex) =>
            arcs.map((d, index) => (
              <motion.path
                key={d}
                d={d}
                stroke="var(--color-indigo-line-a20)"
                strokeWidth="1.25"
                initial={reduced ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={enter(CAPABILITY_LINE_START + LINE_GAP * (domainIndex + index / 2))}
              />
            )),
          )}
          {PROJECT_ARCS.map((d, index) => (
            <motion.path
              key={d}
              d={d}
              stroke="var(--color-indigo-line-a54)"
              strokeWidth="1.5"
              initial={reduced ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={enter(DOMAIN_LINE_START + LINE_GAP * index)}
            />
          ))}
        </motion.g>
        {PROJECT_ARCS.map((d, index) => (
          <FeatureStagePulse key={d} d={d} delay={PULSE_START + LINE_GAP * index} engaged={false} reduced={reduced} />
        ))}
      </svg>
      <Mark point={PROJECT} kind="project" size={PROJECT.size} delay={0} arriving={arriving} reduced={reduced} />
      {DOMAINS.map((domain, domainIndex) => (
        <div key={`${domain.x}-${domain.y}`}>
          <Mark
            point={domain}
            kind="domain"
            size={DOMAIN_SIZE}
            delay={DOMAIN_LINE_START + LINE_GAP * domainIndex + BEAT}
            arriving={arriving}
            reduced={reduced}
          />
          {domain.capabilities.map((capability, index) => (
            <Mark
              key={`${capability.x}-${capability.y}`}
              point={capability}
              kind="capability"
              size={CAPABILITY_SIZE}
              faint={!engaged}
              delay={CAPABILITY_LINE_START + LINE_GAP * (domainIndex + index / 2) + BEAT}
              arriving={arriving}
              reduced={reduced}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function Mark({ point, kind, size, delay, arriving, reduced, faint = false }: {
  point: Point;
  kind: 'project' | 'domain' | 'capability';
  size: number;
  delay: number;
  arriving: boolean;
  reduced: boolean;
  faint?: boolean;
}) {
  return (
    <div
      data-constellation-mark={kind}
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${(point.x / VIEW.width) * 100}%`, top: `${(point.y / VIEW.height) * 100}%` }}
    >
      <motion.div
        initial={reduced ? false : { opacity: 0, scale: 0.4 }}
        animate={{ opacity: faint ? 0.56 : 1, scale: 1 }}
        transition={reduced ? MOTION.fast : arriving ? { ...MOTION.expressive, delay } : MOTION.slow}
      >
        <OntologyMapKindGlyph kind={kind} size={size} />
      </motion.div>
    </div>
  );
}
