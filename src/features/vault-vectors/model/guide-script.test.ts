import { describe, expect, it } from 'vitest';
import { GUIDE_FILES, GUIDE_LOOP_MS, GUIDE_MODEL_BYTES, GUIDE_PASSAGES, GUIDE_STILL_MS, guideFrame } from './guide-script';

const sample = (stepMs: number) => Array.from({ length: Math.floor(GUIDE_LOOP_MS / stepMs) }, (_, index) => guideFrame(index * stepMs));

describe('guideFrame', () => {
  it('plays download, fit, read, done and ask once each, in that order', () => {
    const scenes = sample(50).map((frame) => frame.scene).filter((scene, index, all) => scene !== all[index - 1]);
    expect(scenes).toEqual(['download', 'fit', 'read', 'done', 'ask']);
  });

  it('never moves a count backwards within one loop', () => {
    const frames = sample(20);
    for (const key of ['downloadedBytes', 'filesDone', 'typed', 'results'] as const) {
      const values = frames.map((frame) => frame[key]);
      expect(values.every((value, index) => index === 0 || value >= values[index - 1]!), key).toBe(true);
    }
    const passages = frames.map((frame) => frame.stage.passagesDone).filter((_, index) => frames[index]!.scene === 'read');
    expect(passages.every((value, index) => index === 0 || value >= passages[index - 1]!)).toBe(true);
  });

  it('ends the download at the real model size and the read at every sample file', () => {
    const lastDownload = sample(10).filter((frame) => frame.scene === 'download').at(-1)!;
    expect(lastDownload.downloadedBytes / GUIDE_MODEL_BYTES).toBeGreaterThan(0.99);
    const done = sample(50).find((frame) => frame.scene === 'done')!;
    expect(done.filesDone).toBe(GUIDE_FILES);
    expect(done.stage.passagesDone).toBe(GUIDE_PASSAGES);
    expect(done.stage.steps.every((step) => step.state === 'done')).toBe(true);
  });

  it('wraps past one loop and keeps the still frame on the answered question', () => {
    expect(guideFrame(GUIDE_LOOP_MS + 100)).toEqual(guideFrame(100));
    const still = guideFrame(GUIDE_STILL_MS);
    expect(still.scene).toBe('ask');
    expect(still.typed).toBe(1);
    expect(still.results).toBe(2);
  });
});
