import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DOCKS = globSync('src/views/**/*AgentDock.tsx');

function chatPanelProps(source: string): string[] {
  return [...source.matchAll(/<AcpChatPanel\b([\s\S]*?)\/>/g)].map((match) => match[1]);
}

describe('agent docks resume the conversation a person left', () => {
  it('finds every dock that mounts the chat panel', () => {
    expect(DOCKS.length).toBeGreaterThanOrEqual(4);
  });

  it.each(DOCKS)('%s reopens the latest conversation of its folder', (file) => {
    const panels = chatPanelProps(readFileSync(file, 'utf8'));
    expect(panels.length, `${file} mounts no chat panel`).toBeGreaterThan(0);
    for (const props of panels) expect(props).toMatch(/^\s*resumeLatest\s*$/m);
  });
});
