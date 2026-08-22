import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const agentsPage = readFileSync('src/views/agents/ui/AgentsPage.tsx', 'utf8');
const home = readFileSync('src/views/home/ui/HomePage.tsx', 'utf8');

describe('agents destination to map chat handoff', () => {
  it('queues the chosen runtime before navigating to the map', () => {
    expect(agentsPage).toContain('queueAgentChatIntent(runtimeId)');
    expect(agentsPage).toContain('router.push(DESTINATION_HREF.map)');
    expect(agentsPage).toContain('onOpenChat={openChatOnMap}');
  });

  it('the map consumes the one-shot request only after that runtime is ready', () => {
    expect(home).toContain('consumeQueuedAgentChatIntent()');
    expect(home).toContain('acpRuntime?.id !== pendingAgentChatRuntimeId');
    expect(home).toContain('setPendingAgentChatRuntimeId(null)');
  });
});
