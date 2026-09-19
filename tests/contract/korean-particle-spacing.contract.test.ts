import { describe, expect, it } from "vitest";

import ko from "../../messages/ko.json";

/**
 * A Korean particle attaches to the word in front of it, with no space — including after a
 * Latin word, a digit, a closing bracket, or an interpolation placeholder. The pattern below
 * is the list of particles; the rule is that none of them may be preceded by a space.
 *
 * This is not a taste rule. Measured on 2026-09-09 the bundle was split almost
 * evenly: 151 spaced against 127 attached, and 23 identical letter+particle pairs
 * appeared **both ways**. The Agents screen showed the product name spaced from its subject
 * particle one paragraph above the same name attached to it. Whichever style wins, a bundle
 * that uses both for the same pair is wrong, so this gate keeps the one that is
 * orthographically correct rather than the one that happened to be more common.
 *
 * ⚠️ **One syllable is the trap.** The subject particle and the determiner "this" are spelled
 * the same. After an interpolated value it is usually the particle and must attach; in front of
 * a noun it is the determiner and must keep its space. The exemptions below are the four
 * measured determiners, listed literally so a new one has to be looked at rather than absorbed
 * by a widened pattern.
 */
const PARTICLE_BASE =
  "(?:에서|으로|로서|로써|로|를|을|의|와|과|이라고|이라|이며|이고|이나|이|가|은|는|에게|에|도|만|부터|까지|보다|처럼|밖에|나)";

/**
 * Particles stack, two or three deep. The first pattern written for this gate matched only the
 * head, and its lookahead then saw a Hangul syllable, so every stacked one was excused — six of
 * them survived the first sweep of the bundle.
 */
const PARTICLE_TAIL = "(?:도|만|은|는|이|가|를|을|의|와|과|나|라도|서)";

const PARTICLE = `${PARTICLE_BASE}${PARTICLE_TAIL}*`;

/** A word can end in a letter, a digit, a closing bracket, a quote, or a slash. */
const WORD_END = "[A-Za-z0-9\\)\\]\\}/\"'»”]";

const SPACED = new RegExp(`${WORD_END} ${PARTICLE}(?![A-Za-z가-힣])`, "g");

/**
 * The determiner reading ("this X"), not a particle — these keep their space.
 *
 * Matched against a window around the offending position rather than the whole
 * string, so one determiner inside a long prompt does not excuse the rest of it.
 */
const DETERMINER_EXEMPTIONS = [
  "을(를) 이 컴퓨터",
  "1) 이 제품",
  "{ago} 이 지도",
  "은(는) 이 파일",
];

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, out);
  else if (value && typeof value === "object")
    for (const item of Object.values(value)) collectStrings(item, out);
  return out;
}

describe("Korean particle spacing", () => {
  const strings = collectStrings(ko);

  it("reads every string in the bundle, so a pass is not an empty scan", () => {
    expect(strings.length).toBeGreaterThan(3000);
  });

  it("attaches every particle to the word in front of it", () => {
    const offenders: string[] = [];
    for (const text of strings) {
      for (const match of text.matchAll(SPACED)) {
        const at = match.index ?? 0;
        const window = text.slice(Math.max(0, at - 14), at + match[0].length + 12);
        if (DETERMINER_EXEMPTIONS.some((exempt) => window.includes(exempt))) continue;
        offenders.push(`${match[0]}  ←  ${text.slice(Math.max(0, at - 40), at + 40)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("still catches a planted regression", () => {
    const planted = "Codex 를 설치하면 여기에 나타나요.";
    expect([...planted.matchAll(SPACED)].length).toBe(1);
  });

  it("leaves the determiner 이 alone", () => {
    const determiner = "{name}을(를) 이 컴퓨터에서 숨겨요";
    expect(DETERMINER_EXEMPTIONS.some((exempt) => determiner.includes(exempt))).toBe(true);
  });

  it("keeps the exemption list minimal — every entry still earns its place", () => {
    const unused = DETERMINER_EXEMPTIONS.filter(
      (exempt) => !strings.some((text) => text.includes(exempt)),
    );
    expect(unused).toEqual([]);
  });
});
