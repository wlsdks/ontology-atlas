import { describe, expect, it } from 'vitest';

import { groupEvents } from './group-events';
import type { AcpEvent } from '@/features/acp-session/model/use-acp-session';

const tool = (id: string): AcpEvent => ({
  kind: 'tool',
  id,
  title: `t-${id}`,
  toolKind: 'other',
  status: 'completed',
});
const thought = (id: string): AcpEvent => ({ kind: 'thought', id, text: `thought-${id}` });
const agent = (id: string): AcpEvent => ({ kind: 'agent', id, text: `answer-${id}` });
const user = (id: string): AcpEvent => ({ kind: 'user', id, text: `question-${id}` });

const kinds = (events: readonly AcpEvent[]) => groupEvents(events).map((item) => item.kind);
const ids = (events: readonly AcpEvent[]) =>
  groupEvents(events).flatMap((item) =>
    item.kind === 'event'
      ? [item.event.id]
      : item.kind === 'toolRun'
        ? item.events.map((event) => event.id)
        : [item.id],
  );

describe('groupEvents — consecutive tool calls read as one run', () => {
  /*
   * Standing rows won the diagnosis, then cost the transcript its shape: four dim lines
   * with nothing tying them together read as four unrelated interruptions. One left rule
   * down the side says "this is one stretch of work" without folding any of it away.
   */
  it('collects tool calls that arrived back to back into one run', () => {
    const out = groupEvents([user('u'), tool('a'), tool('b'), tool('c'), agent('m')]);
    expect(out.map((item) => item.kind)).toEqual(['event', 'toolRun', 'event']);
    const run = out[1];
    expect(run.kind === 'toolRun' && run.events.map((event) => event.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('closes the run at the answer and opens a new one after it', () => {
    const out = groupEvents([user('u'), tool('a'), agent('m1'), tool('b'), agent('m2')]);
    expect(out.map((item) => item.kind)).toEqual([
      'event',
      'toolRun',
      'event',
      'toolRun',
      'event',
    ]);
  });

  it('gives a lone tool call a run of its own — one rule, not a special case', () => {
    const out = groupEvents([user('u'), tool('a'), agent('m')]);
    const run = out.find((item) => item.kind === 'toolRun');
    expect(run?.kind === 'toolRun' && run.events).toHaveLength(1);
  });
});

describe('groupEvents — a tool call stands where it happened', () => {
  it('never folds a tool call into the thinking disclosure', () => {
    /*
     * The whole point of the trace: one dim standing line per call, so a wrong answer is
     * diagnosable without a click. A tool row hidden behind a disclosure cannot do that.
     */
    const out = groupEvents([user("u"), thought("a"), tool("b"), agent("m")]);
    const group = out.find((item) => item.kind === 'workGroup');
    expect(group?.kind === 'workGroup' && group.events.map((event) => event.id)).toEqual(['a']);
    expect(ids([user('u'), thought('a'), tool('b'), agent('m')])).toEqual(['u', 'a', 'b', 'm']);
  });

  it('keeps tool calls in the order they arrived, between the answers they preceded', () => {
    expect(ids([user('u'), tool('a'), agent('m1'), tool('b'), agent('m2')])).toEqual([
      'u',
      'a',
      'm1',
      'b',
      'm2',
    ]);
  });

  it('makes no thinking disclosure at all for a turn that only called tools', () => {
    expect(kinds([user('u'), tool('a'), agent('m')])).toEqual([
      'event',
      'toolRun',
      'event',
    ]);
  });
});

describe('groupEvents — thinking stays separated from the answer', () => {
  it('collects one turn of thinking into one disclosure', () => {
    const out = groupEvents([user('u'), thought('a'), agent('m1'), thought('c'), agent('m2')]);
    expect(out.map((item) => item.kind)).toEqual(['event', 'workGroup', 'event', 'event']);
    expect(out[1].kind === 'workGroup' && out[1].events.map((event) => event.id)).toEqual([
      'a',
      'c',
    ]);
  });

  it('separates it from the body even when there is only one thought', () => {
    expect(kinds([user('u'), thought('a'), agent('m')])).toEqual([
      'event',
      'workGroup',
      'event',
    ]);
  });

  it('starts a new disclosure at the next user message', () => {
    expect(
      kinds([user('u1'), thought('a'), agent('m1'), user('u2'), thought('b'), agent('m2')]),
    ).toEqual(['event', 'workGroup', 'event', 'event', 'workGroup', 'event']);
  });

  it('makes nothing out of nothing', () => {
    expect(groupEvents([])).toEqual([]);
  });
});
