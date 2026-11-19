import { describe, expect, it } from 'vitest';

import { BUILD_CHANGE, CODE_NAMED, PERSON_RELATION } from '../model/build-cast';
import { AGENT_BEATS, agentRelationDrawn, buildReducer, INITIAL_BUILD, isNamed, stepOf, targetConcept, type BuildAction, type BuildState } from './build-play';

const play = (actions: BuildAction[], from: BuildState = INITIAL_BUILD) => actions.reduce(buildReducer, from);
const beats = (count: number): BuildAction[] => Array.from({ length: count }, () => ({ type: 'beat' }));
const built = play([{ type: 'open' }, ...beats(AGENT_BEATS + 1)]);

describe('build with Moru', () => {
  it('lets the agent write the concepts one beat at a time, then its relation, then hands over', () => {
    const gathering = play([{ type: 'open' }, ...beats(1)]);
    expect([0, 1, 2].map((order) => isNamed(gathering, order))).toEqual([false, false, false]);
    const twoNamed = play(beats(2), gathering);
    expect([0, 1, 2].map((order) => isNamed(twoNamed, order))).toEqual([true, true, false]);
    expect(agentRelationDrawn(twoNamed)).toBe(false);
    expect(agentRelationDrawn(play(beats(2), twoNamed))).toBe(true);
    expect(built.phase).toBe('rename');
    expect(targetConcept(built)).toBe(CODE_NAMED.concept);
  });

  it('opens the rename only on the concept named like code, counting other taps as misses', () => {
    expect(play([{ type: 'tap', concept: 'cart' }], built)).toMatchObject({ phase: 'rename', misses: 1 });
    const renaming = play([{ type: 'tap', concept: CODE_NAMED.concept }], built);
    expect(renaming.phase).toBe('renaming');
    expect(play([{ type: 'rename', option: 1 }], renaming)).toMatchObject({ renamed: 1, phase: 'linking' });
  });

  it('draws the missing relation only from its first concept to its second', () => {
    const linking = play([{ type: 'tap', concept: CODE_NAMED.concept }, { type: 'rename', option: 0 }], built);
    const wrongStart = play([{ type: 'tap', concept: PERSON_RELATION.to }], linking);
    expect(wrongStart).toMatchObject({ pick: null, links: 0, misses: 1 });
    const picked = play([{ type: 'tap', concept: PERSON_RELATION.from }], wrongStart);
    expect(picked.pick).toBe(PERSON_RELATION.from);
    expect(play([{ type: 'tap', concept: PERSON_RELATION.from }], picked).pick).toBeNull();
    expect(play([{ type: 'tap', concept: PERSON_RELATION.to }], picked)).toMatchObject({ links: 1, pick: null, phase: 'commit' });
  });

  it('walks from the commit through its changed concept to the end and back to the start', () => {
    const lit = play(
      [
        { type: 'tap', concept: CODE_NAMED.concept },
        { type: 'rename', option: 0 },
        { type: 'tap', concept: PERSON_RELATION.from },
        { type: 'tap', concept: PERSON_RELATION.to },
        { type: 'commit' },
      ],
      built,
    );
    expect(lit.phase).toBe('impact');
    expect(play([{ type: 'tap', concept: 'cart' }], lit)).toMatchObject({ phase: 'impact', misses: 1 });
    const inspecting = play([{ type: 'tap', concept: BUILD_CHANGE.concept }], lit);
    expect(play([{ type: 'tap', concept: 'cart' }, { type: 'tap', concept: BUILD_CHANGE.concept }], inspecting)).toBe(inspecting);
    const done = play([{ type: 'confirm' }], inspecting);
    expect(stepOf(done.phase)).toBe(5);
    expect(play([{ type: 'restart' }], done)).toEqual(INITIAL_BUILD);
  });
});
