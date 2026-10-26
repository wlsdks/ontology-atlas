import { describe, expect, it } from 'vitest';
import { planPeriod } from './period-run';
import { executePeriod, executionCoverage, freshExecution, type PeriodExecution } from './period-execution';
import { parseNarrative, sourcePassages, type NarrativePacket, type NarrativeSource } from './narrative';

const sources: NarrativeSource[] = Array.from({ length: 8 }, (_, i) => ({ id: `c:${i}`, kind: 'commit', title: `Change ${i}`, text: `Change ${i}.\n\n${'Original words. '.repeat(14)}`, integration: `${i}`, version: `${i}` }));
const plan = planPeriod(sources, 'week', 1200, { status: 'measured', unchecked: 0, unlinked: 0 });
function answer(packet: NarrativePacket) {
  return parseNarrative(JSON.stringify({ themes: [{ title: 'Change', change: { text: 'Recorded change.', evidence: [packet.evidenceIds[0]], inferred: false }, reason: null, checks: [], limits: [] }] }), packet);
}

describe('checkpointed period execution', () => {
  it('preserves completed parts and retries only the failed stage with one request active', async () => {
    let state = freshExecution(plan); const calls: string[] = []; let active = 0; let peak = 0;
    const read = async (packet: NarrativePacket) => { active++; peak = Math.max(peak, active); await Promise.resolve(); active--; calls.push(packet.text); if (calls.length === 2) throw { code: 'invalidAnalysis', detail: 'rejected', delivery: 'confirmed' }; return answer(packet); };
    await executePeriod(plan, state, new AbortController().signal, read, next => { state = next; });
    expect(state.status).toBe('failed'); expect(state.accepted).toHaveLength(1);
    expect(executionCoverage(plan, state).sent.size).toBe(plan.parts[0].sources.length + plan.parts[1].sources.length);
    await executePeriod(plan, state, new AbortController().signal, read, next => { state = next; });
    expect(state.status).toBe('finished'); expect(state.accepted).toHaveLength(plan.parts.length);
    expect(calls.filter(text => text === plan.parts[0].text)).toHaveLength(1);
    expect(calls.filter(text => text === plan.parts[1].text)).toHaveLength(2);
    expect(peak).toBe(1);
    const coverage = executionCoverage(plan, state);
    expect(coverage.sent.size + coverage.uncertain.size + coverage.unsent).toBe(sources.length);
    expect(coverage.linked.size).toBeLessThanOrEqual(coverage.sent.size);
  });
  it('stops the queue, ignores a late answer and resumes at the interrupted part', async () => {
    let state = freshExecution(plan); const calls: NarrativePacket[] = []; const owned = new AbortController();
    await executePeriod(plan, state, owned.signal, async packet => { calls.push(packet); if (calls.length === 2) owned.abort(); return answer(packet); }, next => { state = next; });
    expect(state.status).toBe('paused'); expect(state.accepted).toHaveLength(1); expect(calls).toHaveLength(2);
    expect(state.delivery[1]).toBe('confirmed');
    await executePeriod(plan, state, new AbortController().signal, async packet => { calls.push(packet); return answer(packet); }, next => { state = next; });
    expect(state.status).toBe('finished'); expect(calls.filter(packet => packet === plan.parts[0])).toHaveLength(1);
    expect(calls.filter(packet => packet === plan.parts[1])).toHaveLength(2);
  });
  it('keeps uncertain delivery separate from never sent and confirmed responses', async () => {
    let state = freshExecution(plan); let calls = 0;
    await executePeriod(plan, state, new AbortController().signal, async packet => { if (++calls === 2) throw { code: 'analysisFailed', detail: 'transport interrupted' }; return answer(packet); }, next => { state = next; });
    const coverage = executionCoverage(plan, state);
    expect(coverage.uncertain.size).toBe(plan.parts[1].sources.length);
    expect(coverage.sent.size + coverage.uncertain.size + coverage.unsent).toBe(sources.length);
    expect(coverage.sent.size).toBe(plan.parts[0].sources.length);
  });
  it('retries a failed overview without resending any reading part', async () => {
    let state = freshExecution(plan); let calls = 0;
    await executePeriod(plan, state, new AbortController().signal, async packet => { calls++; if (calls > plan.parts.length) throw { code: 'invalidAnalysis', detail: 'overview rejected' }; return answer(packet); }, next => { state = next; });
    expect(state.failure?.stage).toBe('overview'); expect(state.accepted).toHaveLength(plan.parts.length);
    const sent: NarrativePacket[] = [];
    await executePeriod(plan, state, new AbortController().signal, async packet => { sent.push(packet); return answer(packet); }, next => { state = next; });
    expect(sent).toHaveLength(1); expect(sent[0]).toBe(state.overviewSelection?.packet); expect(state.status).toBe('finished');
  });
  it('accepts empty parts as read but unexplained and does not invent an overview request', async () => {
    let state: PeriodExecution = freshExecution(plan); let calls = 0;
    await executePeriod(plan, state, new AbortController().signal, async packet => { calls++; return parseNarrative('{"themes":[]}', packet); }, next => { state = next; });
    expect(calls).toBe(plan.parts.length); expect(state.status).toBe('finished'); expect(state.overviewSelection?.packet).toBeNull();
    expect(executionCoverage(plan, state).unexplained).toBe(sources.length);
  });
  it('reuses a single part without an overview send', async () => {
    const one = planPeriod([sources[0]], 'day', 1200, plan.lookup); let state = freshExecution(one); let calls = 0;
    await executePeriod(one, state, new AbortController().signal, async packet => { calls++; return answer(packet); }, next => { state = next; });
    expect(calls).toBe(1); expect(state.overview).toEqual(state.accepted[0]);
    expect(sourcePassages(sources[0])[0].id).toBe(one.parts[0].evidenceIds[0]);
  });
});
