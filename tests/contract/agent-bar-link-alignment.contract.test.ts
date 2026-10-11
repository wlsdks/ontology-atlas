import { describe, expect, it } from "vitest";

import { controlClass } from "@/shared/ui/control-class";

/**
 * `truncate: true` emits `block`, which tailwind-merge lets displace the shape's `inline-flex`; then
 * `items-center` has nothing to centre and text sticks to the top of the `min-h-6` box. Pins the
 * trap.
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
