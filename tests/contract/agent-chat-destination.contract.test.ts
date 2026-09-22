import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const agentsPage = readFileSync('src/views/agents/ui/AgentsPage.tsx', 'utf8');
const home = readFileSync('src/views/home/model/use-topology-agent-orchestration.tsx', 'utf8');

describe('agents destination to map chat handoff', () => {
  it('queues the chosen runtime before navigating to the map', () => {
    expect(agentsPage).toContain('queueAgentChatIntent(runtimeId)');
    expect(agentsPage).toContain('router.push(DESTINATION_HREF.map)');
    expect(agentsPage).toContain('onOpenChat={openChatOnMap}');
  });

  it('the map consumes the one-shot request only after that runtime is ready', () => {
    expect(home.includes('consumeQueuedAgentChatIntent()'), 'Missing handoff contract: consumeQueuedAgentChatIntent()').toBe(true);
    expect(home.includes('acpRuntime?.id !== pendingAgentChatRuntimeId'), 'Missing handoff contract: acpRuntime?.id !== pendingAgentChatRuntimeId').toBe(true);
    // null now means a queued task awaiting the default runner; undefined is
    // the consumed state. The rendered destination tests cover both requests.
    expect(home.includes('pendingAgentChatRuntimeId === undefined'), 'Missing handoff contract: pendingAgentChatRuntimeId === undefined').toBe(true);
    expect(home.includes('setPendingAgentChatRuntimeId(undefined)'), 'Missing handoff contract: setPendingAgentChatRuntimeId(undefined)').toBe(true);
  });
});

it("keeps the protected topology owners connected to the route", () => {
  const route = readFileSync("src/views/home/ui/HomePage.tsx", "utf8");
  expect(route).toContain('useTopologyAgentOrchestration({');
});
