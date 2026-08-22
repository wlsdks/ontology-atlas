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
  ['Responsive & Touch Designer', 'design-responsive'],
  ['Agent Handoff Designer', 'design-handoff'],
];

/** Decides and applies. Never a seat — same rule as Accountable Value Owner. */
const DECIDER_AGENT = 'design-guardian';

/** Seats that cannot be skipped: one names the winner, one makes it enforceable. */
const ALWAYS_ATTENDING = ['design-lead', 'design-system'];

/**
 * A tier is a decision, not a default. haiku appears nowhere — a council is a
 * judging body, and a haiku seat produces checklist parroting that reads like a
 * verdict (worse than an absent seat).
 *
 * **Revised 2026-08-03, owner's instruction**: *"다 opus가 해도됨! 가장 높은 결정
 * 필요한건 fable로"* (opus can do all of it; use fable where the highest-stakes
 * decision is needed). That instruction had only been applied to the 5 PO seats,
 * leaving 6 of the design bench's 8 on sonnet. This aligns them under the same
 * rule.
 *
 * **fable goes to the two seats that always attend** — the two the skill pins as
 * unable to be skipped, and the reason is the same as the tier: 위계 (hierarchy)
 * decides **what wins attention**, and every other verdict comes after it; 체계
 * (the design system) hardens a decision into **tokens, lint, and contract
 * tests**, making it the most expensive to reverse. Same ratio and same argument as
 * the PO council putting fable on 2 of 5 seats.
 *
 * ⚠️ **Do not collapse back to a single model family.** The PO-side measurement
 * applies here too — across 7 ledger entries and 35 seat verdicts, mean pairwise
 * agreement was 65.7% (chance expectation 36.8%). Unified on one family this is not
 * eight seats but one judge prompted eight different ways (Verga et al.
 * arXiv:2404.18796 · Panickssery et al. NeurIPS 2024).
 */
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

/** At least two model families — see the ⚠️ above. Without this, the next person unifies them for "consistency". */
const MIN_MODEL_FAMILIES = 2;

/** Measuring seats must run their instrument; the skill has to say so. */
const INSTRUMENTS = ['motion-verify', 'responsive-sweep', 'design-audit'];

/**
 * The principle that must not be used as grounds for rejection, and what replaces
 * it.
 *
 * data-ink was long used on this bench as "this ink is not data → reject". The
 * experiments do not support that rule: Inbar et al. (ECCE 2007), n=87, clearly
 * preferred standard bars over Tufte-minimal versions, and Bateman et al.
 * (CHI 2010) found decorated charts no worse on description accuracy and
 * significantly better on recall after 2–3 weeks.
 *
 * The rule this repository was **actually applying** was Mackinlay expressiveness
 * all along (the "mark → fact" mapping table is exactly that verdict) — only the
 * citation was wrong. Graphical integrity and direct labelling were untouched by
 * those two papers, so they stay with Tufte.
 */
const REFUTED_RULE = 'data-ink';
const REPLACEMENT_RULE = 'Mackinlay';

/**
 * The diet has to be enforced, or it decays back into manifestos. Byte budget,
 * not line count: these briefs are Korean, where one character costs 3 bytes,
 * so 9,000B is roughly 3,000 characters — enough for a dense operating
 * procedure, not enough to re-paste the charter the subagent already receives.
 */
const MAX_AGENT_BYTES = 9_000;

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

  it('assigns every seat a deliberate model tier', () => {
    for (const [, agent] of BENCH) {
      const frontmatter = agentFile(agent).split('---')[1] ?? '';
      expect(frontmatter, `${agent} must declare a model tier`).toContain(`model: ${TIERS[agent]}`);
      expect(frontmatter, `${agent} must not be a haiku seat`).not.toContain('model: haiku');
    }
  });

  it('keeps every seat brief under the size budget', () => {
    for (const [, agent] of BENCH) {
      const bytes = Buffer.byteLength(agentFile(agent), 'utf8');
      expect(
        bytes,
        `${agent} is ${bytes}B — every line is a recurring token cost on each convening; ` +
          'the charter and the operating-system docs are already auto-loaded, so do not restate them',
      ).toBeLessThanOrEqual(MAX_AGENT_BYTES);
    }
  });

  it('makes the measuring seats run their instrument without being asked', () => {
    const skill = read(SKILL_PATH);
    for (const instrument of INSTRUMENTS) {
      expect(
        skill,
        `the skill must name /${instrument} so the seat runs it autonomously — ` +
          'a step that only happens when a human remembers it does not exist',
      ).toContain(instrument);
    }
  });

  it('carries the bounded cross-council query protocol', () => {
    const skill = read(SKILL_PATH).replace(/\s+/g, ' ');
    expect(skill).toContain('카운슬 간 질의');
    // Unbounded chat is the failure mode; the terminator is what prevents it.
    expect(skill).toContain('무응답 시 가정');
    expect(skill).toMatch(/답은 1회, 재질문 없음/);
  });

  it('watches chief — the only component no test watched, which is how it drifted', () => {
    const chief = read('.claude/agents/chief.md');
    const frontmatter = chief.split('---')[1] ?? '';
    expect(frontmatter).toContain('name: chief');
    expect(frontmatter, 'the head runs on the strongest model').toContain('model: fable');
    // Its single defining property: it is not the one who builds it.
    expect(frontmatter, 'chief must not be able to edit code').not.toMatch(/\bEdit\b/);
    expect(frontmatter, 'chief must not be able to write files').not.toMatch(/\bWrite\b/);
    // The seat count drifted here for a day while 27 assertions stayed green.
    expect(chief, `chief must know the bench is ${BENCH.length} seats`).toContain(
      `${BENCH.length}석`,
    );
    // The four named conflict rules are what stop it resolving by fresh opinion.
    for (const rule of ['최소 슬라이스', '헌장 우선', '합집합 금지', '제거 요구']) {
      expect(chief, `chief must name the "${rule}" rule`).toContain(rule);
    }
    // The turn budget was listed as a guard and never actually written down.
    expect(chief, 'the anti-bureaucracy budget must be stated, not implied').toMatch(
      /턴은 최대 2개|최대 2턴/,
    );
    // It records; it does not decide.
    expect(chief).toContain('docs/DECISIONS.md');
  });

  it('makes the applier re-measure its own last mile', () => {
    // Round-1 instruments measured the pre-verdict build. Nothing measured the
    // result of the guardian's own edits until now.
    expect(read('.claude/agents/design-guardian.md')).toMatch(/적용 후 다시 잰다/);
  });

  it('keeps felt first impression in 위계 and the depth grammar in 체계', () => {
    // Affect belongs to one seat. Distributed across the bench nobody signs it,
    // and five metrology seats correctly have no vocabulary for it.
    expect(agentFile('design-lead')).toContain('첫인상');
    // Static depth (2D reading as 3D) had no owner at all: the charter bans every
    // cheap depth trick and never said what is legal, which is how a model
    // defaults to timid flatness.
    const system = agentFile('design-system');
    expect(system).toContain('깊이 문법');
    expect(
      system,
      'shadows-off legibility is the enforceable core — in a dark UI elevation is surface lightness, not shadow',
    ).toMatch(/그림자를 끄/);
  });

  it('makes the decision ledger readable, not just writable', () => {
    const skill = read(SKILL_PATH);
    expect(skill, 'the skill must point at the ledger').toContain('docs/DECISIONS.md');
    expect(skill, 'convening must start by reading prior decisions').toMatch(/소집 전/);
    expect(read('docs/DECISIONS.md')).toContain('반증 조건');
  });

  it('keeps the skill and its cross-tool mirror byte-identical', () => {
    expect(read(SKILL_MIRROR_PATH)).toBe(read(SKILL_PATH));
  });

  /**
   * Byte-identical is not enough. Both tools read the **same file**, but if that
   * file names the seat briefs by name only, a Codex session receives names it can
   * neither invoke nor read (`.claude/agents/` is not auto-loaded there). Making a
   * third copy is not the answer: the answer is stating that there is one source and
   * telling the reader to open it explicitly — and stating that a measuring seat on a
   * runtime that cannot open a browser must **defer rather than judge by eye**.
   */
  it('locates the seat briefs by a relative path that resolves inside each tool tree', () => {
    for (const path of [SKILL_PATH, SKILL_MIRROR_PATH]) {
      const skill = read(path).replace(/\s+/g, ' ');
      // From both `.claude/skills/design-council/` and `.agents/skills/design-council/`,
      // `../../agents/` resolves to that tree's own seat folder.
      expect(skill, `${path} 가 자리 브리프의 상대 경로를 밝히지 않는다`).toContain(
        '../../agents/design-*.md',
      );
      expect(skill, `${path} 가 셋째 사본 금지를 적지 않는다`).toContain(
        '셋째 사본은 만들지 않는다',
      );
      expect(skill, `${path} 가 순차 수행의 손실을 적지 않는다`).toContain(
        '1라운드 독립성을 잃는다',
      );
      expect(skill, `${path} 가 계측 불가 런타임의 보류 규칙을 적지 않는다`).toContain(
        '판정을 보류',
      );
    }
  });

  /**
   * Branching on tool brand names would need a different path per copy, but the two
   * copies of this skill must be byte-identical. A relative path plus a
   * capability-based branch needs no names — and does not grow when a new tool
   * appears.
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

  it('names every seat agent in the design operating-system doc', () => {
    const doc = read(DESIGN_OS_PATH);
    for (const [, agent] of BENCH) {
      expect(doc, `${DESIGN_OS_PATH} must reference ${agent}`).toContain(agent);
    }
  });
});

/**
 * The files carrying the plain-summary discipline — both copies of the skills, and
 * chief, which writes the record. The list is the reach: a new council adds a row.
 */
const PLAIN_SUMMARY_FILES = [
  SKILL_PATH,
  SKILL_MIRROR_PATH,
  '.claude/agents/chief.md',
] as const;

/**
 * Council output **opens with a plain-language summary.**
 *
 * Measured 2026-07-29: a verdict block was relayed to the owner verbatim and the
 * reply was *"뭔 서명?"* ("what signature?"). Council vocabulary — seat names,
 * rubric, falsifier, signature — is for the next agent and for the ledger, not for
 * the person receiving the result. A report whose reader must first learn a
 * dictionary is not a report.
 *
 * Without this test the discipline lives only in prose, and as this repository has
 * repeatedly learned, **a spec that exists only in a document is not followed.**
 */
describe('카운슬 산출물은 평문 요약으로 시작한다', () => {
  /** The three lines are not negotiable — drop any one and the owner has to ask. */
  const REQUIRED_LINES = ['정한 것', '네 말과 다르게 한 것', '네가 할 일'];

  /**
   * Words not used inside the plain section. The ban is per section, not per
   * document, **because the verdict block below must use exactly these words.**
   */
  const BANNED_SAMPLE = ['루브릭', '반증 조건', '서명', 'appetite'];

  /**
   * ⚠️ The subject of judgement is **inside the template code fence**. Searching the
   * whole file finds the same words in the explanatory prose, so **deleting them from
   * the template still passes** — which is how this gate leaked when it was first
   * written (found by probe). "The word appears somewhere in the document" and "the
   * output format requires that line" are different claims.
   */
  const templateOf = (path: string): string => {
    const text = read(path);
    const anchor = text.indexOf('먼저 — 세 줄');
    expect(anchor, `${path} must carry the plain-summary template`).toBeGreaterThan(-1);
    // The anchor sits **inside** the fence (`### 먼저 — 세 줄` is the template's first
    // line). Search backwards for the opening fence and forwards for the closing one —
    // searching only after the anchor mistakes the closing fence for the opening one
    // and ends up checking an empty string.
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
   * 2026-08-03: the incident happened **while every assertion above passed**. (It
   * happened in the PO council, but the two councils share this section's text, so
   * the hole was shared too.) The convener wrote the three-line summary correctly and
   * then pasted the whole verdict block underneath, and the owner had to ask twice. A
   * gate that only checks the section exists **cannot distinguish adding a cover page
   * from translating.** So each of the three hole-closing rules is pinned
   * separately.
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
   * If the work was narrowed or widened relative to the request, that line **must**
   * be present. A reduction without it is not a reduction but silent disregard, and
   * the owner finds out later, on screen.
   */
  it.each(PLAIN_SUMMARY_FILES)('%s 가 "다르게 한 것" 줄을 생략 불가로 못박는다', (path) => {
    expect(read(path).replace(/\s+/g, ' ')).toMatch(/생략할 수 없다/);
  });
});

/**
 * The divergence stage (`/design-directions`, 2026-08-03).
 *
 * The council is **serial**: R1 critique → R2 cross-critique → R3 verdict, all
 * evaluating one thing that was already built. Dow et al. (ACM TOCHI 2010) showed
 * experimentally the opposite — producing several and then taking feedback was
 * superior on **all three** of outcome quality, divergence, and self-efficacy. That
 * divergence stage was missing entirely.
 *
 * What this gate guards is not the skill's **sentences but three structures**: is
 * the evidence attached, is the divergence owner someone other than the builder,
 * and is the status quo among the candidates.
 */
describe('발산 단계 — /design-directions', () => {
  const DIRECTIONS_SKILL = '.claude/skills/design-directions/SKILL.md';
  const DIRECTIONS_MIRROR = '.agents/skills/design-directions/SKILL.md';

  it('스킬과 미러가 바이트 동일하다', () => {
    expect(read(DIRECTIONS_SKILL)).toBe(read(DIRECTIONS_MIRROR));
  });

  it('학술 근거를 달고 있다 — 취향이 아니라 실험 결과다', () => {
    const skill = read(DIRECTIONS_SKILL).replace(/\s+/g, ' ');
    // Check **two facts separately** so the assertion does not depend on the length of
    // the author list — a changed citation format must still pass while the evidence
    // remains (do not pin sentences).
    expect(skill, '저자를 밝혀야 한다').toContain('Dow');
    expect(skill, '발행처와 연도를 밝혀야 한다').toContain('TOCHI 2010');
    expect(skill, 'serial 과 대비해야 근거가 우리 프로토콜에 붙는다').toContain('serial');
  });

  /*
   * The most important assertion in this file. When the builder authors the options,
   * the other directions become straw men and divergence turns into a ritual that
   * justifies the change — the same failure the council exists to prevent.
   */
  it('벤치가 한 모델 계열로 수렴하지 않는다', () => {
    // Without this assertion the next person unifies the rows one at a time for
    // "consistency" and the heterogeneity quietly disappears — which nearly happened
    // in the PO council.
    expect(
      new Set(Object.values(TIERS)).size,
      '여덟 자리가 한 계열이면 배심원 여덟이 아니라 여덟 번 다르게 프롬프트한 심판 하나다 ' +
        '(실측: 좌석 판정 35건 평균 쌍별 일치율 65.7% · Verga et al. arXiv:2404.18796)',
    ).toBeGreaterThanOrEqual(MIN_MODEL_FAMILIES);
  });

  it('갈래를 그리는 자리가 짓는 자리와 분리돼 있다', () => {
    const skill = read(DIRECTIONS_SKILL).replace(/\s+/g, ' ');
    expect(skill, '발산 소유자를 chief 로 명시해야 한다').toMatch(
      /소유자는 [`*]*chief/,
    );
    expect(skill, `${DECIDER_AGENT}(짓는 쪽)이 소유자가 아님을 명시해야 한다`).toContain(
      DECIDER_AGENT,
    );
  });

  it('현행이 후보에 들어가는 것을 규율로 못박는다', () => {
    // Without the status quo, "change nothing" cannot win, and then it is a ritual rather than a procedure.
    expect(read(DIRECTIONS_SKILL).replace(/\s+/g, ' ')).toMatch(
      /하나는 [「"']?지금 그대로[」"']?/,
    );
  });

  it('카운슬 스킬이 이 단계를 자기 앞 순서로 가리킨다', () => {
    // Reverse the order and the council ends up doing the exploration itself — which is what happened on 2026-08-03.
    expect(read(SKILL_PATH), 'design-council 이 발산 단계를 앞 순서로 가리켜야 한다').toContain(
      'design-directions',
    );
  });
});

/**
 * Evidence integrity — stops **a refuted rule returning as grounds for rejection.**
 *
 * Without this gate the next person writes "Tufte data-ink → reject" again with no
 * resistance: it is the more familiar sentence, and a refutation recorded in one
 * document does not exist for anyone who has not read that document. This
 * repository's recurring lesson: **a spec that exists only in a document is not
 * followed.**
 */
describe('근거 무결성 — data-ink 는 반려 근거가 아니다', () => {
  const CITING_FILES = [
    ...BENCH.map(([, agent]) => join('.claude/agents', `${agent}.md`)),
    join('.claude/agents', `${DECIDER_AGENT}.md`),
    SKILL_PATH,
    SKILL_MIRROR_PATH,
    'docs/DESIGN-SYSTEM.md',
  ];

  /**
   * The verdict must be **per line**.
   *
   * The first version was "if a file mentions data-ink, Mackinlay must appear
   * somewhere in the file", and a probe showed it **did not turn red**: leaving the
   * name in a source list while reverting the rule to the old one passed. That is a
   * failure this repository has already named: **an exemption has a direction.** When
   * switching one on, ask whether "keep legitimate use alive" also becomes "keep
   * illegitimate use alive".
   *
   * So now **the line where data-ink appears** must itself negate it.
   */
  const NEGATION = /반박|쓰지 마라|아니다|\bnot\b|\bNot\b/;

  it.each(CITING_FILES)('%s — data-ink 가 나오는 줄은 그것을 부정한다', (path) => {
    const offenders = read(path)
      .split('\n')
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => line.includes(REFUTED_RULE) && !NEGATION.test(line));
    expect(
      offenders,
      `${path}: data-ink 를 부정 없이 쓰는 줄이 있다 — 다음 사람은 이걸 반려 근거로 읽는다. ` +
        `대체 규칙은 ${REPLACEMENT_RULE} expressiveness 다.\n` +
        offenders.map(([n, l]) => `  ${n}: ${l.trim().slice(0, 100)}`).join('\n'),
    ).toEqual([]);
  });

  it('FOUNDATIONS 가 반박 근거를 인용으로 들고 있다', () => {
    // If the refutation is "our opinion" the next convening turns into a taste
    // argument. Only a paper ends it.
    const foundations = read('docs/FOUNDATIONS.md');
    expect(foundations, 'Inbar 외(ECCE 2007) — data-ink 선호가 재현되지 않았다').toContain('Inbar');
    expect(foundations, 'Bateman 외(CHI 2010) — 장식이 회상을 오히려 높였다').toContain('Bateman');
    expect(foundations, '대체 규칙의 원전').toContain(REPLACEMENT_RULE);
    // Graphical integrity and direct labelling were not refuted — discarding Tufte wholesale is equally wrong.
    expect(foundations, 'Tufte 를 통째로 버리지 않는다').toContain('graphical integrity');
  });

  it('도해석이 반려 근거로 대체 규칙을 지목한다', () => {
    // This is the only seat that rejects a mark. If it cites the old rule, the rest is moot.
    const seat = agentFile('design-infoviz').replace(/\s+/g, ' ');
    expect(seat).toMatch(/반려할 때 대는 근거/);
    expect(seat).toContain(REPLACEMENT_RULE);
    // And pin the old rule as **forbidden**. The per-line check above is not enough: a
    // half edit that flips only "쓰지 마라" to "쓴다" inside the refutation paragraph
    // passed (measured by probe).
    expect(seat, '도해석은 data-ink 를 반려 근거로 쓰지 말라고 명시해야 한다').toMatch(
      new RegExp(`${REFUTED_RULE}[^.]{0,40}반려 근거로 쓰지 마라`),
    );
  });
});

/**
 * Spec-change trigger — **is the condition for convening 체계 still in the docs?**
 *
 * 2026-08-03: across the normalisation of 244 controls, `design-system` was never
 * convened once. The builder decided the value-layer design alone, and the result
 * reached the screen — chip sizes went from 50 variants to 3, yet one screen
 * carries 8–9 distinct control heights.
 *
 * ⚠️ **A machine cannot see whether the seat was convened.** All this gate catches
 * is whether the rule exists and names that seat. That alone is worth having: once
 * the rule disappears, the next person does not even know there was one.
 */
describe('규격 변경은 「체계」를 부른다', () => {
  const TRIGGER_FILES = [
    'src/shared/ui/control-class.ts',
    'app/globals.css',
  ] as const;

  it.each(['.claude/rules/design.md', '.claude/skills/design-build/SKILL.md'])(
    '%s 가 트리거와 자리를 함께 적는다',
    (path) => {
      const doc = read(path);
      expect(doc, '소집 대상 자리를 이름으로 가리켜야 한다').toContain('design-system');
      for (const file of TRIGGER_FILES) {
        expect(doc, `트리거 목록에 ${file} 이 없다`).toContain(file);
      }
    },
  );

  it('왜 이 규칙이 생겼는지 실측으로 남긴다 — 없으면 다음 사람이 지운다', () => {
    const rule = read('.claude/rules/design.md');
    expect(rule).toMatch(/244/);
    expect(rule, '혼자 정한 규격이 왜 안 되는지가 남아야 한다').toMatch(/취향/);
  });
});
