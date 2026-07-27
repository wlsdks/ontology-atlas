import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The Design Council wiring contract.
 *
 * `docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md` carried a seven-seat Atlas Designer
 * Bench and stated in its own words that the roles were "lenses, not separate
 * agents unless a tool explicitly provides them." No tool ever provided them,
 * so the bench never ran — the same way the PO Council never ran.
 *
 * The seats are now agents. This test keeps them from decaying back into prose:
 * it fails when a documented seat has no agent, when the accountable decider is
 * mistakenly demoted into a seat, or when the skill and its cross-tool mirror
 * drift apart.
 */

const ROOT = process.cwd();

const DESIGN_OS_PATH = 'docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md';
const SKILL_PATH = '.claude/skills/design-council/SKILL.md';
const SKILL_MIRROR_PATH = '.agents/skills/design-council/SKILL.md';

/** Bench seat (as written in the design OS) → the agent that carries it. */
const BENCH: ReadonlyArray<readonly [seat: string, agent: string]> = [
  ['Lead Product Designer', 'design-lead'],
  ['Design Systems Engineer', 'design-system'],
  ['Interaction Designer', 'design-interaction'],
  ['Motion / Action Designer', 'design-motion'],
  ['Information Visualization Designer', 'design-infoviz'],
  ['macOS Workbench Designer', 'design-workbench'],
  ['Agent Handoff Designer', 'design-handoff'],
];

/** Decides and applies. Never a seat — same rule as Accountable Value Owner. */
const DECIDER_AGENT = 'design-guardian';

/** Seats that cannot be skipped: one names the winner, one makes it enforceable. */
const ALWAYS_ATTENDING = ['design-lead', 'design-system'];

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

function agentFile(name: string): string {
  return read(join('.claude/agents', `${name}.md`));
}

describe('Design council wiring', () => {
  it('gives every documented bench seat a callable agent', () => {
    const doc = read(DESIGN_OS_PATH);
    const benchStart = doc.indexOf('### Atlas Designer Bench');
    expect(benchStart, 'design OS must keep the Atlas Designer Bench').toBeGreaterThan(-1);
    const bench = doc.slice(benchStart, doc.indexOf('\n### ', benchStart + 1));

    for (const [seat, agent] of BENCH) {
      // The seat must still be documented...
      expect(bench, `bench must still list the "${seat}" seat`).toContain(seat);
      // ...and an agent must claim it by name, so the seat has an owner who signs.
      expect(
        agentFile(agent),
        `${agent} must name the "${seat}" seat it carries`,
      ).toContain(seat);
    }
  });

  it('keeps the accountable decider out of the bench', () => {
    for (const [, agent] of BENCH) {
      expect(
        agent,
        'design-guardian decides and applies; it must not also be a critiquing seat',
      ).not.toBe(DECIDER_AGENT);
    }
    const skill = read(SKILL_PATH);
    expect(skill).toContain(DECIDER_AGENT);
    // The design OS must say the same thing, or the two drift.
    expect(read(DESIGN_OS_PATH)).toMatch(/`design-guardian` is \*\*not\*\* a seat/);
  });

  it('lets every seat research the web and forbids blocking without an alternative', () => {
    for (const [, agent] of BENCH) {
      const body = agentFile(agent);
      const frontmatter = body.split('---')[1] ?? '';
      expect(frontmatter, `${agent} frontmatter must declare its name`).toContain(`name: ${agent}`);
      expect(
        frontmatter,
        `${agent} must be able to search the web — a designer reasoning only from this ` +
          'repo cannot check a published principle',
      ).toContain('WebSearch');
      expect(
        body,
        `${agent} must prescribe an alternative rather than stop at rejection`,
      ).toMatch(/처방/);
    }
  });

  it('binds every seat to published doctrine and forbids asset imitation', () => {
    for (const [, agent] of BENCH) {
      const body = agentFile(agent);
      expect(body, `${agent} must carry a published-doctrine lineage`).toContain('지적 계보');
      expect(
        body,
        `${agent} must state the no-imitation rule — reference products are observed, not copied`,
      ).toMatch(/자산 모방 절대 금지|모방하지 않는다|복제하지 않는다/);
    }
  });

  it('keeps the design system in every convening, not just system-shaped changes', () => {
    const skill = read(SKILL_PATH);
    for (const agent of ALWAYS_ATTENDING) {
      expect(skill, `${agent} must be documented as always attending`).toContain(agent);
    }
    // A decision that never lands in a token is a decision the next person re-makes.
    expect(skill.replace(/\s+/g, ' ')).toMatch(/위계 (and|과) 체계 always attend|위계 and 체계 always attend/);
  });

  it('keeps the rejection rule that an addition-only critique has failed', () => {
    const skill = read(SKILL_PATH).replace(/\s+/g, ' ');
    expect(skill).toMatch(/remove, dim, collapse, or align/i);
    expect(skill, 'the council must record dissent with a falsifier').toMatch(/falsifier/i);
  });

  it('keeps the skill and its cross-tool mirror byte-identical', () => {
    expect(read(SKILL_MIRROR_PATH)).toBe(read(SKILL_PATH));
  });

  it('names every seat agent in the design operating-system doc', () => {
    const doc = read(DESIGN_OS_PATH);
    for (const [, agent] of BENCH) {
      expect(doc, `${DESIGN_OS_PATH} must reference ${agent}`).toContain(agent);
    }
  });
});
