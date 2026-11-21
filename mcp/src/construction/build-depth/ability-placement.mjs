import { dirname } from 'node:path';

import { repoText } from '../../analyze/repo-text.mjs';
import {
  codeTokens,
  escapeRegExp,
  exactlyNamed,
  flagNamed,
  GENERIC_SYMBOLS,
  givesReason,
  MEMBER_KINDS,
  namedInCode,
  NAMING_KINDS,
  namesWord,
  packageFolder,
  spokenForms,
} from './name-matching.mjs';
import { kindOf, pathOf, sectionOf } from './node-fields.mjs';

/**
 * Where every ability the survey lists sits on the map:
 * - `node`: a capability or element whose `path:` is its file and which names it
 *   (or is the file's only ability);
 * - `named`: a capability or element whose title names it, or whose body names it
 *   in code form (`list`, `--force`, its `path:Lline`); a family or module API
 *   when half its members are named that way, a flag group by its name or half its
 *   flags. A word in passing ("users list invoices") places nothing;
 * - `excluded`: one line in the project's `## Uncertainty` or `## Excludes` that
 *   points at exactly this ability, by its `path:Lline` or its exact name, and
 *   says why. A line that names several abilities excludes none of them.
 * Domains and the project do not place an ability: a word in a domain sentence
 * is not a node a reader finds.
 */
export function measureAbilities(docs, survey) {
  const abilities = Array.isArray(survey.abilities) ? survey.abilities : [];
  const project = docs.find((doc) => kindOf(doc) === 'project');
  const nodes = docs.filter((doc) => NAMING_KINDS.has(kindOf(doc))).map((doc) => {
    const body = String(doc.body ?? '');
    return { doc, title: String(doc.frontmatter?.title ?? ''), body, tokens: codeTokens(body) };
  });
  // A title is a name a reader sees: it may name an ability in words, a common word
  // ("next", "label") only in code form or as "the next command". An ability whose
  // file is a package's entry (index, __init__, main) also answers to the package folder.
  const titleNames = (title, row) => {
    if (row.kind === 'flag') return flagNamed(title, row.name);
    if (row.kind === 'flags') return !row.name.startsWith('--') && namesWord(title, row.name);
    const words = [row.name, row.symbol, packageFolder(row.path)].filter(Boolean).map(String);
    const forms = words.filter((word) => !GENERIC_SYMBOLS.has(word.toLowerCase())).flatMap(spokenForms);
    if (forms.some((form) => namesWord(title, form))) return true;
    return words.some((word) => GENERIC_SYMBOLS.has(word.toLowerCase())
      && new RegExp(`\`${escapeRegExp(word)}\`|\\b${escapeRegExp(word)}\\s+command\\b`, 'i').test(title));
  };
  const nodeNames = (node, row) => {
    if (titleNames(node.title, row) || namedInCode(node.body, row, node.tokens)) return true;
    if (row.kind === 'flags') {
      const members = row.members ?? [];
      return (!row.name.startsWith('--') && node.tokens.has(row.name))
        || members.filter((member) => flagNamed(node.body, member)).length * 2 >= Math.max(members.length, 2);
    }
    return row.kind === 'executable' && node.body.includes(dirname(row.path));
  };
  const memberNamed = (member) => nodes.some((node) => node.tokens.has(member) || namesWord(node.title, member));
  const excludedRows = new Set();
  if (project) {
    const lines = `${sectionOf(project.body, 'Uncertainty')}\n${sectionOf(project.body, 'Excludes')}`.split('\n').filter((line) => line.trim());
    for (const line of lines) {
      const tokens = codeTokens(line);
      const cited = abilities.filter((row) => row.evidence && new RegExp(`${escapeRegExp(row.evidence)}(?!\\d)`).test(line));
      const pointed = cited.length > 0 ? cited : abilities.filter((row) => namedInCode(line, row, tokens) || exactlyNamed(line, row));
      if (pointed.length === 1 && givesReason(line, pointed)) excludedRows.add(pointed[0]);
    }
  }
  const place = (row) => {
    if (MEMBER_KINDS.has(row.kind)) {
      const named = row.members.filter(memberNamed).length;
      if (named * 2 >= row.members.length || nodes.some((node) => namedInCode(node.body, row, node.tokens))) return 'named';
      return excludedRows.has(row) ? 'excluded' : 'unplaced';
    }
    const sameFile = abilities.filter((other) => other.path === row.path).length;
    if (nodes.some((node) => pathOf(node.doc) === row.path && (sameFile === 1 || nodeNames(node, row)))) return 'node';
    if (nodes.some((node) => nodeNames(node, row))) return 'named';
    return excludedRows.has(row) ? 'excluded' : 'unplaced';
  };
  const placed = abilities.map((row) => ({ ...row, place: place(row) }));
  const count = (state) => placed.filter((row) => row.place === state).length;
  return {
    abilities: abilities.length,
    node: count('node'),
    named: count('named'),
    excluded: count('excluded'),
    unplaced: placed.filter((row) => row.place === 'unplaced'),
  };
}

export function abilityLabel(row) {
  const members = row.members ? `: ${row.members.slice(0, 4).map((name) => repoText(name, 80)).join(', ')}${row.members.length > 4 ? ', ...' : ''}` : '';
  if (row.kind === 'family') {
    const named = row.name && row.name !== row.path ? `${repoText(row.name)} family in ${repoText(row.path)}` : `${repoText(row.path)} family`;
    return `the ${named} (${repoText(row.evidence ?? row.path)}${members})`;
  }
  const at = row.evidence ?? row.path;
  return `${repoText(row.name, 120)} (${row.kind}, ${repoText(at)}${row.symbol && row.symbol !== row.name ? ` ${repoText(row.symbol, 120)}` : ''}${members})`;
}
