import type { Page } from "@playwright/test";

const MAP_FRAME_MIN_WORK_MS = 0.4;

type FrameWorkWindow = Window & {
  __frameWork?: { recording: boolean; frames: Map<number, number> };
};

export async function installFrameWork(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as FrameWorkWindow;
    const state = { recording: false, frames: new Map<number, number>() };
    w.__frameWork = state;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      raf((t) => {
        const start = performance.now();
        try {
          callback(t);
        } finally {
          if (state.recording) state.frames.set(t, (state.frames.get(t) ?? 0) + performance.now() - start);
        }
      });
  });
}

export async function startFrameWork(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = (window as FrameWorkWindow).__frameWork!;
    state.frames.clear();
    state.recording = true;
  });
}

export async function stopFrameWork(page: Page): Promise<number[]> {
  const work = await page.evaluate(() => {
    const state = (window as FrameWorkWindow).__frameWork!;
    state.recording = false;
    return [...state.frames.values()];
  });
  return work.filter((ms) => ms >= MAP_FRAME_MIN_WORK_MS);
}

export function p95(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
}
