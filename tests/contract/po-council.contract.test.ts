import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Keeps the PO Council executable rather than aspirational prose. The contract
 * covers lens ownership, rubric signers, model diversity, mirrored skill wiring,
 * accountable human authority, and the plain owner-facing summary.
 */

const ROOT = process.cwd();
const PO_OS = 'docs/PRODUCT-OWNER-OPERATING-SYSTEM.md';
const SKILL = '.claude/skills/po-council/SKILL.md';
const MIRROR = '.agents/skills/po-council/SKILL.md';
const LEDGER = 'docs/DECISIONS.md';

const AGENTS = ['po-evidence', 'po-craft', 'po-steward', 'po-wedge', 'po-leverage'] as const;
const ROWS = ['Problem insight', 'User moment', 'Differentiation', 'Ontology value', 'Agent value', 'Verification'] as const;
const FATAL_ROWS = ['Problem insight', 'User moment', 'Ontology value', 'Agent value', 'Verification'];
const HUMAN_LENS = 'Accountable Value Owner';
const TIERS: Record<(typeof AGENTS)[number], string> = {
  'po-evidence': 'opus',
  'po-craft': 'opus',
  'po-steward': 'opus',
  'po-wedge': 'fable',
  'po-leverage': 'fable',
};
const MAX_AGENT_BYTES = 9_000;

const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const agent = (name: string): string => read(`.claude/agents/${name}.md`);

function documentedLenses(): string[] {
  const doc = read(PO_OS);
  const start = doc.indexOf('## The Atlas PO Council');
  expect(start, 'PO OS must retain The Atlas PO Council').toBeGreaterThan(-1);
  const section = doc.slice(start, doc.indexOf('\n## ', start + 1));
  return [...section.matchAll(/^- ([A-Z][A-Za-z-]*(?: [A-Z][A-Za-z-]*)*): /gm)].map((match) => match[1]);
}

function ownedRows(name: string): string {
  const body = agent(name);
  const start = body.indexOf('## Owned rubric rows');
  expect(start, `${name} must carry an Owned rubric rows section`).toBeGreaterThan(-1);
  const end = body.indexOf('\n## ', start + 1);
  return body.slice(start, end === -1 ? undefined : end);
}

describe('PO Council wiring', () => {
  const lenses = documentedLenses();

  it('loads the complete documented lens roster', () => {
    expect(lenses.length).toBeGreaterThanOrEqual(13);
    expect(lenses).toContain(HUMAN_LENS);
  });

  it('gives every non-human lens exactly one owner', () => {
    for (const lens of lenses.filter((value) => value !== HUMAN_LENS)) {
      const owners = AGENTS.filter((name) => agent(name).includes(`**${lens}**`));
      expect(owners, `lens ${lens} must have exactly one owner`).toHaveLength(1);
    }
  });

  it('keeps the accountable value owner human', () => {
    for (const name of AGENTS) expect(agent(name)).not.toContain(`**${HUMAN_LENS}**`);
    expect(read(SKILL)).toContain(HUMAN_LENS);
  });

  it('gives each scored rubric row exactly one signer', () => {
    for (const row of ROWS) {
      const signers = AGENTS.filter((name) => ownedRows(name).includes(row));
      expect(signers, `rubric row ${row} must have exactly one signer`).toHaveLength(1);
    }
  });

  it('lets every seat research and requires an alternative when blocking', () => {
    for (const name of AGENTS) {
      const body = agent(name);
      const frontmatter = body.split('---')[1] ?? '';
      expect(frontmatter).toContain(`name: ${name}`);
      expect(frontmatter, `${name} needs primary-source web research`).toContain('WebSearch');
      expect(body, `${name} must prescribe an alternative`).toMatch(
        /Alternative next action|How to create value|Deeper slice|Prescription/i,
      );
    }
  });

  it('keeps deliberate model diversity and fatal rows on opus', () => {
    expect(new Set(Object.values(TIERS)).size).toBeGreaterThanOrEqual(2);
    for (const name of AGENTS) {
      const frontmatter = agent(name).split('---')[1] ?? '';
      expect(frontmatter).toContain(`model: ${TIERS[name]}`);
      expect(frontmatter).not.toContain('model: haiku');
    }
    for (const row of FATAL_ROWS) {
      const signer = AGENTS.find((name) => ownedRows(name).includes(row));
      expect(signer, `fatal row ${row} needs a signer`).toBeDefined();
      expect(TIERS[signer!]).toBe('opus');
    }
  });

  it('does not prescribe the retired npm entrypoint', () => {
    for (const name of AGENTS) {
      const folded = agent(name).replace(/\s+/g, ' ');
      const cited = folded.match(/npx ontology-atlas/g) ?? [];
      const taughtDead = folded.match(/npx ontology-atlas[^.]{0,80}(404|does not exist|not available|retired)/gi) ?? [];
      expect(cited.length, `${name} must teach any npx mention as dead`).toBe(taughtDead.length);
    }
  });

  it('keeps seat briefs within the recurring-context budget', () => {
    for (const name of AGENTS) {
      expect(Buffer.byteLength(agent(name), 'utf8'), `${name} exceeds ${MAX_AGENT_BYTES} bytes`).toBeLessThanOrEqual(MAX_AGENT_BYTES);
    }
  });

  it('keeps bounded query, mirrored seat discovery, and capability branching', () => {
    for (const path of [SKILL, MIRROR]) {
      const body = read(path);
      const folded = body.replace(/\s+/g, ' ');
      expect(folded).toContain('Bounded cross-council query');
      expect(folded).toContain('Assumption if unanswered');
      expect(folded).toContain('../../agents/po-*.md');
      expect(folded).toContain('Never create a third copy');
      expect(folded).toContain('Round 1 independence was lost');
      expect(folded).toContain('parallel subagents');
      for (const brand of ['Claude Code', 'Codex', 'Cursor', 'Gemini']) {
        expect(body, `${path} must branch on capability, not ${brand}`).not.toContain(brand);
      }
    }
  });

  it('reads prior decisions, mirrors exactly, and names every seat', () => {
    const skill = read(SKILL);
    expect(skill).toMatch(/Round 0 .*prior decisions/i);
    expect(skill).toContain(LEDGER);
    expect(read(MIRROR)).toBe(skill);
    for (const name of AGENTS) expect(skill).toContain(name);
    expect(skill.replace(/\s+/g, ' ')).toMatch(/never (a|the|their) union/i);
    expect(skill).toMatch(/falsifier/i);
  });

  it('keeps the ledger append-only and falsifiable', () => {
    const ledger = read(LEDGER);
    expect(ledger).toMatch(/falsifier|반증 조건/i);
    expect(ledger).toMatch(/revisit|재검토/i);
    expect(ledger).toMatch(/append|덧붙/i);
  });
});

const PLAIN_FILES = [SKILL, MIRROR, '.claude/agents/chief.md'] as const;
const REQUIRED = ['What we decided', 'What differs from your request', 'What you need to do'];
const BANNED = ['rubric', 'falsifier', 'signature', 'appetite'];

function summaryTemplate(path: string): string {
  const body = read(path);
  const anchor = body.indexOf('First — three lines');
  expect(anchor, `${path} must contain the three-line template`).toBeGreaterThan(-1);
  const open = body.lastIndexOf('```', anchor);
  const close = body.indexOf('```', anchor);
  expect(open).toBeGreaterThan(-1);
  expect(close).toBeGreaterThan(anchor);
  return body.slice(open, close);
}

describe('owner-facing council output stays plain', () => {
  it.each(PLAIN_FILES)('%s requires all three lines and no internal vocabulary', (path) => {
    const template = summaryTemplate(path);
    for (const line of REQUIRED) expect(template).toContain(line);
    for (const word of BANNED) expect(template.toLowerCase()).not.toContain(word);
  });

  it.each(PLAIN_FILES)('%s prevents the three lines becoming a cover page', (path) => {
    const body = read(path).replace(/\s+/g, ' ');
    expect(body).toContain('verdict block does not belong in the conversation');
    expect(body).toMatch(/applies to the entire answer|language rule applies to the entire answer/i);
    expect(body).toMatch(/clarification request[^.]{0,80}failure signal/i);
    expect(body).toContain('cannot be omitted');
  });
});
