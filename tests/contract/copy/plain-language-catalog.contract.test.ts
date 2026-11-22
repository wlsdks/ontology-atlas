import { describe, expect, it } from 'vitest';

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import en from '../../../messages/en.json';
import ko from '../../../messages/ko.json';
import { column } from '../../../scripts/lib/i18n/locale-vocabulary.mjs';
import type { GlossaryTerm } from '../../../src/shared/config/term-glossary';

/**
 * Every string a person reads in the `ko` tree is scanned, not hand-picked namespaces. Counts are
 * ratchets because some flagged words have honest uses; when a number falls, lower its baseline too.
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

// Gate 1 — internal vocabulary anywhere in the catalogue

/**
 * The word, and the shape that is **not** it.
 *
 * The word for "contract" is the abstract one this codebase talks to itself in,
 * and it had exactly one hit: the architecture screen's first sentence. A real
 * paper contract is a different, longer word, is ordinary, and is not what this
 * bans, so it is excluded rather than left to be found as a false positive later.
 */
const INTERNAL_TERMS: ReadonlyArray<{ term: string; not?: RegExp }> = column('internalTerms', 'ko').terms;

export function internalTermHits(messages: Json, term: string, not?: RegExp): string[] {
  return flatten(messages)
    .filter(({ text }) => text.includes(term))
    .filter(({ text }) => !(not && not.test(text)))
    .map(({ key }) => key)
    .sort();
}

/**
 * A key listed in a term's `tolerated` list (the vocabulary table) is a **known**
 * occurrence, not an approved one. A term with an empty list is banned outright:
 * there is nowhere lower to ratchet.
 */
const TOLERATED: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  column('internalTerms', 'ko').terms.map((entry: { term: string; tolerated: string[] }) => [entry.term, entry.tolerated]),
);

describe('whole catalog — internally coined words never reach the screen', () => {
  it('the check is not idling — it really reads the catalog', () => {
    expect(flatten(CATALOG).length).toBeGreaterThan(2_000);
  });

  it.each(INTERNAL_TERMS.map(({ term, not }) => [term, not] as const))(
    'the term "%s" does not spread to new spots',
    (term, not) => {
      const tolerated = TOLERATED[term];
      expect(tolerated, `TOLERATED has no entry for "${term}"`).toBeDefined();
      const hits = internalTermHits(CATALOG, term, not);
      const unlisted = hits.filter((key) => !tolerated.includes(key));

      expect(
        unlisted,
        `"${term}" entered the new places below. It is a word this repository coined for its own use, ` +
          `so on screen say what actually happens at that place instead.\n${unlisted.join('\n')}`,
      ).toEqual([]);
    },
  );

  it('the allow list points at existing keys — a spot that was fixed is removed from the list too', () => {
    const keys = new Set(flatten(CATALOG).map(({ key }) => key));
    const stale: string[] = [];
    for (const [term, list] of Object.entries(TOLERATED)) {
      for (const key of list) if (!keys.has(key)) stale.push(`${term}: ${key}`);
    }
    expect(stale, `the allow list points at missing keys — delete them\n${stale.join('\n')}`).toEqual([]);
  });

  it('probe: really catches a planted violation', () => {
    expect(internalTermHits({ card: { title: '수리 큐' } }, '수리 큐')).toEqual(['card.title']);
    expect(internalTermHits({ a: { b: '깨끗한 문장' } }, '수리 큐')).toEqual([]);
    // The paper-contract carve-out really carves out, and only that.
    expect(internalTermHits({ a: '계약을 요약합니다' }, '계약', /계약서/)).toEqual(['a']);
    expect(internalTermHits({ a: '계약서를 첨부하세요' }, '계약', /계약서/)).toEqual([]);
  });
});

// Gate 2 — English left untranslated in the Korean catalogue

const HANGUL: RegExp = column('ownScript', 'ko').pattern;

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
const INTENTIONALLY_ENGLISH: ReadonlySet<string> = new Set(Object.keys(column('untranslatedEnglish', 'ko').intentional));

/**
 * **Not translated yet.** Each of these is a real English sentence or label on a
 * Korean screen, left alone because it sits outside the inventory the 1.0.0
 * plain-language pass worked from. The list may shrink; it may not grow.
 */
const UNTRANSLATED_BASELINE: readonly string[] = column('untranslatedEnglish', 'ko').baseline;

describe('Korean catalog — untranslated English sentences', () => {
  it('spots left in English do not grow', () => {
    const offenders = untranslatedEnglish(CATALOG, INTENTIONALLY_ENGLISH);
    const unlisted = offenders.filter((key) => !UNTRANSLATED_BASELINE.includes(key));

    expect(
      unlisted,
      'An untranslated English sentence entered the Korean screen.\n' +
        'If it is a name that must not be translated (product, command, URL, licence, technology), ' +
        'list it in INTENTIONALLY_ENGLISH with the reason.\n' +
        unlisted.join('\n'),
    ).toEqual([]);
  });

  it('both lists point at existing keys', () => {
    const keys = new Set(flatten(CATALOG).map(({ key }) => key));
    for (const key of [...INTENTIONALLY_ENGLISH, ...UNTRANSLATED_BASELINE]) {
      expect(keys.has(key), `"${key}" in the list is not in the catalog — delete it`).toBe(true);
    }
  });

  // One Latin word slips past the rule above ("Kind", "Project · {count}"), and the search palette
  // group labels show on the Korean screen.
  it('every Korean string of the search palette contains Hangul', () => {
    const latinOnly = flatten(CATALOG)
      .filter(({ key }) => key.startsWith('searchWidgets.globalSearch.'))
      .filter(({ text }) => /[A-Za-z]/.test(stripIcu(text)) && !HANGUL.test(text))
      .map(({ key }) => key);
    expect(latinOnly).toEqual([]);
  });

  it('probe: catches a planted English sentence and lets names and placeholders go', () => {
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

// Gate 3 — a technical term with no explanation a reader can open

/**
 * Terms developers say in English stay as written, explained by a `TermHint` tooltip: each term needs
 * a glossary entry (expansion and one sentence, both locales) and a screen that draws its `TermHint`.
 * `cli` keeps its glossary entry, which the acronym gate below still requires, but no screen draws it.
 */
const TERM_PATTERNS: Record<Exclude<GlossaryTerm, 'cli'>, RegExp> = {
  mcp: /\bMCP\b/,
  acp: /\bACP\b/,
  apiKey: /\bAPI key\b/,
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

describe('technical terms — kept as they are, explained by TermHint', () => {
  it('every acronym the catalog uses has an explanation in the glossary', () => {
    for (const glossary of [ko.termHints, en.termHints]) {
      expect(
        unexplainedTerms(CATALOG, glossary as unknown as Json),
        'Add the term to src/shared/config/term-glossary.ts and messages/{en,ko}/termHints.json.',
      ).toEqual([]);
    }
  });

  it('every term the catalog uses has at least one screen that draws a TermHint', () => {
    const texts = flatten(CATALOG).map(({ text }) => text);
    const source = sourceFiles(join(process.cwd(), 'src')).map((file) => readFileSync(file, 'utf8')).join('\n');
    const missing = (Object.keys(TERM_PATTERNS) as (keyof typeof TERM_PATTERNS)[]).filter(
      (term) => texts.some((text) => TERM_PATTERNS[term].test(text)) && !source.includes(`term="${term}"`),
    );
    expect(missing, 'Put a TermHint at the first prominent occurrence of each term.').toEqual([]);
  });

  it('probe: catches an acronym missing from the glossary and lets it go when present', () => {
    const glossary = { mcp: { expansion: 'MCP (Model Context Protocol)', explanation: '설명' } };
    expect(unexplainedTerms({ card: { hint: 'ACP 로 연결하세요' } }, glossary)).toEqual(['ACP']);
    expect(unexplainedTerms({ card: { hint: 'MCP 연결' } }, glossary)).toEqual([]);
    expect(unexplainedTerms({ card: { hint: 'MCP 연결' } }, { mcp: { expansion: 'MCP', explanation: '' } })).toEqual([
      'MCP',
    ]);
    expect(unexplainedTerms({ card: { hint: 'MCPServerish 는 아니다' } }, {})).toEqual([]);
  });
});
