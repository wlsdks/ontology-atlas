import { describe, expect, it } from "vitest";
import koMessages from "../../../messages/ko.json";
import { column } from "../../../scripts/lib/i18n/locale-vocabulary.mjs";

const topology = koMessages.topology;

/**
 * No internal vocabulary reaches a label: a denylist of terms this repository invented. Exact
 * wording is not pinned; `user-facing-vocabulary.contract.test.ts` holds the wider rule.
 */
describe("topology Korean plain-language contract", () => {
  it("does not expose internal handoff or measurement wording in the inspected labels", () => {
    const inspected = JSON.stringify({
      nodeDatasheet: topology.nodeDatasheet,
      realm: topology.realm,
      edgeTypesPlain: koMessages.edgeTypesPlain,
      fullDetailA1: koMessages.fullDetailA1,
    });
    const labelTerms = column("internalTerms", "ko").terms.filter((entry: { inLabels?: boolean }) => entry.inLabels);
    expect(labelTerms.length, "the label denylist is empty").toBeGreaterThan(0);
    for (const { term: internalTerm } of labelTerms) {
      expect(inspected).not.toContain(internalTerm);
    }
  });

  /*
   * The relation labels still have to *exist* and be distinct — that is a derivable fact, unlike
   * what each one should say. A missing key renders a raw `edgeTypesPlain.contains` on the map, and
   * two identical labels make two different relations indistinguishable to a reader.
   */
  it("gives every relation type its own non-empty label", () => {
    const labels = Object.entries(koMessages.edgeTypesPlain);
    expect(labels.length).toBeGreaterThan(0);
    for (const [key, value] of labels) {
      expect(typeof value, `${key} 라벨이 문자열이 아니다`).toBe("string");
      expect(String(value).trim().length, `${key} 라벨이 비어 있다`).toBeGreaterThan(0);
    }
    const distinct = new Set(labels.map(([, value]) => value));
    expect(distinct.size, "두 관계가 같은 이름을 쓰면 독자가 구분할 수 없다").toBe(labels.length);
  });
});
