import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCopyFeedback } from "./use-copy-feedback";

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
});
