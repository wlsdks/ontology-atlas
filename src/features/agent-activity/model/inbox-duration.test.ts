import { describe, expect, it } from 'vitest';

import { inboxDuration } from './inbox-duration';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

describe('inboxDuration', () => {
  it('says nothing under a second: a task that wrote once lasted 0 ms', () => {
    expect(inboxDuration(0)).toBeNull();
    expect(inboxDuration(999)).toBeNull();
    expect(inboxDuration(Number.NaN)).toBeNull();
    expect(inboxDuration(-5 * SECOND)).toBeNull();
  });

  it('counts seconds from one second up', () => {
    expect(inboxDuration(SECOND)).toEqual({ unit: 'seconds', seconds: 1 });
    expect(inboxDuration(45 * SECOND + 900)).toEqual({ unit: 'seconds', seconds: 45 });
  });

  it('keeps the next unit only when it is not zero, at every size', () => {
    expect(inboxDuration(2 * MINUTE + 5 * SECOND)).toEqual({ unit: 'minutes', minutes: 2, seconds: 5 });
    expect(inboxDuration(2 * MINUTE)).toEqual({ unit: 'minutes', minutes: 2, seconds: 0 });
    expect(inboxDuration(HOUR + 5 * MINUTE + 30 * SECOND)).toEqual({ unit: 'hours', hours: 1, minutes: 5 });
    expect(inboxDuration(HOUR + 30 * SECOND)).toEqual({ unit: 'hours', hours: 1, minutes: 0 });
  });
});
