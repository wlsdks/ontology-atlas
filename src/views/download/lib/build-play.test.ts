import { describe, expect, it } from 'vitest';

import { BUILD_CHANGE, BUILD_RELATIONS } from '../model/build-cast';
import { buildReducer, INITIAL_BUILD, linkingRelation, stepOf, type BuildAction, type BuildState } from './build-play';

const play = (actions: BuildAction[], from: BuildState = INITIAL_BUILD) => actions.reduce(buildReducer, from);
const named = play([{ type: 'open' }, { type: 'read' }, { type: 'name', option: 0 }, { type: 'name', option: 1 }, { type: 'name', option: 0 }]);

describe('build with Moru', () => {
  it('names the concepts in order with the option each one was given, then starts linking', () => {
    expect(named.names).toEqual([0, 1, 0]);
    expect(named.phase).toBe('linking');
    expect(stepOf(named.phase)).toBe(2);
  });

  it('ignores a name before the folder is read', () => {
    expect(play([{ type: 'open' }, { type: 'name', option: 0 }]).names).toEqual([null, null, null]);
  });

  it('draws a relation only from its first concept to its second, counting every misfit tap', () => {
    const [first] = BUILD_RELATIONS;
    const wrongStart = play([{ type: 'tap', concept: first.to }], named);
    expect(wrongStart).toMatchObject({ pick: null, links: 0, misses: 1 });

    const picked = play([{ type: 'tap', concept: first.from }], wrongStart);
    expect(picked.pick).toBe(first.from);
    expect(play([{ type: 'tap', concept: first.from }], picked).pick).toBeNull();

    const linked = play([{ type: 'tap', concept: first.to }], picked);
    expect(linked).toMatchObject({ links: 1, pick: null, phase: 'linking' });
    expect(linkingRelation(linked)).toBe(BUILD_RELATIONS[1]);
  });

  it('walks from the last relation through the commit and its changed concept to the end', () => {
    const linked = play(BUILD_RELATIONS.flatMap(({ from, to }) => [{ type: 'tap', concept: from }, { type: 'tap', concept: to }] as BuildAction[]), named);
    expect(linked.phase).toBe('commit');
    const lit = play([{ type: 'commit' }], linked);
    expect(lit.phase).toBe('impact');
    expect(play([{ type: 'tap', concept: 'cart' }], lit)).toMatchObject({ phase: 'impact', misses: 1 });
    const inspecting = play([{ type: 'tap', concept: BUILD_CHANGE.concept }], lit);
    expect(inspecting.phase).toBe('inspect');
    expect(play([{ type: 'tap', concept: 'cart' }, { type: 'tap', concept: BUILD_CHANGE.concept }], inspecting)).toBe(inspecting);
    const done = play([{ type: 'confirm' }], inspecting);
    expect(done.phase).toBe('done');
    expect(stepOf(done.phase)).toBe(4);
    expect(play([{ type: 'restart' }], done)).toEqual(INITIAL_BUILD);
  });
});
