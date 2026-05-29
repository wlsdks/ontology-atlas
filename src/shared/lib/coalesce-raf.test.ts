import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { coalesceRaf } from "./coalesce-raf";

describe("coalesceRaf", () => {
  let queue: Array<() => void>;
  let nextId: number;
  let canceled: Set<number>;

  beforeEach(() => {
    queue = [];
    nextId = 1;
    canceled = new Set();
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
      const id = nextId++;
      queue.push(() => {
        if (!canceled.has(id)) cb();
      });
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      canceled.add(id);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const flush = () => {
    const pending = queue;
    queue = [];
    for (const run of pending) run();
  };

  it("한 프레임 안의 여러 trigger 를 콜백 1회로 합친다", () => {
    const fn = vi.fn();
    const { trigger } = coalesceRaf(fn);
    trigger();
    trigger();
    trigger();
    expect(fn).not.toHaveBeenCalled(); // 프레임 전엔 실행 안 됨
    flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("프레임이 flush 된 뒤 다시 trigger 하면 또 실행된다", () => {
    const fn = vi.fn();
    const { trigger } = coalesceRaf(fn);
    trigger();
    flush();
    expect(fn).toHaveBeenCalledTimes(1);
    trigger();
    flush();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("cancel 은 예약된 프레임 콜백을 막는다", () => {
    const fn = vi.fn();
    const { trigger, cancel } = coalesceRaf(fn);
    trigger();
    cancel();
    flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it("cancel 이후에도 다시 trigger 할 수 있다", () => {
    const fn = vi.fn();
    const { trigger, cancel } = coalesceRaf(fn);
    trigger();
    cancel();
    trigger();
    flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
