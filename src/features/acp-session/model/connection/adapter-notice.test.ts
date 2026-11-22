import { describe, expect, it } from 'vitest';

import { readAdapterNotice } from './adapter-notice';

describe('reading a notice the shell sends about the adapter', () => {
  it('reads the megabytes of a download in flight, and none when the number is not one', () => {
    expect(readAdapterNotice('npx-download-progress:12.5')).toEqual({ kind: 'download-progress', megabytes: 12.5 });
    expect(readAdapterNotice('npx-download-progress:soon')).toEqual({ kind: 'download-progress', megabytes: null });
    expect(readAdapterNotice('npx-download-progress:Infinity')).toEqual({ kind: 'download-progress', megabytes: null });
  });

  it('tells a first download, its end and a gate that was not raised apart', () => {
    expect(readAdapterNotice('npx-first-run-download: claude-acp')).toEqual({ kind: 'first-run-download' });
    expect(readAdapterNotice('npx-download-done')).toEqual({ kind: 'download-done' });
    expect(readAdapterNotice('gate-off:settings')).toEqual({ kind: 'gate-off' });
  });

  it('leaves every other line as an ordinary diagnostic', () => {
    expect(readAdapterNotice('adapter started')).toEqual({ kind: 'other' });
    expect(readAdapterNotice('')).toEqual({ kind: 'other' });
  });
});
