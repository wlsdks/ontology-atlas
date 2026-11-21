import { describe, expect, it } from 'vitest';

import { appendEvent, type AcpEvent } from './acp-events';

describe('appendEvent — streamed chunks continue their row', () => {
  it('joins an agent chunk onto the agent row before it', () => {
    const prev: AcpEvent[] = [{ kind: 'agent', id: 'a', text: 'Hel' }];
    expect(appendEvent(prev, { kind: 'agent', id: 'b', text: 'lo' })).toEqual([
      { kind: 'agent', id: 'a', text: 'Hello' },
    ]);
  });

  it('starts a new row when the kind changes, so a thought never merges into an answer', () => {
    const prev: AcpEvent[] = [{ kind: 'thought', id: 't', text: 'thinking' }];
    expect(appendEvent(prev, { kind: 'agent', id: 'a', text: 'answer' })).toHaveLength(2);
  });

  it('never merges two user rows: each send is its own turn', () => {
    const prev: AcpEvent[] = [{ kind: 'user', id: 'u1', text: 'one' }];
    expect(appendEvent(prev, { kind: 'user', id: 'u2', text: 'two' })).toHaveLength(2);
  });

  it('leaves the previous list untouched', () => {
    const prev: AcpEvent[] = [{ kind: 'agent', id: 'a', text: 'x' }];
    appendEvent(prev, { kind: 'agent', id: 'b', text: 'y' });
    expect(prev).toEqual([{ kind: 'agent', id: 'a', text: 'x' }]);
  });
});
