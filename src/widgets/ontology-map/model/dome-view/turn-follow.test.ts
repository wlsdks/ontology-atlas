import { describe, expect, it } from 'vitest';

import { buildDomeModel } from './model-build';
import { DOME_PITCH_DEFAULT, DOME_YAW_DEFAULT } from './orbit';
import { domeWorldBounds, projectDomeCoord } from './projection';
import { domeTurnFollowTarget, domeTurnReach, followTurnWithZoom } from './turn-follow';
import type { DomeInputNode, DomeModel } from './types';

const DEG = Math.PI / 180;
const FREE = { halfW: 520, halfH: 330 };
/** The free area's centre sits off the viewport centre, as a side panel puts it. */
const PIVOT_SCREEN_OFFSET_X = -90;

/** A project, `domains` domains with capabilities and elements, and a few loose capabilities. */
function cloud(size: number, domains: number): DomeModel {
  const nodes: DomeInputNode[] = [{ id: 'p', kind: 'project', x: 0, y: 0, parentId: null }];
  for (let d = 0; d < domains; d += 1) nodes.push({ id: `d${d}`, kind: 'domain', x: d, y: 0, parentId: 'p' });
  const capabilities = Math.round(size * 0.15);
  for (let c = 0; c < capabilities; c += 1) {
    nodes.push({ id: `c${c}`, kind: 'capability', x: c, y: 1, parentId: c < 4 ? 'p' : `d${c % domains}` });
  }
  for (let e = 0; nodes.length < size; e += 1) {
    nodes.push({ id: `e${e}`, kind: 'element', x: e, y: 2, parentId: `c${4 + ((e * 7919) % (capabilities - 4))}` });
  }
  const edges = nodes.flatMap((node, i) => [
    ...(node.parentId === null ? [] : [{ sourceId: node.parentId, targetId: node.id }]),
    ...(node.kind === 'element' && i % 5 === 0 ? [{ sourceId: node.id, targetId: `c${(i * 31) % capabilities}` }] : []),
  ]);
  return buildDomeModel(nodes, { arrangement: 'coupling', edges });
}

function restFit(model: DomeModel) {
  const b = domeWorldBounds(model, DOME_YAW_DEFAULT, DOME_PITCH_DEFAULT)!;
  const tscale = Math.min(FREE.halfW / ((b.maxX - b.minX) / 2), FREE.halfH / ((b.maxY - b.minY) / 2));
  const fit = { tx: (b.minX + b.maxX) / 2 - PIVOT_SCREEN_OFFSET_X / tscale, ty: (b.minY + b.maxY) / 2, tscale };
  return { ...fit, turn: domeTurnReach(model, DOME_YAW_DEFAULT, DOME_PITCH_DEFAULT, FREE)! };
}

describe("Neural's turn-following zoom", () => {
  const model = cloud(1000, 11);
  const fit = restFit(model);

  it('returns exactly the fit at the fit yaw, and a whole turn later', () => {
    expect(domeTurnFollowTarget(fit, fit.turn, DOME_YAW_DEFAULT)).toEqual({ tx: fit.tx, ty: fit.ty, tscale: fit.tscale });
    expect(domeTurnFollowTarget(fit, fit.turn, DOME_YAW_DEFAULT + 2 * Math.PI).tscale).toBe(fit.tscale);
  });

  it('never zooms in past the fit and moves less than 3% per degree of turn', () => {
    const zoom = Array.from({ length: 721 }, (_, half) => domeTurnFollowTarget(fit, fit.turn, DOME_YAW_DEFAULT + half * 0.5 * DEG).tscale);
    for (let half = 2; half < zoom.length; half += 1) {
      expect(zoom[half]).toBeLessThanOrEqual(fit.tscale);
      expect(Math.abs(zoom[half] - zoom[half - 2]) / zoom[half - 2], `at ${half / 2} degrees`).toBeLessThan(0.03);
    }
  });

  it('keeps every concept inside the free area at 24 turn angles', () => {
    for (let k = 0; k < 24; k += 1) {
      const yaw = DOME_YAW_DEFAULT + (k * 2 * Math.PI) / 24;
      const camera = domeTurnFollowTarget(fit, fit.turn, yaw);
      for (const coord of model.coords.values()) {
        const p = projectDomeCoord(model, coord, yaw, DOME_PITCH_DEFAULT);
        const x = (p.wx - camera.tx) * camera.tscale - PIVOT_SCREEN_OFFSET_X;
        const y = (p.wy - camera.ty) * camera.tscale;
        expect(Math.abs(x), `x at turn ${k}`).toBeLessThanOrEqual(FREE.halfW + 1e-6);
        expect(Math.abs(y), `y at turn ${k}`).toBeLessThanOrEqual(FREE.halfH + 1e-6);
      }
    }
  });

  it('stops following once the person zooms, until the camera is back on the fit at its yaw', () => {
    const rest: Parameters<typeof followTurnWithZoom>[0] = { target: fit, yaw: DOME_YAW_DEFAULT, followed: null };
    const turned = followTurnWithZoom(rest, fit, DOME_YAW_DEFAULT + 60 * DEG)!;
    expect(turned.tscale).toBeLessThan(fit.tscale);
    const zoomed = { ...turned, tscale: turned.tscale * 1.4 };
    expect(followTurnWithZoom(rest, zoomed, DOME_YAW_DEFAULT + 90 * DEG)).toBeNull();
    expect(followTurnWithZoom(rest, zoomed, DOME_YAW_DEFAULT + 120 * DEG)).toBeNull();
    expect(followTurnWithZoom(rest, fit, DOME_YAW_DEFAULT)).toBeNull();
    expect(followTurnWithZoom(rest, fit, DOME_YAW_DEFAULT + 60 * DEG)).toEqual(turned);
  });
});
