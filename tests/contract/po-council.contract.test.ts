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
 * 2026-08-03 — 티어는 **두 가지를 동시에** 만족해야 한다. 하나만 보면 둘 다 는친다.
 *
 * ① **치명 행은 최상위가 서명한다.** PO OS 가 치명적이라 선언한 네 행(Problem
 *    insight · User moment · Ontology value · Agent value · Verification)을 전부
 *    sonnet 이 서명하고 있었고, 유일한 비치명 행(Differentiation)에만 opus 가
 *    붙어 있었다 — 정확히 뒤집혀 있었다. 특히 지킴이는 2026-07-27 사고(두 치명
 *    행에 「없음」을 쓰고 통과) **때문에 생긴 자리**인데 sonnet 이었다.
 *
 * ② **계열이 갈려 있어야 한다.** ①만 보고 다섯을 전부 opus 로 만들면 카운슬의
 *    **유일한 모델 이질성이 사라진다.** 그건 배심원 다섯이 아니라 「다섯 번 다르게
 *    프롬프트한 심판 하나」다. 실측이 이미 그 방향을 가리켰다 — 원장 7회 · 좌석
 *    판정 35건에서 **평균 쌍별 일치율 65.7%**(우연 기대 36.8%), 7회 중 2회 만장일치.
 *    Verga et al.(arXiv:2404.18796): 이질 3인 패널이 인간과 κ 0.763, 단일 최상위
 *    모델은 0.627 — 게다가 각 모델의 최고 가점은 **자기가 자기를 심사할 때** 나온다.
 *    Panickssery et al.(NeurIPS 2024): 자기 인식과 자기 선호 편향이 선형 상관이라
 *    같은 계열은 같은 편향을 공유한다.
 *
 * 그래서 배치는 **opus 3 · fable 2** 이고, 이종을 받는 둘은 치명 행을 안 가진
 * 자리다(해자=Differentiation 하나, 지렛대=루브릭 행 없음). ①과 ② 를 둘 다
 * 만족하는 유일한 조합이다. 팀장(chief)도 fable — 소집·순서·기록을 지는 결정자다.
 *
 * ⚠️ 이 표를 단일 계열로 되돌리려면 위 ②의 실측부터 반박해야 한다.
 */
const TIERS: Record<string, string> = {
  'po-evidence': 'opus',
  'po-craft': 'opus',
  'po-steward': 'opus',
  'po-wedge': 'fable',
  'po-leverage': 'fable',
};

/**
 * 계열이 최소 둘이어야 한다 — 위 ②. 이 단언이 없으면 다음 사람이 "일관성"을
 * 이유로 한 줄씩 통일해 이질성이 조용히 사라진다(오늘 실제로 그렇게 될 뻔했다).
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
     * 이질성을 사는 대가로 치명 행을 약한 자리에 넘기면 2026-07-27 사고가
     * 재발한다. 두 요구를 **한 테스트로 묶지 않는 이유**: 따로 두어야 어느 쪽이
     * 깨졌는지 실패 메시지가 말해 준다.
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
   * 2026-08-03 — 지킴이가 `npx ontology-atlas init` 을 「진짜 에이전트 핸드오프」의
   * 예시로 들고 있었다. AGENTS.md 는 그 명령을 **404 로 선언**한다(npm 발행이 없다).
   * Agent value 를 단독 소유하고 거짓 면제를 기각하는 자리가, 없는 명령을 처방하고
   * 있었던 것이다.
   *
   * **왜 아무도 못 잡았나**: 원문이 `npx` 와 `ontology-atlas` 사이에서 줄바꿈돼
   * 있어서 한 줄 grep 이 통과시켰다. 그래서 이 게이트는 **공백을 접고** 본다 —
   * 줄바꿈으로 숨는 인용을 잡는 것이 이 단언의 존재 이유다.
   */
  it('never cites the retired npm entrypoint as a real handoff', () => {
    for (const agent of COUNCIL_AGENTS) {
      const folded = agentFile(agent).replace(/\s+/g, ' ');
      const cited = folded.match(/npx ontology-atlas/g) ?? [];
      // 404 라고 **가르치는** 문장은 허용한다 — 금지되는 것은 처방으로 쓰는 것이다.
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
