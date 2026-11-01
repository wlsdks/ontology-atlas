import { afterEach, describe, expect, it, vi } from 'vitest';
const bridge = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: bridge.invoke }));
import { readPublicPulls } from '@/shared/lib/git/tauri-pr-inventory';
import { clearPublicPullLedger, getPublicPullSession, publicPullScope, savePublicPullPage } from '@/shared/lib/git/public-pull-ledger';
import type { PublicPullVersion } from '@/shared/lib/git/tauri-pr-inventory';
import { planPrAgentEvidence } from './pr-agent-evidence';

const pull = (number: number, body = `Details ${number}.\n\nChecks: verified manually.`): PublicPullVersion => ({
  number, title: `PR ${number}`, body, bodyPresent: true, digest: number.toString(16).padStart(64, '0'),
  url: `https://github.com/example/repo/pull/${number}`, updatedAt: '2026-11-01T00:00:00Z', fetchedAt: '2026-11-01T01:00:00Z', status: 'merged',
});
const scope = { sourceRoot: '/source', head: 'head', snapshot: 'snapshot', repository: 'example/repo' };
async function witness(records: PublicPullVersion[]) {
  bridge.invoke.mockImplementation(async (command: string) => command === 'llm_chat_prepare' ? 'request' : { repository: scope.repository, versions: records, conflicts: [], omitted: [], unlistedOmissions: 0 });
  const result = (await readPublicPulls(scope, scope.repository, { action: 'start', cursor: null }, new AbortController().signal))!;
  savePublicPullPage(publicPullScope(scope.sourceRoot, scope.head, scope.snapshot, scope.repository), result);
  return result.versions;
}
afterEach(clearPublicPullLedger);
const question = 'Summarize the author-reported changes.';
describe('PR agent evidence plan', () => {
  it('places each of 39 complete originals once in bounded independent parts without commit or generated text', async () => {
    const originals = await witness(Array.from({ length: 39 }, (_, index) => pull(index + 1, `Original ${index + 1}.\n\n${'한글과 evidence '.repeat(25)}`)));
    const plan = planPrAgentEvidence(scope, question, originals, 3500);
    expect(plan.parts.length).toBeGreaterThan(1);
    expect(plan.omitted).toEqual([]);
    expect(plan.parts.flatMap(part => part.sources.map(source => source.number))).toEqual(originals.map(source => source.number));
    for (const part of plan.parts) {
      expect(part.bytes).toBe(new TextEncoder().encode(part.text).length);
      expect(part.bytes).toBeLessThanOrEqual(3500);
      const packet = JSON.parse(part.text);
      expect(Object.keys(packet)).toEqual(['instructions', 'repository', 'question', 'sources']);
      expect(packet.question).toBe(question);
      expect(packet.sources).toHaveLength(part.sources.length);
      for (const source of packet.sources) {
        const original = originals.find(value => source.id === `pr:${value.number}`)!;
        expect(source.version).toBe(original.digest);
        expect(source.passages[0].text).toBe(original.title);
        expect(source.passages.slice(1).map((passage: { text: string }) => passage.text).join('')).toBe(original.body);
      }
      expect(part.text).not.toContain('COMMIT_ONLY_SENTINEL');
      expect(part.text).not.toContain('PREVIOUS_GENERATED_ANSWER');
    }
  });

  it('accounts for unavailable and oversized originals and continues after each without truncating', async () => {
    const missing = { ...pull(2), bodyPresent: false };
    const selected = await witness([pull(1), missing, pull(3, '가'.repeat(4000)), pull(4)]);
    const plan = planPrAgentEvidence(scope, question, selected, 2000);
    expect(plan.parts.flatMap(part => part.sources.map(source => source.number))).toEqual([1, 4]);
    expect(plan.omitted).toEqual([
      { number: 2, version: missing.digest, reason: 'unavailable' },
      { number: 3, version: pull(3).digest, reason: 'overlarge' },
    ]);
  });

  it('requires an explicit single version per PR and rejects malformed identities', async () => {
    const selected = await witness([pull(1), { ...pull(1), digest: 'a'.repeat(64) }]);
    expect(() => planPrAgentEvidence(scope, question, selected.slice(0, 2), 4000)).toThrow('invalid-pr-agent-source');
    expect(() => planPrAgentEvidence({ ...scope, repository: '../repo' }, question, [selected[0]], 4000)).toThrow('invalid-pr-agent-plan');
    expect(() => planPrAgentEvidence(scope, question, [{ ...selected[0], digest: 'old' }], 4000)).toThrow('invalid-pr-agent-source');
    expect(() => planPrAgentEvidence(scope, '  ', [selected[0]], 4000)).toThrow('invalid-pr-agent-plan');
  });

  it('pins the exact preview and rejects forged or mutated originals', async () => {
    const [original] = await witness([pull(1, 'Original text.')]);
    const plan = planPrAgentEvidence(scope, question, [original], 4000);
    expect(() => planPrAgentEvidence(scope, question, [{ ...original, body: 'Forged before preview.' }], 4000)).toThrow('invalid-pr-agent-source');
    expect(() => planPrAgentEvidence({ ...scope, snapshot: 'other' }, question, [original], 4000)).toThrow('invalid-pr-agent-source');
    expect(() => { original.body = 'Changed after preview.'; }).toThrow();
    expect(plan.parts[0].sources[0].passages[1].text).toBe('Original text.');
    expect(plan.parts[0].text).not.toContain('Changed after preview.');
    expect(Object.isFrozen(plan.parts[0].sources[0].passages[1])).toBe(true);
  });

  it('does not prepare a native original that the bounded session did not retain', async () => {
    const records = [pull(1)];
    bridge.invoke.mockImplementation(async (command: string) => command === 'llm_chat_prepare' ? 'request' : { repository: scope.repository, versions: records, conflicts: [], omitted: [], unlistedOmissions: 0 });
    const result = (await readPublicPulls(scope, scope.repository, { action: 'start', cursor: null }, new AbortController().signal))!;
    expect(() => planPrAgentEvidence(scope, question, result.versions, 4000)).toThrow('invalid-pr-agent-source');
    const key = publicPullScope(scope.sourceRoot, scope.head, scope.snapshot, scope.repository);
    savePublicPullPage(key, result);
    expect(planPrAgentEvidence(scope, question, result.versions, 4000).parts).toHaveLength(1);
    const retained = getPublicPullSession(key);
    expect(Object.isFrozen(retained)).toBe(true);
    expect(Object.isFrozen(retained.versions)).toBe(true);
    expect(() => { retained.versions = []; }).toThrow();
  });

  it('bounds selection and question before splitting or serializing originals', async () => {
    const [original] = await witness([pull(1)]);
    expect(() => planPrAgentEvidence(scope, 'q'.repeat(8193), [original], 4000)).toThrow('invalid-pr-agent-plan');
    expect(() => planPrAgentEvidence(scope, question, Array(401).fill(original), 4000)).toThrow('invalid-pr-agent-plan');
  });

  it('groups hundreds of thousands of tiny paragraphs without losing original bytes', async () => {
    const body = 'a\n\n'.repeat(120_000) + '😀end';
    const [original] = await witness([pull(1, body)]);
    const plan = planPrAgentEvidence(scope, question, [original], 1024 * 1024);
    expect(plan.omitted).toEqual([]);
    const passages = plan.parts[0].sources[0].passages;
    expect(passages.length).toBeLessThanOrEqual(257);
    expect(passages.slice(1).map(passage => passage.text).join('')).toBe(body);
    expect(passages.every(passage => !/[\ud800-\udbff]$/.test(passage.text))).toBe(true);
  });
});

