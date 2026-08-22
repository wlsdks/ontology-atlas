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

    expect(listener).toHaveBeenCalledWith('claude-acp');
    unsubscribe();
  });

  it('carries one runtime across a destination change and consumes it once', () => {
    queueAgentChatIntent('codex');

    expect(consumeQueuedAgentChatIntent()).toBe('codex');
    expect(consumeQueuedAgentChatIntent()).toBeUndefined();
  });

  it('drops malformed queued data instead of opening an invented runtime', () => {
    window.sessionStorage.setItem('ontology-atlas:agent-chat-intent:pending', '{broken');
    expect(consumeQueuedAgentChatIntent()).toBeUndefined();
  });
});
