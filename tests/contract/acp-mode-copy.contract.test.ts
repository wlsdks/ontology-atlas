import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import ko from "../../messages/ko.json";
import { MEASURED_MODE_IDS, modeCopyKey } from "@/features/acp-session/model/mode-copy";

/**
 * The working-mode list must be **in human words** (owner, 2026-08-17).
 *
 * The old screen: `Auto · 확인 안 됨` / `Manual` / `Plan Mode` /
 * `Don't Ask · 확인 안 됨`. Every name was English, and descriptions were attached
 * only to the two we had not measured — the two actually worth choosing said
 * nothing about how they differ.
 *
 * Two things this contract keeps:
 * ① every id we decided to translate exists in **both** languages (filling one side
 *    only leaves the other stale).
 * ② an unknown id **gets no translation key** — an invented line becomes a promise
 *    we never verified.
 */
type Bundle = { acpChat?: { modeName?: Record<string, string>; modeHint?: Record<string, string> } };

const bundles: Array<[string, Bundle]> = [
  ["ko", ko as unknown as Bundle],
  ["en", en as unknown as Bundle],
];

describe("작업 방식 문구", () => {
  it("옮기기로 한 목록이 비어 있지 않다 — 아니면 아래가 헛돈다", () => {
    expect(MEASURED_MODE_IDS.length).toBeGreaterThanOrEqual(5);
  });

  describe.each(bundles)("%s", (_locale, bundle) => {
    it("모든 id 에 이름과 한 줄 설명이 있다", () => {
      for (const id of MEASURED_MODE_IDS) {
        expect(bundle.acpChat?.modeName?.[id], `${id} 이름`).toBeTruthy();
        expect(bundle.acpChat?.modeHint?.[id], `${id} 설명`).toBeTruthy();
      }
    });

    it("설명이 한 줄이다 — 목록 안에서 읽는 글이다", () => {
      for (const id of MEASURED_MODE_IDS) {
        const hint = bundle.acpChat?.modeHint?.[id] ?? "";
        expect(hint.length, `${id}`).toBeLessThan(60);
        expect(hint).not.toContain("\n");
      }
    });

    it("두 언어가 같은 id 집합을 덮는다", () => {
      expect(Object.keys(bundle.acpChat?.modeName ?? {}).sort()).toEqual([...MEASURED_MODE_IDS].sort());
      expect(Object.keys(bundle.acpChat?.modeHint ?? {}).sort()).toEqual([...MEASURED_MODE_IDS].sort());
    });
  });

  it("모르는 모드는 옮기지 않는다 — 어댑터 이름을 그대로 쓴다", () => {
    expect(modeCopyKey("bypassPermissions")).toBeNull();
    expect(modeCopyKey("acceptEdits")).toBeNull();
    expect(modeCopyKey("some-new-mode")).toBeNull();
    expect(modeCopyKey(null)).toBeNull();
  });

  it("어댑터 표기 차이에 흔들리지 않는다", () => {
    expect(modeCopyKey("dontAsk")).toBe("dontask");
    expect(modeCopyKey(" Read-Only ")).toBe("read-only");
    expect(modeCopyKey("default")).toBe("default");
  });
});
