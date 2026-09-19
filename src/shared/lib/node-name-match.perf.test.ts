import { describe, expect, it } from "vitest";
import {
  nameEquals,
  nameHangulIncludes,
  nameIncludes,
  nameStartsWith,
  normalizeForMatch,
  type NodeNameSource,
} from "./node-name-match";
import { chosungKey, hangulIncludes } from "./hangul-match";

/**
 * A performance gate on the per-node name index, so a keystroke stays cheap.
 *
 * **What happened** (measured 2026-09-19). Every question the matcher asks — equals,
 * starts-with, includes, and now the two Hangul ones — called a private
 * `nodeNameCandidates` that rebuilt the name list and ran `normalizeForMatch` (NFC +
 * lowercase + a whitespace regex) over every name again. One keystroke therefore
 * normalised each node's names three to five times. On a 12,000-node vault, best of
 * five: 243 ms for a plain query, 358 ms for a half-typed Hangul one. A palette cannot
 * stall a third of a second per character. Building the index once per node — and the
 * syllable initials with it — took the same two to 29.8 ms and 30.0 ms.
 *
 * **Gate design — a ratio measured in the same run, never absolute wall-clock**, the
 * shape `duplicate-pairs.perf.test.ts` established. The defective behaviour is
 * reproduced here as `naiveMatch`: it re-normalises and re-reduces every name on every
 * tier, exactly as the old code did. Numerator and denominator ride the same machine
 * and the same concurrent load, so the verdict does not depend on either.
 *
 * Measured 2026-09-19, this gate's own run (12,000 nodes, best of three, a query that
 * reaches the lowest tier so every tier runs): cached 7.5-8.8 ms against naive
 * 91.8-93.9 ms, a ratio of 10.6-12.3. Probed by making `nodeNameIndex` ignore the
 * `WeakMap`: cached 105.5 ms, naive 106.0 ms, ratio 1.0, red. The threshold of 3 sits
 * well below the healthy figure and well above the defective one.
 */

const WORDS = [
  "장바구니",
  "주문서 작성",
  "회원 탈퇴",
  "쿠폰 발급",
  "택배사 연동",
  "기획전",
  "배송지 주소록",
  "고객 메시지 발송",
  "교환 접수",
  "반품 처리",
];

const NODES: NodeNameSource[] = Array.from({ length: 12_000 }, (_, i) => ({
  title: `${WORDS[i % WORDS.length]} ${i}`,
  display: `Capability ${i}`,
  displayLocales: { ko: `${WORDS[i % WORDS.length]} ${i}`, en: `Capability ${i}` },
}));

/** The shape this gate exists to keep out: nothing kept between tiers or between calls. */
function naiveNames(node: NodeNameSource): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value: string | undefined) => {
    if (!value) return;
    const key = normalizeForMatch(value);
    if (key === "" || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };
  push(node.title);
  push(node.display);
  for (const value of Object.values(node.displayLocales ?? {})) push(value);
  return out;
}

function naiveMatch(query: string): number {
  let hits = 0;
  for (const node of NODES) {
    if (naiveNames(node).some((name) => name === query)) hits += 1;
    else if (naiveNames(node).some((name) => name.startsWith(query))) hits += 1;
    else if (naiveNames(node).some((name) => name.includes(query))) hits += 1;
    else if (naiveNames(node).map(chosungKey).some((c) => c.includes(query))) hits += 1;
    else if (naiveNames(node).some((name) => hangulIncludes(name, query))) hits += 1;
  }
  return hits;
}

function cachedMatch(query: string): number {
  let hits = 0;
  for (const node of NODES) {
    if (nameEquals(node, query)) hits += 1;
    else if (nameStartsWith(node, query)) hits += 1;
    else if (nameIncludes(node, query)) hits += 1;
    else if (nameHangulIncludes(node, query)) hits += 1;
  }
  return hits;
}

function bestOfThree(run: () => void): number {
  run();
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 3; i += 1) {
    const started = performance.now();
    run();
    best = Math.min(best, performance.now() - started);
  }
  return best;
}

describe("이름 색인 성능", () => {
  it("노드마다 한 번만 만든다 — 매번 다시 만드는 모양보다 3배 이상 빠르다", () => {
    // A query no name matches literally, so every tier runs for every node.
    const query = normalizeForMatch("ㅌㅌ");
    expect(cachedMatch(query)).toBeGreaterThan(0);

    const cached = bestOfThree(() => cachedMatch(query));
    const naive = bestOfThree(() => naiveMatch(query));
    const ratio = naive / cached;

    // The measurement is the point; a bare ratio tells the next reader nothing.
    console.log(
      `12,000 nodes — cached ${cached.toFixed(1)}ms · rebuild-every-tier ${naive.toFixed(1)}ms · ratio ${ratio.toFixed(1)}x`,
    );
    expect(ratio).toBeGreaterThan(3);
  });
});
