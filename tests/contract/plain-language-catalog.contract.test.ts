import { describe, expect, it } from 'vitest';

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import en from '../../messages/en.json';
import ko from '../../messages/ko.json';
import { GLOSSARY_TERMS, type GlossaryTerm } from '../../src/shared/config/term-glossary';

/**
 * **Every string a person reads is scanned, not four hand-picked namespaces.**
 *
 * ## Why this file exists (measured 2026-08-31)
 *
 * `topology-plain-language.contract.test.ts` owns a denylist of words this
 * repository invented, and it is the right denylist. What it could not do is
 * find them: it stringified **four** namespaces (`topology.nodeDatasheet`,
 * `topology.realm`, `edgeTypesPlain`, `fullDetailA1`) out of a catalogue of
 * roughly 3,700 strings. A full-tree sweep for its own seven terms found seven
 * more leaks it had no way to see, including the relation names in the panel
 * opened by the "edit this relation" action, and two facts on the public download
 * page, which is a stranger's first impression of the product.
 *
 * So the unit of judgement here is the **whole `ko` tree**, the way
 * `user-facing-vocabulary.contract.test.ts` already treats its own terms. The
 * older file keeps its four-namespace assertion (a narrower claim stays true)
 * and adds nothing; this one is the catalogue-wide net.
 *
 * ## Three separate failures, three gates
 *
 * | Gate | Failure it catches |
 * |---|---|
 * | Internal vocabulary | A word this repository invented reaches a label |
 * | Untranslated English | A Korean screen shows a sentence nobody translated |
 * | Unexplained term | `MCP` / `ACP` / `CLI` has no glossary entry or no screen draws its `TermHint` |
 *
 * ## Why ratchets and not bans
 *
 * Same reason as every other copy gate here: some of these words have honest
 * uses. The word for "violation" is ordinary Korean for a rule violation and the
 * architecture screen means exactly that; the word for the guard an agent must
 * pass is a real product concept that seven strings currently lean on. Freezing
 * them at today's count lets the number fall and refuses to let it rise. **When a number falls, lower its baseline with it** —
 * otherwise every repair becomes new headroom.
 *
 * Nothing here pins a sentence. Each gate counts occurrences and names the key,
 * which is the mechanical-inventory shape `.claude/rules/documentation.md`
 * permits.
 */

type Json = { [key: string]: string | Json };

/** Every leaf string in a catalogue, with the key path that renders it. */
export function flatten(node: Json, path = ''): Array<{ key: string; text: string }> {
  const out: Array<{ key: string; text: string }> = [];
  for (const [name, value] of Object.entries(node)) {
    const next = path ? `${path}.${name}` : name;
    if (typeof value === 'string') out.push({ key: next, text: value });
    else out.push(...flatten(value, next));
  }
  return out;
}

const CATALOG = ko as unknown as Json;

/* ------------------------------------------------------------------------- *
 * Gate 1 — internal vocabulary anywhere in the catalogue
 * ------------------------------------------------------------------------- */

/**
 * The word, and the shape that is **not** it.
 *
 * The word for "contract" is the abstract one this codebase talks to itself in,
 * and it had exactly one hit: the architecture screen's first sentence. A real
 * paper contract is a different, longer word, is ordinary, and is not what this
 * bans, so it is excluded rather than left to be found as a false positive later.
 */
const INTERNAL_TERMS: ReadonlyArray<{ term: string; not?: RegExp }> = [
  { term: '인계문' },
  { term: '핸드오프' },
  { term: '담는 것' },
  { term: '속한 곳' },
  { term: '기대는 곳' },
  { term: '이것만 보기' },
  { term: '전체 상세' },
  { term: '수리 큐' },
  { term: '정본' },
  { term: '관문' },
  { term: '래칫' },
  { term: '게이트' },
  { term: '계약', not: /계약서/ },
  { term: '영수증' },
  { term: '위반' },
  { term: '미분류 의존' },
  { term: '원소' },
];

export function internalTermHits(messages: Json, term: string, not?: RegExp): string[] {
  return flatten(messages)
    .filter(({ text }) => text.includes(term))
    .filter(({ text }) => !(not && not.test(text)))
    .map(({ key }) => key)
    .sort();
}

/**
 * **What is still tolerated, and why** (counted 2026-08-31, after the 1.0.0
 * plain-language pass cleared nine of these terms to zero: repair queue,
 * canonical, contract, receipt, unmapped dependency, the chemistry word for
 * element, and the three invented relation names).
 *
 * A key listed here is a **known** occurrence, not an approved one. A term with
 * an empty list is banned outright: there is nowhere lower to ratchet.
 */
const TOLERATED: Readonly<Record<string, readonly string[]>> = {
  인계문: [],
  핸드오프: [],
  '담는 것': [],
  '속한 곳': [],
  '기대는 곳': [],
  '이것만 보기': [],
  '전체 상세': [],
  '수리 큐': [],
  정본: [],
  래칫: [],
  계약: [],
  영수증: [],
  '미분류 의존': [],
  원소: [],

  // A real product concept: the check an agent has to pass before it may write
  // or reach outside the folder. Seven strings lean on the word without any of
  // them saying what it is (the gateway's own truncation note was one of eight
  // until the severity-3 pass made it say "this list" instead). Replacing the
  // rest needs one decision about what the concept is called everywhere, which
  // is larger than a copy pass.
  // Emptied on 2026-09-01: the concept once named by the internal gate words is now written as what it
  // does ("asks before writing / before touching anything outside the folder"), and the
  // architecture screen says which rule a connection broke instead of the bare word.
  관문: [],
  게이트: [],
  위반: [],
};

describe('카탈로그 전체 — 내부에서 만든 말이 화면에 닿지 않는다', () => {
  it('검사가 헛돌고 있지 않다 — 카탈로그를 실제로 읽는다', () => {
    expect(flatten(CATALOG).length).toBeGreaterThan(2_000);
  });

  it.each(INTERNAL_TERMS.map(({ term, not }) => [term, not] as const))(
    '「%s」이(가) 새 자리로 번지지 않는다',
    (term, not) => {
      const tolerated = TOLERATED[term];
      expect(tolerated, `TOLERATED 에 「${term}」 항목이 없다`).toBeDefined();
      const hits = internalTermHits(CATALOG, term, not);
      const unlisted = hits.filter((key) => !tolerated.includes(key));

      expect(
        unlisted,
        `"${term}" entered the new places below. It is a word this repository coined for its own use, ` +
          `so on screen say what actually happens at that place instead.\n${unlisted.join('\n')}`,
      ).toEqual([]);

      expect(
        hits.length,
        `「${term}」이(가) ${tolerated.length} → ${hits.length} 로 늘었다.`,
      ).toBeLessThanOrEqual(tolerated.length);
    },
  );

  it('허용 목록이 실재하는 키를 가리킨다 — 고친 자리는 목록에서도 지운다', () => {
    const keys = new Set(flatten(CATALOG).map(({ key }) => key));
    const stale: string[] = [];
    for (const [term, list] of Object.entries(TOLERATED)) {
      for (const key of list) if (!keys.has(key)) stale.push(`${term}: ${key}`);
    }
    expect(stale, `허용 목록이 없는 키를 가리킨다 — 지워라\n${stale.join('\n')}`).toEqual([]);
  });

  it('probe: 심어 놓은 위반을 실제로 잡는다', () => {
    expect(internalTermHits({ card: { title: '수리 큐' } }, '수리 큐')).toEqual(['card.title']);
    expect(internalTermHits({ a: { b: '깨끗한 문장' } }, '수리 큐')).toEqual([]);
    // The paper-contract carve-out really carves out, and only that.
    expect(internalTermHits({ a: '계약을 요약합니다' }, '계약', /계약서/)).toEqual(['a']);
    expect(internalTermHits({ a: '계약서를 첨부하세요' }, '계약', /계약서/)).toEqual([]);
  });
});

/* ------------------------------------------------------------------------- *
 * Gate 2 — English left untranslated in the Korean catalogue
 * ------------------------------------------------------------------------- */

const HANGUL = /[가-힣]/;

/** ICU placeholders and plural arms are the message's machinery, not its words. */
function stripIcu(text: string): string {
  let previous: string;
  let current = text;
  do {
    previous = current;
    current = current.replace(/\{[^{}]*\}/g, ' ');
  } while (current !== previous);
  return current;
}

/**
 * A Korean value with **no Hangul at all** and more than one Latin word.
 *
 * One word is not a signal: `Project · {count}` and `Codex` are labels, not
 * untranslated sentences. Two or more is where "nobody translated this" lives,
 * which is how `Missing dependency reference` sat on a Korean settings panel.
 */
export function untranslatedEnglish(messages: Json, allowed: ReadonlySet<string>): string[] {
  return flatten(messages)
    .filter(({ key }) => !allowed.has(key))
    .filter(({ text }) => !HANGUL.test(text))
    .filter(({ text }) => (stripIcu(text).match(/[A-Za-z][A-Za-z0-9'-]*/g) ?? []).length > 1)
    .map(({ key }) => key)
    .sort();
}

/**
 * **Deliberately English.** A name is not translated: a product's name, a
 * command a person types, a URL, a license, a technology. Translating any of
 * these sends somebody to a shell that answers "command not found" or to a
 * search for a product that does not exist under that name.
 */
const INTENTIONALLY_ENGLISH = new Set([
  'metadata.siteName', // the product's name
  'projectPages.detail.documentTitleSuffix', // the product's name
  'architecture.patternLabels.feature-sliced-design', // the architecture pattern's own name
  'footer.license', // the licence's own name
  'footer.stack', // technology names
  'download.trustVerifyCommand', // a command the person types
  'download.trustVerifyCommandWindows', // a command the person types (PowerShell)
  'download.factSourceValue', // the repository's own name (owner/repo)
  'projectPages.selector.nextSlotCliCommand', // a command the person types
  'projectPages.selector.nextSlotAgentCommand', // an MCP call signature an agent runs
  'docsVault.agentSetup.connectionClaudeCursor', // product names
  'agentConnect.claudeCode', // a product name and a file name
  'settings.projectForm.fields.linksPlaceholder', // example URLs
  'settings.projectForm.fields.stackPlaceholder', // technology names
  'settings.projectForm.fields.tagsPlaceholder', // example tags
  'agents.models.providerGemini', // a product name
  'agents.models.localBaseUrlPlaceholder', // a URL
  'agents.models.runnerLmStudio', // a product name
  'agents.models.runnerLlamaCpp', // a product name
  'download.heroMacSilicon', // Apple's own chip name — the row beside it reads Intel
  'library.rounds.sheet.wherePlaceholder', // example locations, spelled the way each service spells them
  // Terms stay as developers say them; the TermHint beside each carries the Korean explanation.
  'agents.models.keysTitle',
  'agents.models.keyLabel',
  'agents.models.jev.keyLabel',
  'termHints.mcp.expansion',
  'termHints.acp.expansion',
  'termHints.apiKey.expansion',
  'termHints.cli.expansion',
]);

/**
 * **Not translated yet.** Each of these is a real English sentence or label on a
 * Korean screen, left alone because it sits outside the inventory the 1.0.0
 * plain-language pass worked from. The list may shrink; it may not grow.
 */
const UNTRANSLATED_BASELINE: readonly string[] = [
  'firstRun.eyebrow', // "Local-first workbench" on the first screen
  'settings.projectForm.fields.nameEnPlaceholder', // "English name" as a Korean field's placeholder
];

describe('한국어 카탈로그 — 번역되지 않은 영어 문장', () => {
  it('영어로 남은 자리가 늘지 않는다', () => {
    const offenders = untranslatedEnglish(CATALOG, INTENTIONALLY_ENGLISH);
    const unlisted = offenders.filter((key) => !UNTRANSLATED_BASELINE.includes(key));

    expect(
      unlisted,
      'An untranslated English sentence entered the Korean screen.\n' +
        'If it is a name that must not be translated (product, command, URL, licence, technology), ' +
        'list it in INTENTIONALLY_ENGLISH with the reason.\n' +
        unlisted.join('\n'),
    ).toEqual([]);

    expect(
      offenders.length,
      `번역 안 된 자리가 ${UNTRANSLATED_BASELINE.length} → ${offenders.length} 로 늘었다.`,
    ).toBeLessThanOrEqual(UNTRANSLATED_BASELINE.length);
  });

  it('두 목록이 실재하는 키를 가리킨다', () => {
    const keys = new Set(flatten(CATALOG).map(({ key }) => key));
    for (const key of [...INTENTIONALLY_ENGLISH, ...UNTRANSLATED_BASELINE]) {
      expect(keys.has(key), `목록의 "${key}" 가 카탈로그에 없다 — 지워라`).toBe(true);
    }
  });

  // One Latin word slips past the rule above ("Kind", "Project · {count}"), and on the map's
  // search palette two such group labels sat on the Korean screen (formerly an e2e spec).
  it('검색 팔레트의 한국어 문자열은 모두 한글을 담는다', () => {
    const latinOnly = flatten(CATALOG)
      .filter(({ key }) => key.startsWith('searchWidgets.globalSearch.'))
      .filter(({ text }) => /[A-Za-z]/.test(stripIcu(text)) && !HANGUL.test(text))
      .map(({ key }) => key);
    expect(latinOnly).toEqual([]);
  });

  it('probe: 심어 놓은 영어 문장을 잡고, 이름과 자리표시자는 놓아준다', () => {
    const none = new Set<string>();
    expect(untranslatedEnglish({ card: { hint: 'Missing dependency reference' } }, none)).toEqual([
      'card.hint',
    ]);
    // One Latin word is a label, not an untranslated sentence.
    expect(untranslatedEnglish({ card: { hint: 'Codex' } }, none)).toEqual([]);
    // ICU machinery is not vocabulary: this string has no words of its own.
    expect(untranslatedEnglish({ card: { hint: '{current}/{total}' } }, none)).toEqual([]);
    // Any Hangul at all means somebody wrote it for this screen.
    expect(untranslatedEnglish({ card: { hint: 'Claude Code 를 연결합니다' } }, none)).toEqual([]);
    // The allowlist really excuses.
    expect(
      untranslatedEnglish({ card: { hint: 'Missing dependency reference' } }, new Set(['card.hint'])),
    ).toEqual([]);
  });
});

/* ------------------------------------------------------------------------- *
 * Gate 3 — a technical term with no explanation a reader can open
 * ------------------------------------------------------------------------- */

/**
 * Terms developers say in English stay as written, and the explanation lives in
 * a `TermHint` tooltip (owner, 2026-10-02). So the demand is no longer a Korean
 * gloss in parentheses beside the term: every term the catalogue uses has a
 * glossary entry (expansion and one sentence, both locales) and at least one
 * screen draws its `TermHint`.
 */
const TERM_PATTERNS: Record<GlossaryTerm, RegExp> = {
  mcp: /\bMCP\b/,
  acp: /\bACP\b/,
  apiKey: /\bAPI key\b/,
  cli: /\bCLI\b/,
};

const ACRONYMS = ['MCP', 'ACP', 'CLI'] as const;

/** Every bare acronym the catalogue uses that the glossary does not explain. */
export function unexplainedTerms(messages: Json, glossary: Json): string[] {
  const texts = flatten(messages).map(({ text }) => text);
  const out: string[] = [];
  for (const acronym of ACRONYMS) {
    if (!texts.some((text) => new RegExp(`\\b${acronym}\\b`).test(text))) continue;
    const entry = Object.values(glossary).find(
      (value): value is Json =>
        typeof value === 'object' && typeof value.expansion === 'string' && value.expansion.startsWith(acronym),
    );
    if (!entry || typeof entry.explanation !== 'string' || !entry.explanation.trim()) out.push(acronym);
  }
  return out;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [full] : [];
  });
}

describe('기술 용어 — 그대로 쓰고, 설명은 TermHint 가 연다', () => {
  it('카탈로그가 쓰는 머리글자는 모두 용어집에 풀이가 있다', () => {
    for (const glossary of [ko.termHints, en.termHints]) {
      expect(
        unexplainedTerms(CATALOG, glossary as unknown as Json),
        'Add the term to src/shared/config/term-glossary.ts and messages/{en,ko}/termHints.json.',
      ).toEqual([]);
    }
  });

  it('카탈로그가 쓰는 용어마다 TermHint 를 그리는 화면이 하나 이상 있다', () => {
    const texts = flatten(CATALOG).map(({ text }) => text);
    const source = sourceFiles(join(process.cwd(), 'src')).map((file) => readFileSync(file, 'utf8')).join('\n');
    const missing = GLOSSARY_TERMS.filter(
      (term) => texts.some((text) => TERM_PATTERNS[term].test(text)) && !source.includes(`term="${term}"`),
    );
    expect(missing, 'Put a TermHint at the first prominent occurrence of each term.').toEqual([]);
  });

  it('probe: 용어집에 없는 머리글자를 잡고, 있으면 놓아준다', () => {
    const glossary = { mcp: { expansion: 'MCP (Model Context Protocol)', explanation: '설명' } };
    expect(unexplainedTerms({ card: { hint: 'ACP 로 연결하세요' } }, glossary)).toEqual(['ACP']);
    expect(unexplainedTerms({ card: { hint: 'MCP 연결' } }, glossary)).toEqual([]);
    expect(unexplainedTerms({ card: { hint: 'MCP 연결' } }, { mcp: { expansion: 'MCP', explanation: '' } })).toEqual([
      'MCP',
    ]);
    expect(unexplainedTerms({ card: { hint: 'MCPServerish 는 아니다' } }, {})).toEqual([]);
  });
});
