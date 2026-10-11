import { describe, expect, it } from 'vitest';

import en from '../../messages/en.json';
import ko from '../../messages/ko.json';
import {
  LABELLED_VAULT_TOOLS,
  VAULT_TOOL_LABEL_KEYS,
  toolLabel,
} from '../../src/widgets/acp-chat-panel/ui/tool-label';
import { TOOLS_FOR_LIST } from '../../mcp/src/server/registry.mjs';

/**
 * The subject list is the server's own (`TOOLS_FOR_LIST`), not hand-kept, so a new tool arrives here
 * the moment it arrives on the wire.
 */
const ADVERTISED: string[] = (TOOLS_FOR_LIST as Array<{ name: string }>).map((tool) => tool.name);

describe('the transcript has a word for every tool our server advertises', () => {
  it('has subjects at all — an empty inventory would make every check below vacuous', () => {
    expect(ADVERTISED.length).toBeGreaterThan(30);
  });

  it('labels every advertised tool', () => {
    const missing = ADVERTISED.filter((name) => !LABELLED_VAULT_TOOLS.includes(name));
    expect(
      missing,
      `these tools would print their function name in the conversation: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('resolves each advertised tool to a known label through the real reader', () => {
    for (const name of ADVERTISED) {
      const label = toolLabel(`mcp__atlas-vault__${name}`, 'atlas-vault');
      expect(label.kind, `${name} fell through to its raw name`).toBe('known');
    }
  });

  it('carries the sentence in both languages for every label the table uses', () => {
    for (const key of VAULT_TOOL_LABEL_KEYS) {
      expect(en.acpChat.tool, `en is missing ${key}`).toHaveProperty(key);
      expect(ko.acpChat.tool, `ko is missing ${key}`).toHaveProperty(key);
    }
  });

  it('keeps no label nobody uses — an unused word is a spelling nobody checks', () => {
    const declared = Object.keys(en.acpChat.tool);
    const unused = declared.filter((key) => !VAULT_TOOL_LABEL_KEYS.includes(key));
    expect(unused, `these words are written but never reached: ${unused.join(', ')}`).toEqual([]);
  });

  it('still shows a foreign tool its own name rather than inventing a meaning', () => {
    expect(toolLabel('mcp__someone-else__do_thing', 'atlas-vault')).toEqual({
      kind: 'raw',
      text: 'do_thing',
    });
  });
});
