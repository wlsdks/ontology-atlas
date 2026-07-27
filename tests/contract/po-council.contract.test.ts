import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The PO Council wiring contract.
 *
 * `docs/PRODUCT-OWNER-OPERATING-SYSTEM.md` specified a 13-lens council, a 0–24
 * rubric with an 18+ threshold, and a five-level Chief PO ladder — and none of
 * it ever ran. On 2026-07-27 a pass wrote "없음" into the two rubric rows the
 * document calls fatal, returned `Build and verify`, and shipped. The lenses
 * were prose, and prose does not run.
 *
 * So the council is now five agent files, and this test is what stops the
 * wiring from rotting back into prose. It fails the build when a documented
 * lens has no owning agent, when a rubric row has zero or several signers, or
 * when the skill and its mirror drift — the same class of gate this repo uses
 * for the type ramp and the parser/validator contracts.
 */

const ROOT = process.cwd();

const PO_OS_PATH = 'docs/PRODUCT-OWNER-OPERATING-SYSTEM.md';
const SKILL_PATH = '.claude/skills/po-council/SKILL.md';
const SKILL_MIRROR_PATH = '.agents/skills/po-council/SKILL.md';
const LEDGER_PATH = 'docs/DECISIONS.md';

/** The one lens that is intentionally a human, not an agent. */
const DECIDER_LENS = 'Accountable Value Owner';

const COUNCIL_AGENTS = [
  'po-evidence',
  'po-craft',
  'po-steward',
  'po-wedge',
  'po-leverage',
] as const;

/** Every scored row in the PO Quality Rubric needs exactly one signer. */
const RUBRIC_ROWS = [
  'Problem insight',
  'User moment',
  'Differentiation',
  'Ontology value',
  'Agent value',
  'Verification',
] as const;

const TIERS: Record<string, string> = {
  'po-evidence': 'sonnet',
  'po-craft': 'sonnet',
  'po-steward': 'sonnet',
  'po-wedge': 'opus',
  'po-leverage': 'sonnet',
};

const MAX_AGENT_BYTES = 9_000;

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

function agentFile(name: string): string {
  return read(join('.claude/agents', `${name}.md`));
}

/**
 * The lens list is read from the operating-system doc rather than duplicated
 * here on purpose: a copy would drift from the source and the gate would go
 * blind exactly where it is supposed to see.
 */
function documentedLenses(): string[] {
  const doc = read(PO_OS_PATH);
  const start = doc.indexOf('## The Atlas PO Council');
  expect(start, 'PO OS must keep the "The Atlas PO Council" section').toBeGreaterThan(-1);
  const section = doc.slice(start, doc.indexOf('\n## ', start + 1));
  // Lenses are the "- Name: description" bullets that open the section.
  return [...section.matchAll(/^- ([A-Z][A-Za-z-]*(?: [A-Z][A-Za-z-]*)*): /gm)].map((m) => m[1]);
}

describe('PO council wiring', () => {
  const lenses = documentedLenses();

  it('reads a full council roster out of the operating-system doc', () => {
    // 13 lenses is the documented roster; the assertion is on shape, not the
    // exact number, so growing the council is allowed — it just has to stay
    // fully owned (next test).
    expect(lenses.length).toBeGreaterThanOrEqual(13);
    expect(lenses).toContain(DECIDER_LENS);
  });

  it('gives every documented lens exactly one owning agent', () => {
    const owners = new Map<string, string[]>();

    for (const lens of lenses) {
      if (lens === DECIDER_LENS) continue;
      const claiming = COUNCIL_AGENTS.filter((agent) => agentFile(agent).includes(`**${lens}**`));
      owners.set(lens, [...claiming]);
    }

    const unowned = [...owners.entries()].filter(([, claiming]) => claiming.length === 0);
    const contested = [...owners.entries()].filter(([, claiming]) => claiming.length > 1);

    expect(
      unowned.map(([lens]) => lens),
      'every PO OS lens needs an agent that carries it — add the lens to one ' +
        '.claude/agents/po-*.md file, or the council has a blind spot nobody signs for',
    ).toEqual([]);
    expect(
      contested.map(([lens, claiming]) => `${lens} → ${claiming.join(', ')}`),
      'a lens carried by two agents means neither is accountable for it',
    ).toEqual([]);
  });

  it('keeps the decider lens human — it must not be an agent', () => {
    for (const agent of COUNCIL_AGENTS) {
      expect(
        agentFile(agent).includes(`**${DECIDER_LENS}**`),
        `${agent} must not carry ${DECIDER_LENS}: the council stress-tests, it does not decide`,
      ).toBe(false);
    }
    expect(read(SKILL_PATH)).toContain(DECIDER_LENS);
  });

  it('gives every scored rubric row exactly one signer', () => {
    for (const row of RUBRIC_ROWS) {
      const signers = COUNCIL_AGENTS.filter((agent) => {
        const body = agentFile(agent);
        const start = body.indexOf('## 네가 소유하는 루브릭 행');
        if (start === -1) return false;
        const section = body.slice(start, body.indexOf('\n## ', start + 1));
        return section.includes(row);
      });
      // This is the defect that created the council: rows with no owner get
      // "없음" written into them by whoever wants to build.
      expect(signers, `rubric row "${row}" must have exactly one signing agent`).toHaveLength(1);
    }
  });

  it('lets every council agent research the web', () => {
    for (const agent of COUNCIL_AGENTS) {
      const frontmatter = agentFile(agent).split('---')[1] ?? '';
      expect(frontmatter, `${agent} frontmatter must declare a name`).toContain(`name: ${agent}`);
      expect(
        frontmatter,
        `${agent} must be able to search the web — a PO reasoning only from this repo ` +
          'cannot check a competitive claim or a market fact',
      ).toContain('WebSearch');
    }
  });

  it('forbids a blocking opinion that names no alternative', () => {
    for (const agent of COUNCIL_AGENTS) {
      const body = agentFile(agent);
      expect(
        /대신 할 일|가치를 만드는 법|같은 노력의 더 깊은 슬라이스|처방/.test(body),
        `${agent} must require an alternative when it blocks — "no" without a next move is friction, not a gate`,
      ).toBe(true);
    }
  });

  it('assigns every PO a deliberate model tier', () => {
    for (const agent of COUNCIL_AGENTS) {
      const frontmatter = agentFile(agent).split('---')[1] ?? '';
      expect(frontmatter, `${agent} must declare a model tier`).toContain(`model: ${TIERS[agent]}`);
      expect(frontmatter, `${agent} must not be a haiku seat`).not.toContain('model: haiku');
    }
  });

  it('keeps every PO brief under the size budget', () => {
    for (const agent of COUNCIL_AGENTS) {
      const bytes = Buffer.byteLength(agentFile(agent), 'utf8');
      expect(bytes, `${agent} is ${bytes}B — trim it; the operating-system docs are auto-loaded`).toBeLessThanOrEqual(
        MAX_AGENT_BYTES,
      );
    }
  });

  it('carries the bounded cross-council query protocol', () => {
    const skill = read(SKILL_PATH).replace(/\s+/g, ' ');
    expect(skill).toContain('카운슬 간 질의');
    expect(skill).toContain('무응답 시 가정');
  });

  it('makes the decision ledger readable, not just writable', () => {
    const ledger = read(LEDGER_PATH);
    // A dissent nobody re-reads is a checklist entry. The falsifier is what
    // makes a losing argument able to win later, so the ledger has to carry it
    // and the protocol has to say the record is read before convening.
    expect(ledger).toContain('반증 조건');
    expect(ledger).toContain('재검토');
    expect(ledger, 'records are appended, never rewritten').toMatch(/덧붙이기만|덧붙인다/);

    const skill = read(SKILL_PATH);
    expect(skill, 'the skill must point at the ledger').toContain('docs/DECISIONS.md');
    expect(skill, 'convening must start by reading prior decisions').toMatch(/소집 전/);
  });

  it('keeps the skill and its cross-tool mirror byte-identical', () => {
    expect(read(SKILL_MIRROR_PATH)).toBe(read(SKILL_PATH));
  });

  it('names every council agent in the operating-system doc and the skill', () => {
    const doc = read(PO_OS_PATH);
    const skill = read(SKILL_PATH);
    for (const agent of COUNCIL_AGENTS) {
      expect(doc, `${PO_OS_PATH} must reference ${agent}`).toContain(agent);
      expect(skill, `${SKILL_PATH} must reference ${agent}`).toContain(agent);
    }
  });

  it('keeps the anti-committee rule that a decision is never a union of opinions', () => {
    const skill = read(SKILL_PATH);
    expect(skill.replace(/\s+/g, ' ')).toMatch(/never (the|a|their) union/i);
    expect(skill, 'the council must record dissent with a falsifier, or it is just a checklist').toMatch(
      /falsifier/i,
    );
  });
});
