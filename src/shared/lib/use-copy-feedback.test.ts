import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COPY_FEEDBACK_RESET_MS, useCopyFeedback } from "./use-copy-feedback";

const copyMock = vi.fn<(text: string) => Promise<boolean>>();
vi.mock("./copy-text", () => ({ copyText: (t: string) => copyMock(t) }));

describe("useCopyFeedback", () => {
  beforeEach(() => {
    copyMock.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("성공 시 copied → resetMs 후 idle", async () => {
    copyMock.mockResolvedValue(true);
    const { result } = renderHook(() => useCopyFeedback(1500));
    expect(result.current.state).toBe("idle");

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.copy("payload");
    });
    expect(returned).toBe(true);
    expect(copyMock).toHaveBeenCalledWith("payload");
    expect(result.current.state).toBe("copied");

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.state).toBe("idle");
  });

  it("실패(copyText false) 시 failed 로", async () => {
    copyMock.mockResolvedValue(false);
    const { result } = renderHook(() => useCopyFeedback());
    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.copy("x");
    });
    expect(returned).toBe(false);
    expect(result.current.state).toBe("failed");
  });

  it("연속 copy 는 이전 reset 타이머를 취소(상태가 조기 idle 로 안 떨어짐)", async () => {
    copyMock.mockResolvedValue(true);
    const { result } = renderHook(() => useCopyFeedback(1500));
    await act(async () => {
      await result.current.copy("a");
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    await act(async () => {
      await result.current.copy("b"); // New copy — restart timer
    });
    act(() => {
      vi.advanceTimersByTime(1000); // If this were the first timer (already elapsed 1000ms), it would have gone idle, but
    });
    expect(result.current.state).toBe("copied"); // restarted, so still copied
  });

  it("a copy that could not be attempted reads as failed, with the same dwell", () => {
    const { result } = renderHook(() => useCopyFeedback(1500));
    act(() => {
      result.current.fail();
    });
    expect(copyMock).not.toHaveBeenCalled();
    expect(result.current.state).toBe("failed");
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.state).toBe("idle");
  });

  it("run settles done when the action resolves, including a deliberate decline", async () => {
    const { result } = renderHook(() => useCopyFeedback());
    let returned: string | undefined;
    await act(async () => {
      returned = await result.current.run(async () => "reject_once");
    });
    expect(returned).toBe("reject_once");
    expect(result.current.state).toBe("done");
    act(() => {
      vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS);
    });
    expect(result.current.state).toBe("idle");
  });

  it("run settles failed when the action throws and returns undefined", async () => {
    const { result } = renderHook(() => useCopyFeedback());
    let returned: unknown = "unset";
    await act(async () => {
      returned = await result.current.run(() => {
        throw new Error("no");
      });
    });
    expect(returned).toBeUndefined();
    expect(result.current.state).toBe("failed");
  });

  it("settle shows the outcome on the same dwell", () => {
    const { result } = renderHook(() => useCopyFeedback());
    act(() => {
      result.current.settle("done");
    });
    expect(result.current.state).toBe("done");
    act(() => {
      vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS - 1);
    });
    expect(result.current.state).toBe("done");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.state).toBe("idle");
  });

  it("a repeat failure passes one idle frame so its animation restarts", () => {
    const { result } = renderHook(() => useCopyFeedback());
    act(() => {
      result.current.fail();
    });
    expect(result.current.state).toBe("failed");
    act(() => {
      result.current.fail();
    });
    expect(result.current.state).toBe("idle");
    act(() => {
      vi.advanceTimersToNextFrame();
    });
    expect(result.current.state).toBe("failed");
  });

  it("a different outcome replaces the current one without an idle frame", () => {
    const { result } = renderHook(() => useCopyFeedback());
    act(() => {
      result.current.fail();
    });
    act(() => {
      result.current.settle("done");
    });
    expect(result.current.state).toBe("done");
  });
});
