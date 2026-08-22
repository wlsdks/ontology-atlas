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

/*
 * 2026-08-03 — the tier assignment must satisfy **two things at once**. Looking at
 * only one loses both.
 *
 * ① **Fatal rows are signed by the top tier.** All the rows the PO OS declares fatal
 *    (Problem insight · User moment · Ontology value · Agent value · Verification)
 *    were signed by sonnet, and opus was attached only to the single non-fatal row
 *    (Differentiation) — exactly inverted. In particular the steward seat exists
 *    **because of** the 2026-07-27 accident (writing "없음" into two fatal rows and
 *    passing), and it was sonnet.
 *
 * ② **Model families must be split.** Reading ① alone and making all five opus
 *    removes **the council's only model heterogeneity**, leaving not five jurors but
 *    "one judge prompted five different ways". Measurement already pointed that way:
 *    across 7 ledger rounds and 35 seat verdicts, **mean pairwise agreement 65.7%**
 *    (chance expectation 36.8%), with 2 of 7 unanimous.
 *    Verga et al. (arXiv:2404.18796): a heterogeneous 3-model panel reached κ 0.763
 *    with humans versus 0.627 for a single top model — and each model's highest score
 *    comes **when it judges itself**.
 *    Panickssery et al. (NeurIPS 2024): self-recognition and self-preference bias are
 *    linearly correlated, so one family shares one bias.
 *
 * So the assignment is **3 opus · 2 fable**, and the two that take the other family
 * are the seats with no fatal row (wedge owns Differentiation only; leverage owns no
 * rubric row). It is the only combination satisfying both ① and ②. The chief is
 * fable too — the decider who owns convening, ordering, and the record.
 *
 * ⚠️ Returning this table to a single family requires refuting ②'s measurements
 * first.
 */
const TIERS: Record<string, string> = {
  'po-evidence': 'opus',
  'po-craft': 'opus',
  'po-steward': 'opus',
  'po-wedge': 'fable',
  'po-leverage': 'fable',
};

/**
 * At least two families — ② above. Without this assertion the next person unifies
 * the rows one at a time in the name of consistency and the heterogeneity quietly
 * disappears (it nearly did today).
 */
const MIN_MODEL_FAMILIES = 2;

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

  it('keeps the bench on more than one model family', () => {
    const families = new Set(Object.values(TIERS));
    expect(
      families.size,
      'the council must span at least two model families — a single-family bench is not five ' +
        'jurors, it is one judge prompted five ways (measured: 65.7% mean pairwise verdict ' +
        'agreement over 7 councils, 2 of them unanimous). Verga et al. arXiv:2404.18796.',
    ).toBeGreaterThanOrEqual(MIN_MODEL_FAMILIES);
  });

  it('keeps every fatal rubric row on the top tier', () => {
    /*
     * Buying heterogeneity by handing a fatal row to a weaker seat reproduces the
     * 2026-07-27 accident. **Why the two requirements are not one test**: kept separate,
     * the failure message says which of them broke.
     */
    const FATAL_ROWS = ['Problem insight', 'User moment', 'Ontology value', 'Agent value', 'Verification'];
    for (const row of FATAL_ROWS) {
      const signer = COUNCIL_AGENTS.find((agent) => {
        const body = agentFile(agent);
        const start = body.indexOf('## 네가 소유하는 루브릭 행');
        if (start === -1) return false;
        return body.slice(start, body.indexOf('\n## ', start + 1)).includes(row);
      });
      expect(signer, `fatal rubric row "${row}" must have a signer`).toBeDefined();
      expect(
        TIERS[signer as string],
        `"${row}" is a fatal row — its signer ${signer} must stay on opus`,
      ).toBe('opus');
    }
  });

  /*
   * 2026-08-03 — the steward seat was citing `npx ontology-atlas init` as an example
   * of a real agent handoff. AGENTS.md **declares that command a 404** (there is no
   * npm publication). The seat that solely owns Agent value and rejects false
   * exemptions was prescribing a command that does not exist.
   *
   * **Why nobody caught it**: the source wrapped between `npx` and `ontology-atlas`,
   * so a single-line grep passed it. Hence this gate **folds whitespace** — catching a
   * citation hidden by a line break is why this assertion exists.
   */
  it('never cites the retired npm entrypoint as a real handoff', () => {
    for (const agent of COUNCIL_AGENTS) {
      const folded = agentFile(agent).replace(/\s+/g, ' ');
      const cited = folded.match(/npx ontology-atlas/g) ?? [];
      // A sentence **teaching** that it is a 404 is allowed — what is forbidden is using
      // it as a prescription.
      const taughtAsDead = folded.match(/npx ontology-atlas [^.]{0,40}(404|아니다|없는)/g) ?? [];
      expect(
        cited.length,
        `${agent} cites npx ontology-atlas as if it worked — AGENTS.md declares it a 404`,
      ).toBe(taughtAsDead.length);
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

  /**
   * **Both tools read this skill** (`.claude/skills` ↔ `.agents/skills`, byte
   * identical). But the seat briefs live in `.claude/agents/` only, and Codex does not
   * auto-load that directory — while the skill named the five seats **by name alone**,
   * a Codex session received five names it could neither call nor read and improvised.
   * Making a copy is not the answer (the diverging copy becomes the default). The
   * answer is stating that there is one source and instructing that it be **opened
   * explicitly**, and if that sentence disappears the hole comes straight back.
   */
  it('locates the seat briefs by a relative path that resolves inside each tool tree', () => {
    for (const path of [SKILL_PATH, SKILL_MIRROR_PATH]) {
      const skill = read(path).replace(/\s+/g, ' ');
      // From both `.claude/skills/po-council/` and `.agents/skills/po-council/`,
      // `../../agents/` resolves to that tree's own seat folder. So **one sentence fits
      // both tools** and does not conflict with the byte-identical rule.
      expect(skill, `${path} 가 자리 브리프의 상대 경로를 밝히지 않는다`).toContain(
        '../../agents/po-*.md',
      );
      expect(skill, `${path} 가 셋째 사본 금지를 적지 않는다`).toContain(
        '셋째 사본은 만들지 않는다',
      );
      expect(skill, `${path} 가 순차 수행의 손실을 적지 않는다`).toContain(
        '1라운드 독립성을 잃는다',
      );
    }
  });

  /**
   * **Never branch on tool name.** The two copies of this skill must be byte
   * identical, so a copy cannot carry a different path, and it once carried a table
   * saying "Claude Code here, Codex there". That table ① grew a row per new tool
   * ② made each tool read **someone else's path** and ③ was unnecessary given one
   * relative path. Branching on capability ("can it run subagents in parallel")
   * needs no names at all.
   */
  it('branches on capability, not on tool brand names', () => {
    for (const path of [SKILL_PATH, SKILL_MIRROR_PATH]) {
      const skill = read(path);
      for (const brand of ['Claude Code', 'Codex', 'Cursor', 'Gemini']) {
        expect(skill, `${path} 가 「${brand}」로 분기한다 — 능력으로 분기하라`).not.toContain(
          brand,
        );
      }
      expect(skill, `${path} 가 능력 기준 분기를 적지 않는다`).toContain('서브에이전트');
    }
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

/**
 * The files carrying the plain-language summary discipline — both copies of both
 * skills, plus the chief that writes the record. The list is the reach: a new council
 * adds a line here.
 */
const PLAIN_SUMMARY_FILES = [
  SKILL_PATH,
  SKILL_MIRROR_PATH,
  '.claude/agents/chief.md',
] as const;

/**
 * Council output **starts with a plain-language summary.**
 *
 * Measured 2026-07-29: handing the owner the verdict block verbatim produced the
 * question *"뭔 서명?"* (what signature?). Council vocabulary — seat names, the
 * rubric, falsifiers, signatures — is for the next agent and the ledger, not for the
 * person receiving the result. A report whose reader must learn a dictionary first
 * is not a report.
 *
 * Without this test the discipline lives only in prose, and as this repository has
 * learned repeatedly, **a spec that exists only in a document is not kept.**
 */
describe('카운슬 산출물은 평문 요약으로 시작한다', () => {
  /** The three lines are not negotiable — missing any one forces the owner to ask. */
  const REQUIRED_LINES = ['정한 것', '네 말과 다르게 한 것', '네가 할 일'];

  /**
   * Words not used inside the plain-language section. **The verdict block below must
   * use exactly these words**, so the ban is per section, not per document.
   */
  const BANNED_SAMPLE = ['루브릭', '반증 조건', '서명', 'appetite'];

  /**
   * ⚠️ The judgement applies **inside the template code fence**. Searching the whole
   * file finds the same words in the explanatory prose too, so **deleting them from the
   * template still passes** — which is exactly how this gate leaked when it was first
   * written (found by a probe). "The word appears somewhere in the document" and "the
   * output format requires that line" are different claims.
   */
  const templateOf = (path: string): string => {
    const text = read(path);
    const anchor = text.indexOf('먼저 — 세 줄');
    expect(anchor, `${path} must carry the plain-summary template`).toBeGreaterThan(-1);
    // The anchor sits **inside** the fence (`### 먼저 — 세 줄` is the template's first
    // line). Search backwards for the opening fence and forwards for the closing one —
    // searching only after the anchor mistakes the closing fence for an opening one and
    // ends up checking an empty string.
    const open = text.lastIndexOf('```', anchor);
    const close = text.indexOf('```', anchor);
    expect(open, `${path}의 평문 템플릿 여는 펜스가 없다`).toBeGreaterThan(-1);
    expect(close, `${path}의 평문 템플릿 펜스가 닫히지 않았다`).toBeGreaterThan(anchor);
    return text.slice(open, close);
  };

  it.each(PLAIN_SUMMARY_FILES)('%s 의 템플릿이 세 줄을 모두 요구한다', (path) => {
    const template = templateOf(path);
    for (const line of REQUIRED_LINES) {
      expect(template, `${path} 템플릿에 "${line}" 줄이 없다`).toContain(line);
    }
  });

  it.each(PLAIN_SUMMARY_FILES)('%s 가 평문 요약 절을 싣는다', (path) => {
    const text = read(path);
    expect(text, `${path} must open its output with a plain-language summary`).toContain(
      '사람에게 —',
    );
    expect(text).toContain('먼저 — 세 줄');
    for (const banned of BANNED_SAMPLE) {
      expect(text, `${path} must ban "${banned}" from the plain section`).toContain(banned);
    }
  });

  /**
   * 2026-08-03: the accident happened **while every assertion above passed**. The
   * convener wrote the three-line summary correctly and then pasted the entire verdict
   * block below it, and the owner asked twice ("뭔말이야" · "더 쉽게 설명해줘" — what
   * does this mean, explain it more simply). A gate that checks only for a section's
   * existence **cannot distinguish adding a cover page from translating.** So the three
   * rules that closed the hole are each pinned — if any one of them disappears from the
   * prose, the same accident becomes possible again.
   */
  const HOLE_CLOSING_RULES = [
    ['대화창이 아니다', '평결 블록의 목적지가 파일임을 못박는 문장'],
    ['답 전체에 적용된다', '금지어가 맨 앞 세 줄에만 적용되지 않음을 못박는 문장'],
    ['되물음은 실패 신호다', '되물으면 겹쳐 쓰지 말고 다시 쓰라는 문장'],
  ] as const;

  it.each(PLAIN_SUMMARY_FILES)('%s 가 세 줄을 표지로 쓰지 못하게 막는다', (path) => {
    const text = read(path).replace(/\s+/g, ' ');
    for (const [rule, why] of HOLE_CLOSING_RULES) {
      expect(text, `${path} 에 ${why}("${rule}")이 없다`).toContain(rule);
    }
  });

  /**
   * If the scope was narrowed or widened relative to the request, that line **must** be
   * present. Narrowing without it is not narrowing but silent disregard, which the owner
   * discovers later on the screen.
   */
  it.each(PLAIN_SUMMARY_FILES)('%s 가 "다르게 한 것" 줄을 생략 불가로 못박는다', (path) => {
    expect(read(path).replace(/\s+/g, ' ')).toMatch(/생략할 수 없다/);
  });
});
