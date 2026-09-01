import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  PO_BOUNDARY_SIGNALS,
  PO_CHANGE_SIGNALS,
  PO_OUTCOMES,
  PO_REVIEW_RECORD_FIELDS,
  PO_RISK_ROUTES,
  PO_SOLO_FIELDS,
  routePoDecision,
} from '../../scripts/lib/po-risk-router.mjs';
import {
  evaluatePoPilot,
  parsePoPilot,
  pilotCheckFailures,
} from '../../scripts/lib/po-pilot.mjs';
import { parsePoRouteArgs } from '../../scripts/po-risk-router.mjs';

/**
 * The active PO gate derives its route from inspectable change signals rather
 * than accepting a builder's door/risk verdict. These contracts replay real
 * decisions, prove the local-first/human-sovereignty brake cannot self-exempt,
 * and make the finite pilot capable of deciding its own sunset.
 */

const ROOT = process.cwd();
const PO_OS = 'docs/PRODUCT-OWNER-OPERATING-SYSTEM.md';
const PILOT = 'docs/PO-PILOT.md';
const PASS_SKILL = '.claude/skills/po-pass/SKILL.md';
const PASS_MIRROR = '.agents/skills/po-pass/SKILL.md';
const COUNCIL_SKILL = '.claude/skills/po-council/SKILL.md';
const COUNCIL_MIRROR = '.agents/skills/po-council/SKILL.md';
const CLI = 'scripts/po-risk-router.mjs';
const PILOT_CLI = 'scripts/po-pilot.mjs';

const RISK_NAMES = ['meaning', 'positioning', 'scope'] as const;
type BoundaryState = 'unchanged' | 'affected' | 'unknown';
const UNCHANGED_BOUNDARIES = Object.fromEntries(
  Object.keys(PO_BOUNDARY_SIGNALS).map((name) => [name, 'unchanged']),
) as Record<string, BoundaryState>;
const boundaries = (
  overrides: Partial<Record<string, BoundaryState>> = {},
): Record<string, BoundaryState> => ({
  ...UNCHANGED_BOUNDARIES,
  ...overrides,
}) as Record<string, BoundaryState>;
const SPECIALISTS = Object.values(PO_RISK_ROUTES).map((route) => route.reviewer);
const ACTIVE_AGENTS = ['chief', 'po-evidence', ...SPECIALISTS, 'po-craft'] as const;
const ACTIVE_FILES = [
  PO_OS,
  PILOT,
  PASS_SKILL,
  PASS_MIRROR,
  COUNCIL_SKILL,
  COUNCIL_MIRROR,
  CLI,
  PILOT_CLI,
  'scripts/lib/po-risk-router.mjs',
  'scripts/lib/po-pilot.mjs',
  ...ACTIVE_AGENTS.flatMap((name) => [`.claude/agents/${name}.md`, `.agents/agents/${name}.md`]),
] as const;

const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

function fieldsInTemplate(path: string, anchor: string): string[] {
  const body = read(path);
  const anchorAt = body.indexOf(anchor);
  expect(anchorAt, `${path} must contain ${anchor}`).toBeGreaterThan(-1);
  const open = body.indexOf('```md', anchorAt);
  const close = body.indexOf('```', open + 5);
  expect(open, `${path} must have a Markdown template after ${anchor}`).toBeGreaterThan(-1);
  expect(close, `${path} must close the template after ${anchor}`).toBeGreaterThan(open);
  return [...body.slice(open, close).matchAll(/^\*\*([^*]+)\*\*:/gm)].map((match) => match[1]);
}

describe('Atlas PO risk routing', () => {
  it('keeps a small Atlas outcome set, distinct specialist map, and two-reviewer ceiling', () => {
    expect(Object.keys(PO_OUTCOMES)).toEqual(['orient', 'explain', 'judge', 'correct', 'handoff']);
    expect(Object.keys(PO_RISK_ROUTES)).toEqual(RISK_NAMES);
    expect(new Set(SPECIALISTS).size).toBe(SPECIALISTS.length);

    for (const risk of RISK_NAMES) {
      const signal = Object.entries(PO_CHANGE_SIGNALS).find(([, contract]) => contract.risk === risk)?.[0];
      expect(signal, `${risk} must have a one-way change signal`).toBeTruthy();
      const result = routePoDecision({
        evidence: 'observed',
        outcome: 'judge',
        changes: [signal!],
        boundaries: boundaries(),
      });
      expect(result.reviewers).toEqual(['po-evidence', PO_RISK_ROUTES[risk].reviewer]);
      expect(result.reviewers).toHaveLength(2);
      expect(new Set(result.reviewers).size).toBe(2);
      expect(result.rebuttal).toBe('only-on-material-conflict');
    }
  });

  it('replays known controls instead of merely checking that a council exists', () => {
    const cases = [
      {
        name: 'unsupported OS URL scheme',
        input: {
          evidence: 'unknown',
          outcome: 'correct',
          changes: ['public-contract'],
          boundaries: boundaries({ 'human-correction': 'affected' }),
        },
        expected: {
          door: 'one-way',
          primaryRisk: 'meaning',
          route: 'review',
          reviewers: ['po-evidence', 'po-steward'],
          nextAction: 'evidence-first-review',
        },
      },
      {
        name: 'unmeasured ACP transport replacement',
        input: {
          evidence: 'unknown',
          outcome: 'handoff',
          changes: ['rollback-cheap'],
          boundaries: boundaries(),
        },
        expected: { door: 'two-way', route: 'solo', reviewers: [], nextAction: 'probe-first' },
      },
      {
        name: 'first-contact positioning',
        input: {
          evidence: 'inferred',
          outcome: 'orient',
          changes: ['positioning'],
          boundaries: boundaries(),
        },
        expected: {
          door: 'one-way',
          primaryRisk: 'positioning',
          route: 'review',
          reviewers: ['po-evidence', 'po-wedge'],
          nextAction: 'evidence-first-review',
        },
      },
      {
        name: 'reversible craft change',
        input: {
          evidence: 'observed',
          outcome: 'orient',
          changes: ['rollback-cheap'],
          boundaries: boundaries(),
        },
        expected: { door: 'two-way', route: 'solo', reviewers: [], nextAction: 'build-and-verify' },
      },
    ] as const;

    expect(cases.length, 'the historical control inventory must not be empty').toBeGreaterThan(0);
    for (const control of cases) {
      expect(routePoDecision(control.input), control.name).toMatchObject(control.expected);
    }
  });

  it('derives the route and makes objective boundary signals fail closed', () => {
    expect(routePoDecision({ mechanical: true })).toMatchObject({
      door: 'mechanical',
      route: 'skip',
      record: false,
      reviewers: [],
    });
    expect(() => routePoDecision({ mechanical: true, boundaries: boundaries({ truth: 'affected' }) })).toThrow(
      'mechanical work cannot carry product or sovereignty change signals',
    );
    expect(() =>
      routePoDecision({ mechanical: true, evidence: 'observed', outcome: 'explain' }),
    ).toThrow('mechanical work cannot carry product or sovereignty change signals');
    expect(() =>
      routePoDecision({ evidence: 'observed', outcome: 'explain', boundaries: boundaries() }),
    ).toThrow(
      'at least one change or boundary signal is required',
    );
    expect(() =>
      routePoDecision({
        evidence: 'observed',
        outcome: 'explain',
        changes: ['rollback-cheap'],
        boundaries: { truth: 'unchanged' },
      }),
    ).toThrow('all four boundary assessments are required');
    expect(() =>
      routePoDecision({
        door: 'two-way',
        evidence: 'observed',
        outcome: 'explain',
        primaryRisk: 'none',
        changes: ['rollback-cheap'],
        boundaries: boundaries(),
      } as never),
    ).toThrow('door and primaryRisk are derived');

    expect(
      routePoDecision({
        evidence: 'observed',
        outcome: 'correct',
        changes: ['rollback-cheap', 'surface-inventory'],
        boundaries: boundaries({ 'agent-write': 'unknown' }),
      }),
    ).toMatchObject({
      door: 'one-way',
      primaryRisk: 'meaning',
      reviewers: ['po-evidence', 'po-steward'],
    });

    expect(Object.keys(PO_BOUNDARY_SIGNALS)).toEqual([
      'truth',
      'transfer',
      'agent-write',
      'human-correction',
    ]);
  });

  it('routes the command-line entrypoint through the same policy', () => {
    const output = execFileSync(
      process.execPath,
      [
        CLI,
        '--evidence=inferred',
        '--outcome=orient',
        '--change=positioning',
        '--boundary=truth:unchanged,transfer:unchanged,agent-write:unchanged,human-correction:unchanged',
        '--json',
      ],
      { cwd: ROOT, encoding: 'utf8' },
    );
    expect(JSON.parse(output)).toMatchObject({
      policyVersion: 3,
      door: 'one-way',
      outcome: 'orient',
      primaryRisk: 'positioning',
      route: 'review',
      record: true,
      reviewers: ['po-evidence', 'po-wedge'],
      rebuttal: 'only-on-material-conflict',
    });
    expect(() =>
      parsePoRouteArgs(['--evidence=observed', '--evidence=unknown']),
    ).toThrow('evidence was supplied more than once');
    expect(() => parsePoRouteArgs(['--outcome=orient', '--outcome=judge'])).toThrow(
      'outcome was supplied more than once',
    );
  });
});

describe('Atlas PO pilot can decide its sunset', () => {
  const run = (id: number, overrides: Record<string, unknown> = {}) => ({
    id,
    date: '2026-09-01',
    decision: `decision-${id}`,
    door: 'two-way',
    route: 'solo',
    outcome: 'explain',
    risk: 'none',
    firstTurns: 0,
    rebuttalTurns: 0,
    delta: 'unchanged',
    uniqueContributors: [],
    ...overrides,
  });

  const update = (runId: number, overrides: Record<string, unknown> = {}) => ({
    runId,
    date: '2026-09-01',
    proof: 'pass',
    ownerClear: 'yes',
    boundaryMiss: 'no',
    laterResult: 'held',
    ...overrides,
  });

  const pilot = (runs: ReturnType<typeof run>[], outcome = 'pending') => ({
    metadata: {
      started: '2026-09-01',
      decisionTarget: 20,
      decisionDeadline: '2026-09-15',
      sparseExtensionDeadline: '2026-09-22',
      outcome,
    },
    runs,
    updates: runs.map((row) => update(row.id)),
  });

  it('parses a non-idle, typed register from the human-readable pilot document', () => {
    const source = read(PILOT);
    const parsed = parsePoPilot(source);
    expect(parsed.runs.length, 'the structured pilot inventory must not be empty').toBeGreaterThan(0);
    expect(parsed.updates.length).toBeGreaterThanOrEqual(parsed.runs.length);
    expect(parsed.metadata.outcome).toBe('pending');

    expect(() =>
      parsePoPilot(
        source.replace(
          '| verification-strengthened | po-evidence+po-steward |',
          '| unchanged | po-evidence+po-steward |',
        ),
      ),
    ).toThrow('unchanged review cannot claim a unique contribution');
    expect(() =>
      parsePoPilot(source.replace('outcome: pending', 'outcome: pending\noutcome: keep')),
    ).toThrow('duplicate frontmatter key outcome');
    expect(() =>
      parsePoPilot(
        source.replace(
          '| 1 | 2026-09-01 | pass | pending | no | pending |',
          '| 1 | 2026-09-01 | n/a | pending | no | pending |',
        ),
      ),
    ).toThrow('recovery proof must be one of pending, pass, fail-caught, fail-shipped');
  });

  it('keeps a sparse pilot collecting through its single extension, then requires a decision', () => {
    const rows = Array.from({ length: 9 }, (_, index) => run(index + 1));
    expect(evaluatePoPilot(pilot(rows), '2026-09-15')).toMatchObject({ phase: 'collecting-extension' });
    const due = evaluatePoPilot(pilot(rows), '2026-09-22');
    expect(due).toMatchObject({ phase: 'decision-required', dueReason: 'sparse-extension-deadline' });
    expect(pilotCheckFailures(due)).toContain('pilot outcome is still pending');
  });

  it('refuses to keep the process before its declared evidence window closes', () => {
    const premature = evaluatePoPilot(pilot([run(1)], 'keep'), '2026-09-01');
    expect(premature).toMatchObject({ phase: 'premature-keep' });
    expect(pilotCheckFailures(premature)).toContain('keep was declared before the pilot became due');
  });

  it('allows keep only when review utility, council avoidance, proof, clarity, and boundaries pass', () => {
    const rows = Array.from({ length: 20 }, (_, index) => {
      const id = index + 1;
      if (id > 4) return run(id);
      return run(id, {
        door: 'one-way',
        route: 'review',
        risk: id === 1 ? 'meaning' : id === 2 ? 'positioning' : 'scope',
        firstTurns: 2,
        delta: id === 1 ? 'verification-strengthened' : 'unchanged',
        uniqueContributors: id === 1 ? ['po-steward'] : [],
      });
    });
    const accepted = evaluatePoPilot(pilot(rows, 'keep'), '2026-09-10');
    expect(accepted).toMatchObject({ phase: 'kept', accepted: true });
    expect(accepted.metrics).toMatchObject({
      materialDeltaRate: 0.25,
      reversibleCouncilAvoidanceRate: 1,
      proofResolvedRate: 1,
      ownerClearRate: 1,
      boundaryMisses: 0,
    });
    expect(pilotCheckFailures(accepted)).toEqual([]);
  });

  it('refuses a premature or unsupported keep instead of becoming permanent by inertia', () => {
    const rows = Array.from({ length: 20 }, (_, index) =>
      run(index + 1, {
        door: 'one-way',
        route: 'review',
        risk: 'meaning',
        firstTurns: 2,
      }),
    );
    const candidate = pilot(rows, 'keep');
    candidate.updates[0] = update(1, {
      proof: 'fail-shipped',
      ownerClear: 'no',
      boundaryMiss: 'yes',
      laterResult: 'reversed',
    });
    const rejected = evaluatePoPilot(candidate, '2026-09-10');
    expect(rejected).toMatchObject({ phase: 'invalid-keep', accepted: false });
    expect(pilotCheckFailures(rejected)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/material decision delta/i),
        expect.stringMatching(/reversible council avoidance/i),
        expect.stringMatching(/recovery proof/i),
        expect.stringMatching(/owner clarity/i),
        expect.stringMatching(/boundary miss/i),
        expect.stringMatching(/specialist.*five calls/i),
      ]),
    );
  });

  it('stops immediately when a failed proof ships or a serious boundary miss is recorded', () => {
    const candidate = pilot([run(1)]);
    candidate.updates[0] = update(1, {
      proof: 'fail-shipped',
      ownerClear: 'no',
      boundaryMiss: 'yes',
      laterResult: 'reversed',
    });
    const stopped = evaluatePoPilot(candidate, '2026-09-01');
    expect(stopped).toMatchObject({ phase: 'safety-stop', accepted: false });
    expect(pilotCheckFailures(stopped)).toEqual([
      'a failed recovery proof shipped before the pilot was adjusted or reverted',
      'a serious boundary miss requires the pilot to be adjusted or reverted',
    ]);
  });

  it('wires the pilot command to the same parser and evaluator', () => {
    const output = execFileSync(process.execPath, [PILOT_CLI, '--json', '--as-of=2026-09-01'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(JSON.parse(output)).toMatchObject({
      phase: 'collecting',
      metrics: { eligibleDecisions: expect.any(Number) },
    });
  });

  it('--check never fails a pull request from the calendar alone', () => {
    /*
     * 2026-09-01 review: the gates lane runs `po:pilot -- --check` on every PR,
     * and `decision-required` arrives purely from a date. The old code returned
     * 1 for it before the check branch was consulted, so 21 days after the
     * pilot started every PR would have gone red with no relation to its
     * content. CI mode gates on register validity, an unsupported keep, and a
     * safety stop; a due decision prints as DUE and stays the owner's reminder.
     */
    const farPastDeadline = '2027-01-01';
    const check = spawnSync(
      process.execPath,
      [PILOT_CLI, '--check', `--as-of=${farPastDeadline}`],
      { cwd: ROOT, encoding: 'utf8' },
    );
    expect(check.status, check.stderr).toBe(0);
    expect(check.stderr).toMatch(/DUE:/);
    expect(check.stderr).not.toMatch(/FAIL:/);

    // The owner-facing full mode keeps failing loudly at the same date.
    const full = spawnSync(process.execPath, [PILOT_CLI, `--as-of=${farPastDeadline}`], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(full.status).toBe(1);
    expect(full.stderr).toMatch(/FAIL:/);
  });

  it('accepts the YAML forms the shared frontmatter parser accepts', () => {
    /*
     * 2026-09-01 review: the private line-split parser threw on a comment line,
     * a block scalar, or a block list — so an innocuous owner edit to the
     * register bricked the required gates lane on every PR. Parsing now goes
     * through scripts/lib/parse-frontmatter.mjs; register strictness (required
     * keys, dates, enum, duplicate keys) stays local.
     */
    const source = read(PILOT);
    const close = source.indexOf('\n---\n', 4);
    const withBenignForms = `${source.slice(0, close)}\n# owner note comment\nnote: |-\n  two lines the owner\n  wrote for context\nowners:\n  - stark\n${source.slice(close)}`;
    const parsed = parsePoPilot(withBenignForms);
    expect(parsed.metadata.outcome).toBeDefined();

    // The local strictness survives the delegation.
    const withDuplicate = `${source.slice(0, close)}\noutcome: keep\n${source.slice(close)}`;
    expect(() => parsePoPilot(withDuplicate)).toThrow(/duplicate frontmatter key/);
  });
});

describe('Atlas PO policy stays executable and mirrored', () => {
  it('has a non-empty guarded inventory and matching agent/skill mirrors', () => {
    expect(ACTIVE_FILES.length, 'the active PO inventory must not be empty').toBeGreaterThan(0);
    for (const path of ACTIVE_FILES) expect(existsSync(join(ROOT, path)), `${path} must exist`).toBe(true);

    expect(read(PASS_MIRROR)).toBe(read(PASS_SKILL));
    expect(read(COUNCIL_MIRROR)).toBe(read(COUNCIL_SKILL));
    for (const name of ACTIVE_AGENTS) {
      expect(read(`.agents/agents/${name}.md`)).toBe(read(`.claude/agents/${name}.md`));
    }
  });

  it('binds both written templates to fields exported by the router policy', () => {
    expect(fieldsInTemplate(PO_OS, '## Compact solo pass')).toEqual(PO_SOLO_FIELDS);
    expect(fieldsInTemplate(PASS_SKILL, '## 5. Write one screen')).toEqual(PO_SOLO_FIELDS);
    expect(fieldsInTemplate(PO_OS, '## Significant decision record')).toEqual(PO_REVIEW_RECORD_FIELDS);
    expect(fieldsInTemplate(COUNCIL_SKILL, '## Significant record')).toEqual(PO_REVIEW_RECORD_FIELDS);
  });

  it('prevents the retired score gate from returning to active instructions', () => {
    const retiredInstructions = /\b\d{1,2}\s*\/\s*24\b|fatal zero|score all six|rubric total/i;
    for (const path of ACTIVE_FILES) {
      expect(read(path), `${path} contains a retired score instruction`).not.toMatch(retiredInstructions);
    }
  });

  it('keeps owner authority and the before/after decision delta visible', () => {
    const council = read(COUNCIL_SKILL);
    for (const line of ['What we decided', 'What differs from your request', 'What you need to do']) {
      expect(council).toContain(line);
    }
    expect(council).toMatch(/human owner\s+decides/i);
    expect(PO_REVIEW_RECORD_FIELDS).toContain('Pre-review decision');
    expect(PO_REVIEW_RECORD_FIELDS).toContain('Accountable owner');
    expect(PO_REVIEW_RECORD_FIELDS).toContain('Decision delta');
  });

  it('starts the finite pilot with an actual measured row', () => {
    const pilot = parsePoPilot(read(PILOT));
    expect(pilot.metadata).toMatchObject({
      decisionTarget: 20,
      decisionDeadline: '2026-09-15',
      sparseExtensionDeadline: '2026-09-22',
    });
    expect(pilot.runs.length).toBeGreaterThan(0);
  });
});
