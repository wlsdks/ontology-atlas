import { describe, expect, it } from "vitest";

import { controlClass } from "@/shared/ui/control-class";

/**
 * **The `truncate` axis breaks flex shapes** (owner report → measurement,
 * 2026-08-17).
 *
 * In the bottom agent bar the target node link ("Example Area") sat higher than the
 * text beside it. Measured from an installed-app screenshot, in ink pixels:
 *
 * ```
 *   codex-acp      top 18 · bottom 25
 *   Last Task...    top 17 · bottom 25
 *   Example Area    top 14 · bottom 22   ← 3px higher
 * ```
 *
 * The cause is the `block` that `truncate: true` emits. tailwind-merge lets it push
 * out the shape's `inline-flex`, and `items-center` then has nothing to centre, so the
 * text **sticks to the top** of the `min-h-6` (24px) box.
 *
 * Measured after the fix: the bottom edge is 25, **exactly matching** its neighbours,
 * with a 0.5px difference in centre. The remaining 1px difference at the top is
 * glyph shape (`up` vs `yeok`), not alignment.
 *
 * ⚠️ This check **pins the trap**; it does not fix every consumer. Seven places use
 * the same combination today, and this is the one where the defect was actually
 * measured on screen. The rest are not changed without evidence.
 */
describe("truncate 축과 flex 모양", () => {
  it("**함정 재현** — truncate 를 켜면 모양의 flex 가 사라진다", () => {
    const withTruncate = controlClass({ shape: "link", truncate: true });
    expect(withTruncate).toContain("block");
    expect(withTruncate).not.toContain("inline-flex");
  });

  it("truncate 를 안 켜면 모양이 flex 를 지킨다", () => {
    expect(controlClass({ shape: "link" })).toContain("inline-flex");
  });

  it("가운데 정렬은 flex 가 있어야 뜻이 있다", () => {
    // `items-center` is present in both cases, so the classes look fine and only the
    // screen is wrong. This check records that difference.
    expect(controlClass({ shape: "link", truncate: true })).toContain("items-center");
  });
});
