/**
 * One table, two readers of `.ontology-atlas/map-analysis.jsonl`.
 *
 * The MCP server writes the record and reads it to number the next analysis
 * (`mcp/src/vault/sidecar/map-analysis-log.mjs`, `readMapAnalyses`); the app
 * reads it to draw the map's analysis chip
 * (`src/shared/lib/vault-document/map-analysis-record.ts`). They share no
 * module, so this table keeps them reading the same lines as the same analyses.
 * Each case is the file's text; `expected` is what both return when the clock
 * reads `NOW_MS`.
 */

export const NOW_MS = Date.parse('2026-11-24T09:00:00.000Z');

const line = (fields) => JSON.stringify({
  v: 1,
  analysis: 'a1',
  number: 1,
  session: 's1',
  origin: 'session',
  startedAt: '2026-11-20T09:00:00.000Z',
  at: '2026-11-20T09:10:00.000Z',
  agent: 'claude-code',
  sourceCommit: 'abc1234def5678abc1234def5678abc1234def56',
  sourceDirty: false,
  abilities: { total: 40, offMap: 15 },
  areas: { total: 6, notMapped: 2 },
  concepts: { added: 3, changed: 1, removed: 0 },
  ...fields,
});

const analysis = (fields) => ({
  id: 'a1',
  number: 1,
  origin: 'session',
  startedAt: '2026-11-20T09:00:00.000Z',
  at: '2026-11-20T09:10:00.000Z',
  agent: 'claude-code',
  sourceCommit: 'abc1234def5678abc1234def5678abc1234def56',
  sourceDirty: false,
  abilities: { total: 40, offMap: 15 },
  areas: { total: 6, notMapped: 2 },
  concepts: { added: 3, changed: 1, removed: 0 },
  sessions: 1,
  ...fields,
});

const text = (...lines) => `${lines.join('\n')}\n`;

export const MAP_ANALYSIS_LINE_CASES = Object.freeze([
  {
    name: 'a line as the server writes it',
    text: text(line({})),
    expected: { analyses: [analysis({})], broken: 0 },
  },
  {
    name: 'the last line of a session carries its counts so far',
    text: text(
      line({ at: '2026-11-20T09:05:00.000Z', concepts: { added: 1, changed: 0, removed: 0 }, abilities: { total: 40, offMap: 30 } }),
      line({}),
    ),
    expected: { analyses: [analysis({})], broken: 0 },
  },
  {
    name: 'sessions of one analysis are summed, the latest gives the share',
    text: text(
      line({ session: 's1', origin: 'press' }),
      line({ session: 's2', origin: 'press', startedAt: '2026-11-20T09:12:00.000Z', at: '2026-11-20T09:20:00.000Z', abilities: { total: 40, offMap: 9 }, concepts: { added: 2, changed: 2, removed: 1 } }),
    ),
    expected: {
      analyses: [analysis({ origin: 'press', at: '2026-11-20T09:20:00.000Z', abilities: { total: 40, offMap: 9 }, concepts: { added: 5, changed: 3, removed: 1 }, sessions: 2 })],
      broken: 0,
    },
  },
  {
    name: 'an unknown origin reads as a session',
    text: text(line({ origin: 'schedule' })),
    expected: { analyses: [analysis({})], broken: 0 },
  },
  {
    name: 'missing optional fields fall back',
    text: `${JSON.stringify({ v: 1, analysis: 'a1', number: 1, session: 's1', at: '2026-11-20T09:10:00.000Z' })}\n`,
    expected: {
      analyses: [analysis({ startedAt: '2026-11-20T09:10:00.000Z', agent: null, sourceCommit: null, sourceDirty: null, abilities: null, areas: null, concepts: { added: 0, changed: 0, removed: 0 } })],
      broken: 0,
    },
  },
  {
    name: 'a broken line between two good ones is skipped and counted',
    text: text(
      line({}),
      '{"v":1,"analysis":"a2",',
      line({ analysis: 'a3', number: 2, session: 's3', at: '2026-11-21T10:00:00.000Z', startedAt: '2026-11-21T09:00:00.000Z' }),
    ),
    expected: {
      analyses: [
        analysis({}),
        analysis({ id: 'a3', number: 2, startedAt: '2026-11-21T09:00:00.000Z', at: '2026-11-21T10:00:00.000Z' }),
      ],
      broken: 1,
    },
  },
  {
    name: 'two sessions that minted one number are listed in file order and renumbered',
    text: text(
      line({ analysis: 'a1', number: 3, session: 's1' }),
      line({ analysis: 'a2', number: 3, session: 's2', at: '2026-11-20T09:11:00.000Z' }),
    ),
    expected: {
      analyses: [analysis({ number: 3 }), analysis({ id: 'a2', number: 4, at: '2026-11-20T09:11:00.000Z' })],
      broken: 0,
    },
  },
  {
    name: 'impossible counts read as no count',
    text: text(line({ abilities: { total: 4, offMap: 9 }, areas: { total: -1, notMapped: 0 }, concepts: { added: 1.5, changed: 'two', removed: 0 } })),
    expected: { analyses: [analysis({ abilities: null, areas: null, concepts: { added: 0, changed: 0, removed: 0 } })], broken: 0 },
  },
  {
    name: 'a line of another version, a path for an id, or no time is not read',
    text: text(
      line({ v: 2 }),
      line({ analysis: '../../etc/passwd' }),
      line({ at: 'yesterday' }),
      line({ number: 0 }),
    ),
    expected: { analyses: [], broken: 4 },
  },
  {
    name: 'a commit that is not a hash is dropped, and an agent is kept only when shaped like a runtime id',
    text: text(
      line({ sourceCommit: 'main', agent: '  codex-acp  ' }),
      line({ analysis: 'a2', session: 's2', agent: 'src/billing/keys.ts: function charge(secret)' }),
      line({ analysis: 'a3', session: 's3', agent: '/Users/someone/clients/acme/plan.md' }),
      line({ analysis: 'a4', session: 's4', agent: 'claude\n{"v":1,"analysis":"x"}' }),
      line({ analysis: 'a5', session: 's5', agent: 'x'.repeat(101) }),
    ),
    expected: {
      analyses: [
        analysis({ sourceCommit: null, agent: 'codex-acp' }),
        analysis({ id: 'a2', number: 2, agent: null }),
        analysis({ id: 'a3', number: 3, agent: null }),
        analysis({ id: 'a4', number: 4, agent: null }),
        analysis({ id: 'a5', number: 5, agent: null }),
      ],
      broken: 0,
    },
  },
  {
    name: 'a time before 2020 or more than a day past the clock is not read',
    text: text(
      line({ analysis: 'a2', session: 's2', at: '2019-12-31T23:59:59.000Z', startedAt: '2019-12-31T23:00:00.000Z' }),
      line({ analysis: 'a3', session: 's3', at: '2026-11-25T09:00:01.000Z' }),
      line({ analysis: 'a4', session: 's4', at: '+275760-09-13T00:00:00.000Z' }),
      line({ analysis: 'a5', session: 's5', at: '2026-11-25T08:00:00.000Z', startedAt: '2026-11-25T07:00:00.000Z' }),
    ),
    expected: {
      analyses: [analysis({ id: 'a5', startedAt: '2026-11-25T07:00:00.000Z', at: '2026-11-25T08:00:00.000Z' })],
      broken: 3,
    },
  },
  {
    name: 'a number or count past a billion is not believed',
    text: text(
      line({ number: Number.MAX_SAFE_INTEGER }),
      line({ analysis: 'a2', session: 's2', abilities: { total: 1e300, offMap: 2 }, concepts: { added: 1_000_000_001, changed: 1, removed: 0 } }),
    ),
    expected: {
      analyses: [analysis({ id: 'a2', abilities: null, concepts: { added: 0, changed: 1, removed: 0 } })],
      broken: 1,
    },
  },
  {
    name: 'a start after its own time reads as that time',
    text: text(line({ startedAt: '2026-11-20T10:00:00.000Z' })),
    expected: { analyses: [analysis({ startedAt: '2026-11-20T09:10:00.000Z' })], broken: 0 },
  },
  {
    name: 'no text',
    text: '',
    expected: { analyses: [], broken: 0 },
  },
]);
