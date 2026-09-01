import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Keeps the Atlas design bench callable, independent, measured, and mirrored. */

const ROOT = process.cwd();
const DESIGN_OS = 'docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md';
const SKILL = '.claude/skills/design-council/SKILL.md';
const MIRROR = '.agents/skills/design-council/SKILL.md';
const GUARDIAN = 'design-guardian';

const BENCH: ReadonlyArray<readonly [seat: string, agent: string]> = [
  ['Lead Product Designer', 'design-lead'],
  ['Design Systems Engineer', 'design-system'],
  ['Interaction Designer', 'design-interaction'],
  ['Motion / Action Designer', 'design-motion'],
  ['Information Visualization Designer', 'design-infoviz'],
  ['macOS Workbench Designer', 'design-workbench'],
  ['Responsive & Touch Designer', 'design-responsive'],
  ['Agent Handoff Designer', 'design-handoff'],
];

const TIERS: Record<string, string> = {
  'design-lead': 'fable',
  'design-system': 'fable',
  'design-motion': 'opus',
  'design-interaction': 'opus',
  'design-infoviz': 'opus',
  'design-workbench': 'opus',
  'design-responsive': 'opus',
  'design-handoff': 'opus',
};
const MAX_AGENT_BYTES = 9_000;

const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const agent = (name: string): string => read(`.claude/agents/${name}.md`);

describe('Design Council wiring', () => {
  it('gives every documented bench seat one callable agent', () => {
    const doc = read(DESIGN_OS);
    const start = doc.indexOf('### Atlas Designer Bench');
    expect(start).toBeGreaterThan(-1);
    const section = doc.slice(start, doc.indexOf('\n### ', start + 1));
    for (const [seat, name] of BENCH) {
      expect(section).toContain(seat);
      expect(agent(name), `${name} must claim ${seat}`).toContain(seat);
    }
  });

  it('keeps the accountable applier outside the bench', () => {
    for (const [, name] of BENCH) expect(name).not.toBe(GUARDIAN);
    expect(read(SKILL)).toContain(GUARDIAN);
    expect(read(DESIGN_OS)).toMatch(/`design-guardian` is \*\*not\*\* a seat/);
  });

  it('gives each seat primary-source research and an actionable alternative', () => {
    for (const [, name] of BENCH) {
      const body = agent(name);
      const frontmatter = body.split('---')[1] ?? '';
      expect(frontmatter).toContain(`name: ${name}`);
      expect(frontmatter).toContain('WebSearch');
      expect(body, `${name} must prescribe an alternative`).toMatch(/Prescription|alternative/i);
      expect(body).toMatch(/Published lineage/i);
      expect(body).toMatch(/no asset imitation|never copy/i);
    }
  });

  it('uses the fact router instead of standing seats', () => {
    const skill = read(SKILL).replace(/\s+/g, ' ');
    expect(skill).toContain('pnpm design:route');
    expect(skill).toMatch(/No seat always attends/i);
    expect(skill).toMatch(/exactly the seats returned by the router/i);
  });

  it('requires subtraction and a falsifier', () => {
    const skill = read(SKILL).replace(/\s+/g, ' ');
    expect(skill).toMatch(/remove, dim, collapse, or align/i);
    expect(skill).toMatch(/falsifier/i);
  });

  it('keeps deliberate model diversity and byte budgets', () => {
    expect(new Set(Object.values(TIERS)).size).toBeGreaterThanOrEqual(2);
    for (const [, name] of BENCH) {
      const body = agent(name);
      const frontmatter = body.split('---')[1] ?? '';
      expect(frontmatter).toContain(`model: ${TIERS[name]}`);
      expect(frontmatter).not.toContain('model: haiku');
      expect(Buffer.byteLength(body, 'utf8')).toBeLessThanOrEqual(MAX_AGENT_BYTES);
    }
  });

  it('requires real pixels and recorded temporal output without making all instruments universal', () => {
    const skill = read(SKILL);
    expect(skill).toContain('computer-use render-loop packet');
    expect(skill).toContain('motion-verify');
    expect(skill).toMatch(/real macOS recording/i);
    expect(skill).toMatch(/only when the route selected it/i);
  });

  it('keeps conflict-bounded rebuttal and capability-based mirrored seat discovery', () => {
    for (const path of [SKILL, MIRROR]) {
      const body = read(path);
      const folded = body.replace(/\s+/g, ' ');
      expect(folded).toMatch(/only when two positions conflict/i);
      expect(folded).toMatch(/No repeated questions/i);
      expect(folded).toContain('../../agents/design-*.md');
      expect(folded).toContain('never create a third copy');
      expect(folded).toMatch(/disclose lost independence/i);
      expect(folded).toMatch(/defer that part of the verdict/i);
      for (const brand of ['Claude Code', 'Codex', 'Cursor', 'Gemini']) {
        expect(body, `${path} must not branch on ${brand}`).not.toContain(brand);
      }
    }
  });

  it('keeps chief non-editing, bounded, and rule-driven', () => {
    const chief = read('.claude/agents/chief.md');
    const frontmatter = chief.split('---')[1] ?? '';
    expect(frontmatter).toContain('name: chief');
    expect(frontmatter).toContain('model: fable');
    expect(frontmatter).not.toMatch(/\bEdit\b|\bWrite\b/);
    expect(chief).toMatch(/eight design seats/i);
    for (const rule of ['Smallest slice', 'Charter first', 'No union', 'Removal required']) {
      expect(chief).toContain(rule);
    }
    expect(chief).toMatch(/at most two turns/i);
    expect(chief).toContain('docs/DECISIONS.md');
  });

  it('makes the guardian remeasure the applied last mile', () => {
    expect(read('.claude/agents/design-guardian.md')).toMatch(/Remeasure after applying/i);
  });

  it('keeps first impression with lead and depth grammar with system', () => {
    expect(agent('design-lead')).toMatch(/First impression/i);
    const system = agent('design-system');
    expect(system).toContain('Depth grammar');
    expect(system).toMatch(/Turn\s+shadows off/i);
  });

  it('reads prior decisions, mirrors exactly, and names every seat', () => {
    const skill = read(SKILL);
    expect(skill).toMatch(/prior decision/i);
    expect(skill).toContain('docs/DECISIONS.md');
    expect(read(MIRROR)).toBe(skill);
    for (const [, name] of BENCH) expect(skill).toContain(name);
  });

  it('records review utility instead of equating reviewer count with quality', () => {
    const skill = read(SKILL);
    for (const field of ['Pre-review decision', 'Decision delta', 'Unique contribution', 'Review footprint']) {
      expect(skill).toContain(field);
    }
    expect(skill).toMatch(/Five consecutive no-delta councils/i);
  });
});

const PLAIN_FILES = [SKILL, MIRROR, '.claude/agents/chief.md'] as const;
const REQUIRED = ['What we decided', 'What differs from your request', 'What you need to do'];
const BANNED = ['rubric', 'falsifier', 'signature', 'appetite'];

function summaryTemplate(path: string): string {
  const body = read(path);
  const anchor = body.indexOf('First — three lines');
  expect(anchor).toBeGreaterThan(-1);
  const open = body.lastIndexOf('```', anchor);
  const close = body.indexOf('```', anchor);
  expect(open).toBeGreaterThan(-1);
  expect(close).toBeGreaterThan(anchor);
  return body.slice(open, close);
}

describe('owner-facing design output stays plain', () => {
  it.each(PLAIN_FILES)('%s carries exactly the plain three-line contract', (path) => {
    const template = summaryTemplate(path);
    for (const line of REQUIRED) expect(template).toContain(line);
    for (const word of BANNED) expect(template.toLowerCase()).not.toContain(word);
  });

  it.each(PLAIN_FILES)('%s prevents the summary becoming a cover page', (path) => {
    const body = read(path).replace(/\s+/g, ' ');
    expect(body).toContain('verdict block does not belong in the conversation');
    expect(body).toMatch(/applies to the entire answer|language rule applies to the entire answer/i);
    expect(body).toContain('clarification request is a failure signal');
    expect(body).toContain('cannot be omitted');
  });
});

describe('/design-directions divergence', () => {
  const DIRECTIONS = '.claude/skills/design-directions/SKILL.md';
  const DIRECTIONS_MIRROR = '.agents/skills/design-directions/SKILL.md';

  it('mirrors exactly and carries the experimental basis', () => {
    const body = read(DIRECTIONS).replace(/\s+/g, ' ');
    expect(read(DIRECTIONS_MIRROR)).toBe(read(DIRECTIONS));
    expect(body).toContain('Dow');
    expect(body).toContain('TOCHI 2010');
    expect(body).toContain('serial');
  });

  it('separates divergence from implementation and includes status quo', () => {
    const body = read(DIRECTIONS).replace(/\s+/g, ' ');
    expect(body).toMatch(/owner of divergence is [`*]*chief/i);
    expect(body).toContain(GUARDIAN);
    expect(body).toMatch(/one direction is \*\*the status quo\*\*/i);
    expect(read(SKILL)).toContain('design-directions');
  });
});

describe('evidence integrity', () => {
  it('keeps data-ink out of rejection grounds and Mackinlay in', () => {
    const files = [
      ...BENCH.map(([, name]) => `.claude/agents/${name}.md`),
      '.claude/agents/design-guardian.md',
      SKILL,
      MIRROR,
    ];
    for (const path of files) {
      const body = read(path).replace(/\s+/g, ' ');
      if (/data-ink/i.test(body)) {
        expect(body, `${path} may mention data-ink only as rejected grounds`).toMatch(
          /data-ink[^.]{0,120}(not|never|must not)[^.]{0,80}(reject|grounds)/i,
        );
      }
    }
    const infoviz = agent('design-infoviz');
    expect(infoviz).toContain('Mackinlay');
    expect(infoviz).toContain('Inbar');
    expect(infoviz).toContain('Bateman');
  });

  it('keeps specification-change triggers in the rule and build recipe', () => {
    for (const path of ['.claude/rules/design.md', '.claude/skills/design-build/SKILL.md']) {
      const body = read(path);
      expect(body).toContain('design-system');
      expect(body).toContain('src/shared/ui/control-class.ts');
      expect(body).toContain('app/globals.css');
    }
    const rule = read('.claude/rules/design.md');
    expect(rule).toContain('244');
    expect(rule).toMatch(/taste/i);
  });
});
