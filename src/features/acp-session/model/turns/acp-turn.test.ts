import { describe, expect, it } from 'vitest';

import type { AcpEvent } from '../conversation/acp-events';
import { turnEventsSnapshot } from './acp-turn';

const events: AcpEvent[] = [
  { kind: 'user', id: 'u1', text: 'earlier turn' },
  { kind: 'agent', id: 'a1', text: 'earlier answer' },
  { kind: 'user', id: 'u2', text: 'this turn' },
  { kind: 'agent', id: 'a2', text: 'this answer' },
];

describe('turnEventsSnapshot — a finished turn hands over only its own rows', () => {
  it("starts at the turn's user row and runs to the end", () => {
    expect(turnEventsSnapshot(events, 'u2').map((event) => event.id)).toEqual(['u2', 'a2']);
  });

  it("hands over nothing once the turn's user row is gone (the conversation was cleared)", () => {
    expect(turnEventsSnapshot(events, 'missing')).toEqual([]);
  });

  it('copies each row, so a later edit to the screen does not rewrite the archive', () => {
    const snapshot = turnEventsSnapshot(events, 'u2');
    expect(snapshot[0]).toEqual(events[2]);
    expect(snapshot[0]).not.toBe(events[2]);
  });
});
