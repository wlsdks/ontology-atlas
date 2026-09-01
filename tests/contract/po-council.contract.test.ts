import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  PO_REVIEW_RECORD_FIELDS,
  PO_RISK_ROUTES,
  PO_SOLO_FIELDS,
  routePoDecision,
} from '../../scripts/lib/po-risk-router.mjs';

/**
 * The active PO gate is a risk router, not a prose scorecard. These contracts
 * replay decisions that the old process handled well or expensively, prove the
 * local-first/human-sovereignty brake cannot self-exempt, and bind the written
 * templates to the executable policy.
 */

const ROOT = process.cwd();
const PO_OS = 'docs/PRODUCT-OWNER-OPERATING-SYSTEM.md';
const PILOT = 'docs/PO-PILOT.md';
const PASS_SKILL = '.claude/skills/po-pass/SKILL.md';
const PASS_MIRROR = '.agents/skills/po-pass/SKILL.md';
const COUNCIL_SKILL = '.claude/skills/po-council/SKILL.md';
const COUNCIL_MIRROR = '.agents/skills/po-council/SKILL.md';
const CLI = 'scripts/po-risk-router.mjs';

const RISK_NAMES = ['meaning', 'positioning', 'scope'] as const;
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
  'scripts/lib/po-risk-router.mjs',
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
  it('keeps a small, distinct specialist map and a two-reviewer ceiling', () => {
    expect(Object.keys(PO_RISK_ROUTES)).toEqual(RISK_NAMES);
    expect(new Set(SPECIALISTS).size).toBe(SPECIALISTS.length);

    for (const risk of RISK_NAMES) {
      const result = routePoDecision({
        door: 'one-way',
        evidence: 'observed',
        primaryRisk: risk,
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
          door: 'one-way',
          evidence: 'unknown',
          primaryRisk: 'meaning',
          sovereigntyAffected: true,
        },
        expected: { route: 'review', reviewers: ['po-evidence', 'po-steward'], nextAction: 'evidence-first-review' },
      },
      {
        name: 'unmeasured ACP transport replacement',
        input: { door: 'two-way', evidence: 'unknown', primaryRisk: 'none' },
        expected: { route: 'solo', reviewers: [], nextAction: 'probe-first' },
      },
      {
        name: 'first-contact positioning',
        input: { door: 'one-way', evidence: 'inferred', primaryRisk: 'positioning' },
        expected: { route: 'review', reviewers: ['po-evidence', 'po-wedge'], nextAction: 'evidence-first-review' },
      },
      {
        name: 'reversible craft change',
        input: { door: 'two-way', evidence: 'observed', primaryRisk: 'none' },
        expected: { route: 'solo', reviewers: [], nextAction: 'build-and-verify' },
      },
    ] as const;

    expect(cases.length, 'the historical control inventory must not be empty').toBeGreaterThan(0);
    for (const control of cases) {
      expect(routePoDecision(control.input), control.name).toMatchObject(control.expected);
    }
  });

  it('keeps maintenance cheap but makes the sovereignty brake fail closed', () => {
    expect(routePoDecision({ mechanical: true })).toMatchObject({
      route: 'skip',
      record: false,
      reviewers: [],
    });
    expect(() => routePoDecision({ mechanical: true, sovereigntyAffected: true })).toThrow(
      'mechanical work cannot change local-first or human-sovereignty boundaries',
    );
    expect(() =>
      routePoDecision({ door: 'one-way', evidence: 'observed', primaryRisk: 'none' }),
    ).toThrow('one-way decisions require one primary Atlas risk');

    expect(
      routePoDecision({
        door: 'one-way',
        evidence: 'observed',
        primaryRisk: 'scope',
        sovereigntyAffected: true,
      }),
    ).toMatchObject({
      primaryRisk: 'meaning',
      reviewers: ['po-evidence', 'po-steward'],
    });
  });

  it('routes the command-line entrypoint through the same policy', () => {
    const output = execFileSync(
      process.execPath,
      [CLI, '--door=one-way', '--evidence=inferred', '--risk=positioning', '--json'],
      { cwd: ROOT, encoding: 'utf8' },
    );
    expect(JSON.parse(output)).toMatchObject({
      route: 'review',
      record: true,
      reviewers: ['po-evidence', 'po-wedge'],
      rebuttal: 'only-on-material-conflict',
    });
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
    const pilot = read(PILOT);
    for (const label of ['Window:', 'Cost:', 'Delta:']) expect(pilot).toContain(label);
    expect([...pilot.matchAll(/^\|\s*\d+\s*\|/gm)].length).toBeGreaterThan(0);
    expect(pilot).toMatch(/20 eligible decisions or 14 days/i);
  });
});
