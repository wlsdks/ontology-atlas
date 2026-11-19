import { describe, expect, it } from 'vitest';

import { BUILD_CHANGE, BUILD_CONCEPTS, conceptOf } from '../model/build-cast';
import {
  AGENT_BEATS,
  agentRelationsDrawn,
  buildReducer,
  INITIAL_BUILD,
  isMeasured,
  isWritten,
  stepOf,
  targetConcepts,
  type BuildAction,
  type BuildState,
} from './build-play';

const play = (actions: BuildAction[], from: BuildState = INITIAL_BUILD) => actions.reduce(buildReducer, from);
const beats = (count: number): BuildAction[] => Array.from({ length: count }, () => ({ type: 'beat' }));
const built = play([{ type: 'open' }, ...beats(AGENT_BEATS + 1)]);
const tap = (concept: Parameters<typeof conceptOf>[0]): BuildAction => ({ type: 'tap', concept });
const renamed = play([tap('coupon'), { type: 'rename', option: 1 }, tap('login'), { type: 'rename', option: 0 }], built);

describe('build with Moru', () => {
  it('lets the agent write the map cluster by cluster, then its relations, then Atlas counts what to fix', () => {
    const written = (state: BuildState) => BUILD_CONCEPTS.filter((concept) => isWritten(state, concept)).map((concept) => concept.id);
    const firstCluster = play([{ type: 'open' }, ...beats(3)]);
    expect(written(firstCluster)).toEqual(['shop', 'shopping', 'catalog', 'search', 'cart']);
    expect(agentRelationsDrawn(firstCluster)).toBe(false);
    const allWritten = play(beats(3), firstCluster);
    expect(written(allWritten)).toHaveLength(BUILD_CONCEPTS.length);
    expect(isMeasured(allWritten)).toBe(false);
    expect(agentRelationsDrawn(play(beats(1), allWritten))).toBe(true);
    expect(isMeasured(play(beats(2), allWritten))).toBe(true);
    expect(built.phase).toBe('rename');
    expect(targetConcepts(built)).toEqual(['coupon', 'login']);
  });

  it('renames the concepts named like code in any order, counting other taps as misses', () => {
    expect(play([tap('cart')], built)).toMatchObject({ phase: 'rename', misses: 1 });
    const half = play([tap('coupon'), { type: 'rename', option: 1 }], built);
    expect(half).toMatchObject({ phase: 'rename', renamed: { coupon: 1 } });
    expect(targetConcepts(half)).toEqual(['login']);
    expect(renamed).toMatchObject({ phase: 'linking', renamed: { coupon: 1, login: 0 } });
  });

  it('links each lone concept from either end, and refuses a start that belongs to no missing line', () => {
    expect(play([tap('cart')], renamed)).toMatchObject({ pick: null, misses: 1 });
    const fromLone = play([tap('refund')], renamed);
    expect(targetConcepts(fromLone)).toEqual(['payment']);
    expect(play([tap('refund')], fromLone).pick).toBeNull();
    expect(play([tap('shipping')], fromLone)).toMatchObject({ pick: 'refund', misses: 1 });
    const one = play([tap('payment')], fromLone);
    expect(one).toMatchObject({ phase: 'linking', links: [0], pick: null });
    expect(play([tap('shipping'), tap('alerts')], one)).toMatchObject({ phase: 'commit', links: [0, 1] });
  });

  it('walks from the commit through its changed concept to the end and back to the start', () => {
    const lit = play([tap('refund'), tap('payment'), tap('alerts'), tap('shipping'), { type: 'commit' }], renamed);
    expect(lit.phase).toBe('impact');
    expect(play([tap('cart')], lit)).toMatchObject({ phase: 'impact', misses: 1 });
    const inspecting = play([tap(BUILD_CHANGE.concept)], lit);
    expect(play([tap('cart'), tap(BUILD_CHANGE.concept)], inspecting)).toBe(inspecting);
    const done = play([{ type: 'confirm' }], inspecting);
    expect(stepOf(done.phase)).toBe(5);
    expect(play([{ type: 'restart' }], done)).toEqual(INITIAL_BUILD);
  });
});
