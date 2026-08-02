import { describe, expect, it, vi } from "vitest";
import { copyHandoffWithFeedback } from "./copy-handoff-with-feedback";

describe("copyHandoffWithFeedback", () => {
  it.each([
    [true, "Agent handoff copied", "success"],
    [false, "Could not copy. Try again.", "error"],
  ] as const)("reports clipboard result %s", async (copied, message, tone) => {
    const copy = vi.fn().mockResolvedValue(copied);
    const show = vi.fn();

    await copyHandoffWithFeedback({
      text: "handoff",
      copy,
      show,
      copiedMessage: "Agent handoff copied",
      failedMessage: "Could not copy. Try again.",
    });

    expect(copy).toHaveBeenCalledWith("handoff");
    expect(show).toHaveBeenCalledWith(message, tone);
  });
});
