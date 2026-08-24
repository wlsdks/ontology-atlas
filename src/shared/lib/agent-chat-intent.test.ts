import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  consumeQueuedAgentChatIntent,
  queueAgentChatIntent,
  requestAgentChat,
  subscribeAgentChatIntent,
} from './agent-chat-intent';

describe('agent chat intent', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('delivers a same-screen request through the live window event', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAgentChatIntent(listener);

    requestAgentChat('claude-acp');

    expect(listener).toHaveBeenCalledWith('claude-acp', null);
    unsubscribe();
  });

  it('carries one runtime across a destination change and consumes it once', () => {
    queueAgentChatIntent('codex');

    expect(consumeQueuedAgentChatIntent()).toEqual({ runtimeId: 'codex', prompt: null });
    expect(consumeQueuedAgentChatIntent()).toBeUndefined();
  });

  /*
   * ⚠️ A door may carry a first turn (decision, 2026-08-24). The first-run card's 「make a map from
   * my code」 button presses this: the app cannot run the analysis itself — it never calls MCP —
   * so it hands the work to the agent. The sentence lands in the transcript as the person's own
   * turn, and every write it leads to still stops at the permission card.
   */
  it('carries the opening turn a door asked for, live and across a destination change', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAgentChatIntent(listener);
    requestAgentChat('claude-acp', 'Build a first ontology for /repo.');
    expect(listener).toHaveBeenCalledWith('claude-acp', 'Build a first ontology for /repo.');
    unsubscribe();

    queueAgentChatIntent('codex', 'Build a first ontology for /repo.');
    expect(consumeQueuedAgentChatIntent()).toEqual({
      runtimeId: 'codex',
      prompt: 'Build a first ontology for /repo.',
    });
  });

  it('a blank turn degrades to an ordinary open rather than sending nothing', () => {
    // The door's first promise is the conversation; the sentence is the convenience. A whitespace
    // prompt must not become an empty message the agent has to answer.
    const listener = vi.fn();
    const unsubscribe = subscribeAgentChatIntent(listener);
    requestAgentChat('claude-acp', '   ');
    expect(listener).toHaveBeenCalledWith('claude-acp', null);
    unsubscribe();

    queueAgentChatIntent('codex', '   ');
    expect(consumeQueuedAgentChatIntent()).toEqual({ runtimeId: 'codex', prompt: null });
  });

  it('drops malformed queued data instead of opening an invented runtime', () => {
    window.sessionStorage.setItem('ontology-atlas:agent-chat-intent:pending', '{broken');
    expect(consumeQueuedAgentChatIntent()).toBeUndefined();
  });
});
