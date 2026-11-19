/**
 * A sentence written for a whole family, handed back with the family's count at
 * the moment it is written. A node body or a relation note that starts from
 * every, each, all, both or only and is about a family `type-family` ties
 * structurally (classes whose header names one base, Go types matching one
 * interface) gets one warning when this session read fewer members than the
 * family has: the sentence quoted, the count, and the repair. It never refuses.
 *
 * A sentence is about a family when a range it cites (`path:L12-L30`) holds a
 * member or the base, or when the words after the universal name the base (`every
 * transform` names `Transform`). Where neither finds exactly one family, or the
 * two disagree, nothing is said. A sentence that already gives a count ("2 of at
 * least 16 read") and the `## Uncertainty` section are left alone.
 *
 * Bounded: a line over `lineChars` is skipped, at most `sentences` universal
 * sentences are checked per write, at most `cites` cites per sentence, and the
 * families are built once per write, only when a sentence needs them.
 */

import { repoText } from '../analyze/repo-text.mjs';
import { productWalk } from '../evidence-search/declaration-index.mjs';
import { createFamilies } from '../evidence-search/type-family.mjs';
import { familyCount, familyWhat } from './read-family.mjs';

export const UNIVERSAL_LIMITS = Object.freeze({ lineChars: 2000, sentences: 64, cites: 4, words: 3 });

const UNIVERSAL = /^(every|each|all|both|only)\b/iu;
const COUNTED = /\b\d+\s+of\s+(?:at least\s+)?\d+\b/iu;
const CITE = /([\w@.\-/]+\.[A-Za-z0-9]+):L(\d+)(?:-L(\d+))?/gu;
const FILLER = new Set(['the', 'of', 'its', 'their', 'our', 'these', 'those', 'a', 'an', 'one', 'other', 'such', 'known', 'registered', 'built-in']);
const UNCERTAINTY = /^#{1,6}\s+uncertainty\b/iu;
const HEADING = /^#{1,6}\s/u;

/** The sentences of one line: split after `.`, `!`, `?` or `;` and a space. */
function sentencesOf(line) {
  return line.split(/(?<=[.!?;])\s+/u);
}

/** Bullets, quote marks and emphasis before the first word. */
function bare(sentence) {
  return sentence.replace(/^[\s>*+\-_"'`(]+/u, '');
}

/** Words after the universal one that may name the base, as joined lower-case candidates, singular forms included. */
function nameCandidates(sentence) {
  const words = sentence.slice(sentence.search(/\s/u) + 1)
    .split(/\s+/u)
    .map((word) => word.replace(/^[`*_"'(]+|[`*_"'),.:;!?]+$/gu, ''))
    .filter((word) => word && !FILLER.has(word.toLowerCase()))
    .slice(0, UNIVERSAL_LIMITS.words);
  const candidates = [];
  for (let size = 1; size <= words.length; size += 1) {
    const joined = words.slice(0, size).join('').replace(/[-_]/gu, '').toLowerCase();
    if (!/^[a-z][a-z0-9]*$/u.test(joined)) break;
    candidates.push(joined);
    if (joined.endsWith('es')) candidates.push(joined.slice(0, -2));
    if (joined.endsWith('s')) candidates.push(joined.slice(0, -1));
  }
  return candidates;
}

/**
 * One quoter per write call: `quote(text)` returns the warnings for one body or
 * one relation note, sharing the call's sentence budget and family walk.
 *
 * @param {object} context
 * @param {string | null} context.root absolute repository root, or null when the server has none
 * @param {Map<string, object[]>} [context.reads] ranges this session served under `root`
 * @param {string[]} [context.ignore]
 */
export function createUniversalQuoter({ root, reads, ignore = [] }) {
  let families;
  let checked = 0;
  const said = new Set();
  const familiesOf = () => {
    if (families === undefined) {
      const walk = productWalk(root, ignore);
      families = createFamilies(root, walk.files, { truncated: walk.truncated });
    }
    return families;
  };
  const familyFor = (sentence) => {
    const found = new Map();
    for (const match of [...sentence.matchAll(CITE)].slice(0, UNIVERSAL_LIMITS.cites)) {
      const startLine = Number(match[2]);
      const family = familiesOf().familyAt(match[1].replace(/^\.\//u, ''), { startLine, endLine: Number(match[3] ?? startLine) });
      if (family) found.set(`${family.base.path}\0${family.base.line}`, family);
    }
    for (const candidate of nameCandidates(sentence)) {
      const family = familiesOf().familyNamed(candidate);
      if (family) {
        found.set(`${family.base.path}\0${family.base.line}`, family);
        break;
      }
    }
    return found.size === 1 ? [...found.values()][0] : null;
  };
  return {
    /**
     * @param {unknown} text a node body or a relation note
     * @param {{ body?: boolean }} [options] a body's `## Uncertainty` section is skipped
     * @returns {string[]}
     */
    quote(text, { body = false } = {}) {
      if (!root || typeof text !== 'string' || !text) return [];
      const warnings = [];
      let uncertainty = false;
      try {
        for (const line of text.split('\n')) {
          if (body && HEADING.test(line)) uncertainty = UNCERTAINTY.test(line);
          if (uncertainty || line.length > UNIVERSAL_LIMITS.lineChars) continue;
          for (const raw of sentencesOf(line)) {
            const sentence = bare(raw).trim();
            if (!UNIVERSAL.test(sentence) || COUNTED.test(sentence) || said.has(sentence)) continue;
            if (checked >= UNIVERSAL_LIMITS.sentences) return warnings;
            checked += 1;
            const family = familyFor(sentence);
            if (!family) continue;
            const count = familyCount(familiesOf(), family, reads);
            if (!count || count.read >= count.members.length) continue;
            said.add(sentence);
            const { members, read } = count;
            warnings.push(`"${repoText(sentence, 240)}" speaks for a whole family. This family has at least ${members.length} members found in this folder: ${familyWhat(family, members)}; this session read ${read}: write "${read} of at least ${members.length} read" or name the member.`);
          }
        }
      } catch {
        // The quote is advice beside a write that already happened; a folder that cannot be walked says nothing.
      }
      return warnings;
    },
  };
}
