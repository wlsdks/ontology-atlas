import { afterEach, describe, expect, it, vi } from "vitest";
import { morphName, morphTargetProps, runMorph } from "./shared-element";

type Update = () => void;

function carrier(name: string): HTMLElement {
  const element = document.createElement("h2");
  element.setAttribute(Object.keys(morphTargetProps(name))[0]!, name);
  document.body.append(element);
  return element;
}

function installTransition() {
  let finish: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const calls: Update[] = [];
  const start = vi.fn((update: Update) => {
    calls.push(update);
    return { finished, ready: Promise.resolve(), updateCallbackDone: Promise.resolve() };
  });
  Object.defineProperty(document, "startViewTransition", { value: start, configurable: true });
  return { start, calls, finish: () => finish() };
}

afterEach(() => {
  delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
  document.body.innerHTML = "";
  document.documentElement.className = "";
});

describe("morphName", () => {
  it("is a stable, CSS-safe name per key", () => {
    const name = morphName("concept", "domains/map rendering");
    expect(name).toMatch(/^morph-concept-[0-9a-z]+$/);
    expect(morphName("concept", "domains/map rendering")).toBe(name);
    expect(morphName("concept", "domains/other")).not.toBe(name);
  });
});

describe("runMorph", () => {
  it("runs the update directly without the API", () => {
    const update = vi.fn();
    expect(runMorph(update, [morphName("concept", "a")])).toBe("direct");
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("runs the update directly when no source carries the name", () => {
    const { start } = installTransition();
    const update = vi.fn();
    expect(runMorph(update, [morphName("concept", "a")])).toBe("direct");
    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("names the source, then the new target, and clears both when finished", async () => {
    const { calls, finish } = installTransition();
    const name = morphName("concept", "a");
    const source = carrier(name);
    let target: HTMLElement | null = null;

    expect(runMorph(() => {
      target = carrier(name);
    }, [name])).toBe("transition");
    expect(source.style.viewTransitionName).toBe(name);
    expect(document.documentElement.classList.contains("morph-transition")).toBe(true);

    calls[0]!();
    expect(source.style.viewTransitionName).toBe("");
    expect(target!.style.viewTransitionName).toBe(name);

    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(target!.style.viewTransitionName).toBe("");
    expect(document.documentElement.classList.contains("morph-transition")).toBe(false);
  });
});
