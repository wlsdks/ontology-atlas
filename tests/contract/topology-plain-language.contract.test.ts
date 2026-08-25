import { describe, expect, it } from "vitest";
import koMessages from "../../messages/ko.json";

const topology = koMessages.topology;

/**
 * ⚠️ **Half of this file was deleted on 2026-08-25** (owner: *"if a gate is catching things by
 * wording in a strange way, it's fine to remove it"*).
 *
 * It used to pin the exact Korean of sixteen labels — `contains` had to be the string one exact Korean phrase,
 * `realm.enterAction` had to be another exact phrase. `documentation.md` is explicit that a check may
 * verify only facts a machine can derive and must **never pin a sentence written by a person**; the
 * predecessor that broke this rule ended up with 1,915 assertions passing while behaviour changed
 * and failing when a correct sentence was reworded.
 *
 * That is exactly what it did here. Repairing the empty-state copy — which was leaking a schema kind
 * at a first-time reader — broke assertions that had no opinion about the repair, and the effort of
 * updating them is a standing tax on writing better words.
 *
 * What survives is the half that was never about prose: **no internal vocabulary reaches a label**.
 * That is a denylist of terms this repository invented, and a machine can check it without deciding
 * how a sentence should read. The wider vocabulary rule lives in
 * `user-facing-vocabulary.contract.test.ts`.
 */
describe("topology Korean plain-language contract", () => {
  it("does not expose internal handoff or measurement wording in the inspected labels", () => {
    const inspected = JSON.stringify({
      nodeDatasheet: topology.nodeDatasheet,
      realm: topology.realm,
      edgeTypesPlain: koMessages.edgeTypesPlain,
      fullDetailA1: koMessages.fullDetailA1,
    });
    for (const internalTerm of [
      "인계문",
      "핸드오프",
      "담는 것",
      "속한 곳",
      "기대는 곳",
      "이것만 보기",
      "전체 상세",
    ]) {
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
