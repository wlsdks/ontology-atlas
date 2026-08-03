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
 * 티어는 기본값이 아니라 결정이다. haiku 는 어디에도 없다 — 카운슬은 판정 기구이고
 * haiku 자리는 평결처럼 읽히는 체크리스트 앵무새를 낸다(부재보다 나쁘다).
 *
 * **2026-08-03 개정 — 소유자 지시** *"다 opus가 해도됨! 가장 높은 결정 필요한건
 * fable로"*. 그 지시는 PO 5석에만 적용되고 디자인 벤치는 8석 중 6석이 sonnet 으로
 * 남아 있었다. 같은 규칙으로 맞춘다.
 *
 * **fable 은 「항상 참석하는 두 자리」다.** 스킬이 *위계와 체계는 빠질 수 없다* 고
 * 못박은 그 둘이고, 이유가 티어와 같다 — 「위계」는 **무엇이 주목을 이기는가**를
 * 정하고 나머지 판정이 전부 그 뒤에 온다. 「체계」는 결정을 **토큰·lint·계약
 * 테스트**로 굳혀서 되돌리기가 가장 비싸다. PO 가 5석 중 2석에 fable 을 둔 것과
 * 같은 비율이고 같은 논거다.
 *
 * ⚠️ **단일 계열로 되돌리지 않는다.** PO 쪽 실측이 여기에도 적용된다 — 원장 7회 ·
 * 좌석 판정 35건에서 평균 쌍별 일치율 65.7%(우연 기대 36.8%). 한 계열로 통일하면
 * 여덟 자리가 아니라 「여덟 번 다르게 프롬프트한 심판 하나」다
 * (Verga et al. arXiv:2404.18796 · Panickssery et al. NeurIPS 2024).
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

/** 계열이 최소 둘 — 위 ⚠️. 없으면 다음 사람이 「일관성」을 이유로 통일해 버린다. */
const MIN_MODEL_FAMILIES = 2;

/** Measuring seats must run their instrument; the skill has to say so. */
const INSTRUMENTS = ['motion-verify', 'responsive-sweep', 'design-audit'];

/**
 * 반려 근거로 쓰면 안 되는 원칙, 그리고 그 자리를 대신하는 것.
 *
 * data-ink 는 이 벤치에서 오랫동안 「이 잉크는 데이터가 아니다 → 반려」 로 쓰였다.
 * 그런데 그 규칙은 실험이 안 받쳐 준다 — Inbar 외(ECCE 2007)의 87명은 Tufte
 * 미니멀 판보다 표준 막대를 뚜렷이 선호했고, Bateman 외(CHI 2010)의 장식 차트는
 * 서술 정확도가 안 떨어지고 2~3주 뒤 회상은 오히려 유의하게 나았다.
 *
 * 이 저장소가 **실제로 쓰던 규칙**은 처음부터 Mackinlay expressiveness 였다
 * (「마크 → 사실 대응표」가 정확히 그 판정이다). 인용만 틀렸던 것이다.
 * 그래픽 정직성과 직접 라벨링은 저 두 논문이 건드리지 않았으므로 Tufte 로 남는다.
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
    // Its single defining property: it is not the party that wants to build.
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

  it('names every seat agent in the design operating-system doc', () => {
    const doc = read(DESIGN_OS_PATH);
    for (const [, agent] of BENCH) {
      expect(doc, `${DESIGN_OS_PATH} must reference ${agent}`).toContain(agent);
    }
  });
});

/**
 * 평문 요약 규율을 실은 파일들 — 두 스킬의 양쪽 사본과, 기록을 쓰는 chief.
 * 목록이 곧 사정거리다: 새 카운슬을 만들면 여기 한 줄을 더한다.
 */
const PLAIN_SUMMARY_FILES = [
  SKILL_PATH,
  SKILL_MIRROR_PATH,
  '.claude/agents/chief.md',
] as const;

/**
 * 카운슬 산출물은 **평문 요약으로 시작한다.**
 *
 * 이 저장소가 실측으로 배운 것(2026-07-29): 평결 블록을 그대로 소유자에게
 * 전달했더니 되물었다 — *"뭔 서명?"*. 카운슬 어휘(자리 이름 · 루브릭 · 반증
 * 조건 · 서명)는 다음 에이전트와 원장을 위한 것이지 결과를 받는 사람을 위한
 * 것이 아니다. 읽는 쪽이 사전을 먼저 배워야 하는 보고는 보고가 아니다.
 *
 * 이 테스트가 없으면 그 규율은 산문으로만 남고, 이 저장소가 반복해 배운 대로
 * **문서에만 있는 규격은 지켜지지 않는다.**
 */
describe('카운슬 산출물은 평문 요약으로 시작한다', () => {
  /** 세 줄은 협상 대상이 아니다 — 하나라도 빠지면 소유자가 물어봐야 한다. */
  const REQUIRED_LINES = ['정한 것', '네 말과 다르게 한 것', '네가 할 일'];

  /**
   * 평문 절 안에서 쓰지 않는 말. **아래 평결 블록에서는 정확히 이 단어들이어야
   * 하므로** 금지는 절 단위이지 문서 단위가 아니다.
   */
  const BANNED_SAMPLE = ['루브릭', '반증 조건', '서명', 'appetite'];

  /**
   * ⚠️ 판정 대상은 **템플릿 코드 펜스 안**이다. 파일 전체에서 문구를 찾으면,
   * 같은 말이 설명 산문에도 있어서 **템플릿에서 지워도 통과한다** — 이 게이트를
   * 처음 쓸 때 실제로 그렇게 새어나갔다(프로브로 발견). 문서 어딘가에 단어가
   * 있다는 것과 산출물 형식이 그 줄을 요구한다는 것은 다른 주장이다.
   */
  const templateOf = (path: string): string => {
    const text = read(path);
    const anchor = text.indexOf('먼저 — 세 줄');
    expect(anchor, `${path} must carry the plain-summary template`).toBeGreaterThan(-1);
    // 앵커는 펜스 **안**에 있다(`### 먼저 — 세 줄` 이 템플릿의 첫 줄이므로).
    // 앞으로 뒤져 여는 펜스를, 뒤로 뒤져 닫는 펜스를 찾는다 — 앵커 뒤에서만
    // 찾으면 닫는 펜스를 여는 펜스로 오인해 빈 문자열을 검사하게 된다.
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
      '사람에게 — 평문 요약',
    );
    expect(text).toContain('먼저 — 세 줄');
    for (const banned of BANNED_SAMPLE) {
      expect(text, `${path} must ban "${banned}" from the plain section`).toContain(banned);
    }
  });

  /**
   * 요청보다 좁히거나 넓혔으면 그 줄이 **반드시** 있다. 그 줄 없는 축소는
   * 축소가 아니라 조용한 무시이고, 소유자가 나중에 화면에서 발견하게 된다.
   */
  it.each(PLAIN_SUMMARY_FILES)('%s 가 "다르게 한 것" 줄을 생략 불가로 못박는다', (path) => {
    expect(read(path).replace(/\s+/g, ' ')).toMatch(/생략할 수 없다/);
  });
});

/**
 * 발산 단계 (`/design-directions`, 2026-08-03).
 *
 * 카운슬은 **serial** 이다 — R1 비평 → R2 교차비평 → R3 평결이 전부 이미
 * 만들어진 하나를 평가한다. Dow et al.(ACM TOCHI 2010)이 실험으로 보인 것은
 * 그 반대다: 여러 개를 만든 뒤 피드백을 받는 쪽이 결과 품질·발산·자기효능감
 * **셋 다** 우월했다. 그 발산 단계가 통째로 없었다.
 *
 * 이 게이트가 지키는 것은 스킬의 **문장이 아니라 세 가지 구조**다 — 근거가
 * 붙어 있는가, 발산 소유자가 짓는 쪽이 아닌가, 현행이 후보에 들어가는가.
 */
describe('발산 단계 — /design-directions', () => {
  const DIRECTIONS_SKILL = '.claude/skills/design-directions/SKILL.md';
  const DIRECTIONS_MIRROR = '.agents/skills/design-directions/SKILL.md';

  it('스킬과 미러가 바이트 동일하다', () => {
    expect(read(DIRECTIONS_SKILL)).toBe(read(DIRECTIONS_MIRROR));
  });

  it('학술 근거를 달고 있다 — 취향이 아니라 실험 결과다', () => {
    const skill = read(DIRECTIONS_SKILL).replace(/\s+/g, ' ');
    // 저자 목록 길이에 걸리지 않게 **두 사실을 따로** 본다 — 인용 형식이 바뀌어도
    // 근거가 남아 있으면 통과해야 한다(문장 핀을 만들지 않는다).
    expect(skill, '저자를 밝혀야 한다').toContain('Dow');
    expect(skill, '발행처와 연도를 밝혀야 한다').toContain('TOCHI 2010');
    expect(skill, 'serial 과 대비해야 근거가 우리 프로토콜에 붙는다').toContain('serial');
  });

  /*
   * 이 단언이 이 파일에서 가장 중요하다. 짓고 싶어 하는 쪽이 선택지를 만들면
   * 나머지 갈래가 허수아비가 되고, 그 순간 발산은 변경을 정당화하는 의식이 된다
   * — 카운슬을 만든 이유와 같은 실패다.
   */
  it('벤치가 한 모델 계열로 수렴하지 않는다', () => {
    // 이 단언이 없으면 다음 사람이 「일관성」을 이유로 한 줄씩 통일해 이질성이
    // 조용히 사라진다 — PO 카운슬에서 실제로 그렇게 될 뻔했다.
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
    // 현행이 없으면 「바꾸지 않는다」가 이길 수 없고, 그러면 절차가 아니라 의식이다.
    expect(read(DIRECTIONS_SKILL).replace(/\s+/g, ' ')).toMatch(
      /하나는 [「"']?지금 그대로[」"']?/,
    );
  });

  it('카운슬 스킬이 이 단계를 자기 앞 순서로 가리킨다', () => {
    // 순서가 뒤집히면 카운슬이 갈래 탐색을 대신하게 된다 — 2026-08-03 에 실제로 그랬다.
    expect(read(SKILL_PATH), 'design-council 이 발산 단계를 앞 순서로 가리켜야 한다').toContain(
      'design-directions',
    );
  });
});

/**
 * 근거의 무결성 — **반박된 규칙이 반려 근거로 돌아오는 것**을 막는다.
 *
 * 이 게이트가 없으면 다음 사람이 "Tufte data-ink → 반려" 를 아무 저항 없이 다시
 * 쓴다. 그게 더 익숙한 문장이고, 반박이 문서 한 곳에만 적혀 있으면 그 문서를 안
 * 읽은 사람에게는 존재하지 않기 때문이다. 이 저장소의 반복 교훈: **문서에만 있는
 * 규격은 지켜지지 않는다.**
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
   * ★ 판정은 **줄 단위**여야 한다.
   *
   * 첫 판은 「파일이 data-ink 를 언급하면 파일 어딘가에 Mackinlay 도 있어야 한다」
   * 였는데, 프로브를 걸어 보니 **빨개지지 않았다** — 출처 목록에 이름만 남기고
   * 규칙은 옛것으로 되돌리면 그대로 통과했다. 이 저장소가 이미 이름 붙여 둔
   * 실패다: **면제는 방향이 있다.** 「정상 사용을 살린다」는 면제가 「비정상
   * 사용도 살린다」가 되는지 켤 때 함께 물어야 한다.
   *
   * 그래서 지금은 **data-ink 가 등장하는 줄 자체**가 그것을 부정해야 한다.
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
    // 반박이 «우리 의견» 이면 다음 소집에서 취향 다툼이 된다. 논문이어야 끝난다.
    const foundations = read('docs/FOUNDATIONS.md');
    expect(foundations, 'Inbar 외(ECCE 2007) — data-ink 선호가 재현되지 않았다').toContain('Inbar');
    expect(foundations, 'Bateman 외(CHI 2010) — 장식이 회상을 오히려 높였다').toContain('Bateman');
    expect(foundations, '대체 규칙의 원전').toContain(REPLACEMENT_RULE);
    // 그래픽 정직성과 직접 라벨링은 반박되지 않았다 — 통째로 버리면 그것도 틀렸다.
    expect(foundations, 'Tufte 를 통째로 버리지 않는다').toContain('graphical integrity');
  });

  it('도해석이 반려 근거로 대체 규칙을 지목한다', () => {
    // 이 자리가 마크를 반려하는 유일한 자리다. 여기가 옛 근거를 쓰면 나머지는 무의미하다.
    const seat = agentFile('design-infoviz').replace(/\s+/g, ' ');
    expect(seat).toMatch(/반려할 때 대는 근거/);
    expect(seat).toContain(REPLACEMENT_RULE);
    // 그리고 옛 근거를 **금지**로 못박는다. 위 줄 단위 검사만으로는 부족하다 —
    // 반박 문단 안에서 「쓰지 마라」만 「쓴다」로 뒤집는 반쪽 편집이 통과했다(프로브 실측).
    expect(seat, '도해석은 data-ink 를 반려 근거로 쓰지 말라고 명시해야 한다').toMatch(
      new RegExp(`${REFUTED_RULE}[^.]{0,40}반려 근거로 쓰지 마라`),
    );
  });
});

/**
 * 규격 변경 트리거 — **「체계」를 부르는 조건이 문서에 살아 있는가.**
 *
 * 2026-08-03: 컨트롤 244개를 정규화하는 동안 `design-system` 이 한 번도 소집되지
 * 않았다. 값 층 설계를 짓는 쪽이 단독으로 정했고, 결과가 화면에 나왔다 — 칩 크기
 * 50종을 3종으로 줄였는데 한 화면에 컨트롤 높이가 8~9종이다.
 *
 * ⚠️ **「소집했는가」는 기계가 못 본다.** 이 게이트가 잡는 것은 규칙이 존재하고
 * 그 자리를 이름으로 가리키는가뿐이다. 그것만으로도 값이 있다 — 규칙이 사라지면
 * 다음 사람은 규칙이 있었다는 사실조차 모른다.
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
