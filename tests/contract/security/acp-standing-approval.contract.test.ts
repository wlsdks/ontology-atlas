import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { STANDING_APPROVAL_ATLAS_WRITES, standingApproval } from '@/features/acp-session/model/permissions/standing-approval';

import { serverRegistry } from '../server-session/tool-surface';

/**
 * Auto-approve answers the Atlas writes a map build makes; deleting and merging concepts keep the
 * card. The server's generated tool surface is the authority for what is a write; the ask list is
 * the auto-approve decision's.
 */
const ALWAYS_ASK = ['delete_concept', 'merge_concepts'];

const ROOT = join(import.meta.dirname, '..', '..', '..');
const surface = JSON.parse(readFileSync(join(ROOT, 'docs/.generated/mcp-surface.json'), 'utf8')) as {
  mcp: { tools: Array<{ name: string; mode: 'read' | 'write' }> };
};
// A retired write is out of tools/list but still answered, so an approval naming it stays valid.
const registry = serverRegistry();
const retiredWrites = registry.retiredTools.map((tool) => tool.name).filter((name) => !registry.readTools.includes(name));
const serverWrites = [
  ...surface.mcp.tools.filter((tool) => tool.mode === 'write').map((tool) => tool.name),
  ...retiredWrites,
];

describe('auto-approve scope against the Atlas server surface', () => {
  it('names only tools the server registers as writes', () => {
    expect(serverWrites.length).toBeGreaterThan(10);
    for (const tool of STANDING_APPROVAL_ATLAS_WRITES) expect(serverWrites, tool).toContain(tool);
  });

  it('never names a tool the decision keeps on the card', () => {
    for (const tool of ALWAYS_ASK) expect([...STANDING_APPROVAL_ATLAS_WRITES], tool).not.toContain(tool);
  });

  it('answers with whichever option is allow_once, wherever it sits and whatever its id', () => {
    const request = {
      title: 'mcp__atlas-vault__add_concept', toolCallId: 'call-1', toolName: 'mcp__atlas-vault__add_concept',
      toolKind: 'other', filePath: null, rawInput: {}, reviewKind: 'ontology-write' as const,
      options: [
        { optionId: 'yes-and-remember', kind: 'allow_always', name: 'Yes, always' },
        { optionId: 'no', kind: 'reject_once', name: 'No' },
        { optionId: 'opaque-7f3a', kind: 'allow_once', name: 'Yes' },
      ],
    };
    const context = { enabled: true, vaultRoot: '/vault', vaultMcpServerName: 'atlas-vault' };
    expect(standingApproval(request, context)?.optionId).toBe('opaque-7f3a');
  });
});
