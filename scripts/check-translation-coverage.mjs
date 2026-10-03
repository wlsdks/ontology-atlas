#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listLocales, readLocaleParts } from './build-messages.mjs';
import { KEEP_TERMS, KEEP_TERM_EXEMPT, keepTermsIn, stripKeepTerms } from './lib/keep-terms.mjs';
import {
  analyzeMessage,
  flattenMessages,
  literalText,
  sameMultiset,
  visibleVariants,
} from './lib/message-icu.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REFERENCE_LOCALE = 'en';
const LENGTH_REFERENCE_LOCALE = 'ko';

export const EXTRA_ARGS = { ko: new Set(['fromJosa', 'toJosa', 'josa']) };

const HANGUL = /\p{Script=Hangul}/u;
const HAN = /\p{Script=Han}/u;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}ー]/u;
const HAN_KANA = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\u30FC';

const SIMPLIFIED_ONLY = /[这个们说对为过还时员]/u;
const JAPANESE_ONLY = /[読続検関実対]/u;

export const SCRIPT_RULES = {
  en: [
    ['Hangul', HANGUL],
    ['Han', HAN],
    ['kana', KANA],
  ],
  ko: [
    ['kana', KANA],
    ['Han', HAN],
  ],
  ja: [
    ['Hangul', HANGUL],
    ['a Simplified-only character', SIMPLIFIED_ONLY],
  ],
  zh: [
    ['Hangul', HANGUL],
    ['kana', KANA],
    ['a Japanese-only character', JAPANESE_ONLY],
  ],
};

const EXEMPT_PREFIX = 'locale.';

const CODE_SPAN = /`[^`]*`/g;
const URL_PATTERN = /https?:\/\/\S+/g;
const NUMBER_PATTERN = /\d+(?:[.,]\d+)*/g;
const IDENTIFIER_PATTERN = /[\w.$-]*[./_$][\w./$-]*/g;

const LATIN_AFTER_CJK = new RegExp(`[${HAN_KANA}] [A-Za-z0-9{<]`, 'u');
const LATIN_BEFORE_CJK = new RegExp(`[A-Za-z0-9}>] [${HAN_KANA}]`, 'u');
const CJK_TOUCHES_LATIN = new RegExp(`[${HAN_KANA}][A-Za-z0-9{<]|[A-Za-z0-9}>][${HAN_KANA}]`, 'u');
const ASCII_PUNCTUATION_AFTER_CJK = new RegExp(`[${HAN_KANA}][,.!?:;]`, 'u');
const FORBIDDEN_DASH = /—|--/;

export const TYPOGRAPHY_RULES = {
  ja: [
    ['an ASCII space between Japanese and a Latin letter, digit or argument', (s) => LATIN_AFTER_CJK.test(s) || LATIN_BEFORE_CJK.test(s)],
    ['ASCII punctuation directly after Japanese', (s) => ASCII_PUNCTUATION_AFTER_CJK.test(s)],
    ['an em dash or double hyphen', (s) => FORBIDDEN_DASH.test(s)],
  ],
  zh: [
    ['Han touching a Latin letter, digit or argument without a space', (s) => CJK_TOUCHES_LATIN.test(s)],
    ['ASCII punctuation directly after Han', (s) => ASCII_PUNCTUATION_AFTER_CJK.test(s)],
    ['an em dash or double hyphen', (s) => FORBIDDEN_DASH.test(s)],
  ],
};

export const ACCEPTED = {
  '*': {
    residue: {
      'architecture.patternLabels.feature-sliced-design': 'the name of a published architecture pattern',
      'architecture.patternLabels.mvp': 'an acronym used as the pattern name',
      'architecture.inspectorEscHint': 'the name of a keyboard key',
      'connectors.source.claude': 'a lowercase connector identifier shown as written',
      'connectors.source.codex': 'a lowercase connector identifier shown as written',
      'connectors.source.cursor': 'a lowercase connector identifier shown as written',
      'library.source.hash': 'the name of a hash algorithm',
      'projectPages.selector.nextSlotCliCommand': 'a command the person copies',
      'projectPages.selector.nextSlotAgentCommand': 'a tool call the person copies',
      'termHints.mcp.expansion': 'line 1 of a term hint is identical in every locale',
      'termHints.acp.expansion': 'line 1 of a term hint is identical in every locale',
      'termHints.apiKey.expansion': 'line 1 of a term hint is identical in every locale',
      'termHints.cli.expansion': 'line 1 of a term hint is identical in every locale',
      'topology.analysis.healthEvidenceUrl': 'the acronym of a link kind',
    },
  },
  ko: {
    residue: {
      'docsVault.frontmatterBlock.editKindLabel': 'the label names the frontmatter field as written',
      'docsVault.frontmatterBlock.editDomainLabel': 'the label names the frontmatter field as written',
      'docsVault.frontmatterBlock.editTitleLabel': 'the label names the frontmatter field as written',
      'featuresMisc.localVaultPicker.revealPathLabel': 'the macOS application name, shown as the system shows it',
      'footer.license': 'a licence line kept in English in the Korean footer',
      'footer.stack': 'a technology list kept in English in the Korean footer',
      'library.rounds.sheet.wherePlaceholder': 'an example of chat channels and database names',
      'projectPages.detail.topBarProjectFallback': 'a fallback label shown before the project name loads',
      'searchWidgets.projectSearch.containerBadge': 'a container badge kept in English',
      'settings.projectForm.fields.nameEnPlaceholder': 'a placeholder that asks for the English name',
      'settings.projectForm.fields.linksPlaceholder': 'an example link title and URL',
      'settings.projectForm.fields.tagsPlaceholder': 'an example tag list',
    },
    'keep-terms': {
      'agentConnect.manualIssueRelative': 'the Korean text writes the platform name in Hangul',
      'analysisWorkbench.relationNotesPrompt': 'the Korean prompt names the field without the word frontmatter',
      'automations.ontology.sheet.description': 'the Korean text says agent where English says ACP turn',
      'docsVault.desktopWelcome.contractFilesBody': 'the Korean text names the command git diff in lowercase',
      'featuresMisc.starterCta.copyCliCopied': 'the Korean text says terminal where English says CLI',
      'featuresMisc.starterCta.copyCliFailed': 'the Korean text says terminal where English says CLI',
      'firstRun.subtitle': 'the Korean text uses the short product name Atlas',
      'gatewayNav.readFullSource': 'the Korean text says repository where English names GitHub',
      'metadata.descriptions.guide': 'the Korean text uses the short product name Atlas',
      'ontologyPages.insights.flow.action': 'the Korean text says agent where English says ACP',
      'ontologyPages.insights.flow.request': 'the Korean request says Atlas tools where English says MCP',
    },
  },
  zh: {
    residue: {
      'harness.title': 'owner keeps Harness as written',
      'navRail.architecture': 'owner keeps Harness as written',
      'searchWidgets.shortcuts.rows.goTo_architecture': 'owner keeps Harness as written',
    },
  },
};

export function acceptedFor(locale) {
  const merged = {};
  for (const table of [ACCEPTED['*'], ACCEPTED[locale] ?? {}]) {
    for (const [rule, keys] of Object.entries(table)) merged[rule] = { ...merged[rule], ...keys };
  }
  return merged;
}

const withoutCode = (text) => text.replace(CODE_SPAN, ' ');

export function checkEntry(entry) {
  const { locale, key, text, reference, lengthReference, keepTerms = KEEP_TERMS, accepted = {} } = entry;
  const errors = [];
  const warnings = [];
  const fail = (rule, message) => {
    if (!accepted[rule]?.[key]) errors.push({ rule, key, message });
  };

  let analysis;
  try {
    analysis = analyzeMessage(text);
  } catch (error) {
    fail('arguments', `not valid ICU: ${error.message}`);
    return { errors, warnings };
  }

  const scriptRules = SCRIPT_RULES[locale];
  if (!scriptRules) {
    fail('script', `no script rules for locale "${locale}"`);
  } else if (!key.startsWith(EXEMPT_PREFIX)) {
    for (const [name, pattern] of scriptRules) {
      if (pattern.test(text)) fail('script', `${name} in a ${locale} string: ${text.slice(0, 60)}`);
    }
  }

  for (const { arg, ordinal, branches } of analysis.plurals) {
    const categories = new Intl.PluralRules(locale, { type: ordinal ? 'ordinal' : 'cardinal' }).resolvedOptions()
      .pluralCategories;
    if (!branches.includes('other')) fail('plural', `plural "${arg}" has no "other" branch`);
    for (const branch of branches) {
      if (/^=\d+$/.test(branch) || branch === 'other' || categories.includes(branch)) continue;
      fail('plural', `plural "${arg}" has branch "${branch}", not a ${locale} category (${categories.join(', ')})`);
    }
  }

  const typography = TYPOGRAPHY_RULES[locale];
  if (typography) {
    const visible = visibleVariants(text).map(withoutCode);
    for (const [name, violates] of typography) {
      if (visible.some(violates)) fail('typography', `${name}: ${text.slice(0, 60)}`);
    }
  }

  if (reference === undefined) return { errors, warnings };

  let referenceAnalysis;
  try {
    referenceAnalysis = analyzeMessage(reference);
  } catch {
    return { errors, warnings };
  }

  const extra = EXTRA_ARGS[locale] ?? new Set();
  for (const arg of referenceAnalysis.plain) {
    if (!analysis.args.has(arg)) fail('arguments', `drops {${arg}}: ${text.slice(0, 60)}`);
  }
  for (const arg of analysis.args) {
    if (!referenceAnalysis.args.has(arg) && !extra.has(arg)) fail('arguments', `adds {${arg}}: ${text.slice(0, 60)}`);
  }
  if (!sameMultiset(analysis.tags, referenceAnalysis.tags)) {
    fail('arguments', `rich tags differ from ${REFERENCE_LOCALE}: ${text.slice(0, 60)}`);
  }

  const referenceLiteral = withoutCode(literalText(reference));
  const exempt = KEEP_TERM_EXEMPT[locale] ?? [];
  for (const term of keepTermsIn(referenceLiteral, keepTerms).filter((name) => !exempt.includes(name))) {
    if (!keepTermsIn(literalText(text), [term]).length) fail('keep-terms', `drops "${term}": ${text.slice(0, 60)}`);
  }

  if (text === reference && locale !== REFERENCE_LOCALE && !key.startsWith(EXEMPT_PREFIX)) {
    const residue = stripKeepTerms(
      withoutCode(literalText(text))
        .replace(URL_PATTERN, ' ')
        .replace(IDENTIFIER_PATTERN, ' ')
        .replace(NUMBER_PATTERN, ' '),
      keepTerms,
    );
    const words = residue.match(/[A-Za-z]{3,}/g);
    if (words) fail('residue', `untranslated English (${words.slice(0, 3).join(', ')}): ${text.slice(0, 60)}`);
  }

  if (lengthReference !== undefined && lengthReference.length > 0) {
    const limit = locale === 'ja' ? lengthReference.length * 1.25 : locale === 'zh' ? lengthReference.length + 2 : null;
    if (limit !== null && text.length > limit) {
      warnings.push({ rule: 'length', key, message: `${text.length} characters against a limit of ${Math.floor(limit)}` });
    }
  }

  return { errors, warnings };
}

export function checkCatalog({ locale, entries, referenceEntries, lengthEntries, keepTerms, accepted }) {
  const errors = [];
  const warnings = [];
  const reference = new Map(referenceEntries);
  const length = new Map(lengthEntries ?? []);
  const seen = new Set();
  for (const [key, text] of entries) {
    seen.add(key);
    if (locale !== REFERENCE_LOCALE && !reference.has(key)) {
      errors.push({ rule: 'keys', key, message: `no ${REFERENCE_LOCALE} counterpart` });
    }
    const result = checkEntry({
      locale,
      key,
      text,
      reference: locale === REFERENCE_LOCALE ? undefined : reference.get(key),
      lengthReference: length.get(key),
      keepTerms,
      accepted,
    });
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }
  if (locale !== REFERENCE_LOCALE) {
    for (const key of reference.keys()) {
      if (!seen.has(key)) errors.push({ rule: 'keys', key, message: `missing from ${locale}` });
    }
  }
  return { errors, warnings, checked: entries.length };
}

export function readLocaleEntries(locale, { root = ROOT, namespaces } = {}) {
  const parts = readLocaleParts(locale, root).filter(
    ({ namespace }) => !namespaces || namespaces.includes(namespace),
  );
  return parts.flatMap(({ namespace, text }) => flattenMessages(JSON.parse(text), namespace));
}

export function checkLocale(locale, { root = ROOT, namespaces, keepTerms, accepted = acceptedFor(locale) } = {}) {
  const available = new Set(listLocales(root));
  for (const needed of [locale, REFERENCE_LOCALE]) {
    if (!available.has(needed)) throw new Error(`messages/${needed}/ does not exist`);
  }
  const options = { root, namespaces };
  return checkCatalog({
    locale,
    entries: readLocaleEntries(locale, options),
    referenceEntries: readLocaleEntries(REFERENCE_LOCALE, options),
    lengthEntries: available.has(LENGTH_REFERENCE_LOCALE)
      ? readLocaleEntries(LENGTH_REFERENCE_LOCALE, options)
      : [],
    keepTerms,
    accepted,
  });
}

function parseArgs(argv) {
  const options = { locale: null, namespaces: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    const [name, inline] = arg.split('=');
    const value = inline ?? argv[index + 1];
    if (name === '--locale') {
      options.locale = value;
      if (inline === undefined) index += 1;
    } else if (name === '--namespaces') {
      options.namespaces = String(value).split(',').filter(Boolean);
      if (inline === undefined) index += 1;
    } else {
      throw new Error(`unknown argument ${arg}`);
    }
  }
  if (!options.locale) throw new Error('usage: check-translation-coverage.mjs --locale <code> [--namespaces a,b]');
  return options;
}

function main() {
  const { locale, namespaces } = parseArgs(process.argv.slice(2));
  const { errors, warnings, checked } = checkLocale(locale, { namespaces });
  const tally = (list) => {
    const counts = new Map();
    for (const { rule } of list) counts.set(rule, (counts.get(rule) ?? 0) + 1);
    return [...counts].map(([rule, count]) => `${rule} ${count}`).join(', ') || 'none';
  };
  for (const { rule, key, message } of errors) console.error(`error   [${rule}] ${key}: ${message}`);
  for (const { rule, key, message } of warnings) console.warn(`warning [${rule}] ${key}: ${message}`);
  console.log(
    `${locale}: ${checked} strings checked; errors: ${tally(errors)}; warnings: ${tally(warnings)}`,
  );
  process.exit(errors.length > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
