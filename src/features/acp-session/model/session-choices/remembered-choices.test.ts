import { beforeEach, describe, expect, it } from 'vitest';

import { rememberModel, rememberTool, rememberedModel, rememberedTool } from './remembered-choices';

const KEY = 'ontology-atlas:agent-choices';
const FOLDER = '/Users/probe/notes';

beforeEach(() => {
  window.localStorage.clear();
});

describe('the chat tool and model kept for a folder', () => {
  it('keeps the tool per folder and the model per folder and tool', () => {
    rememberTool(FOLDER, 'codex-acp');
    rememberModel(FOLDER, 'codex-acp', 'large');
    rememberModel(FOLDER, 'claude-acp', 'small');

    expect(rememberedTool(FOLDER)).toBe('codex-acp');
    expect(rememberedModel(FOLDER, 'codex-acp')).toBe('large');
    expect(rememberedModel(FOLDER, 'claude-acp')).toBe('small');
    expect(rememberedTool('/Users/probe/other')).toBeNull();
    expect(rememberedModel('/Users/probe/other', 'codex-acp')).toBeNull();
  });

  it('replaces the earlier choice instead of adding a second entry', () => {
    rememberTool(FOLDER, 'claude-acp');
    rememberTool(FOLDER, 'codex-acp');
    expect(rememberedTool(FOLDER)).toBe('codex-acp');
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? '{}').tools).toHaveLength(1);
  });

  it('keeps nothing without a folder path, as on the web', () => {
    rememberTool(null, 'codex-acp');
    rememberModel(null, 'codex-acp', 'large');
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(rememberedTool(null)).toBeNull();
  });

  it('reads a corrupt or foreign value as nothing kept', () => {
    for (const raw of ['{not json', '[]', '{"v":2,"tools":[["/x","a"]]}', '{"v":1,"tools":[["/x"],["/x",7]],"models":"no"}']) {
      window.localStorage.setItem(KEY, raw);
      expect(rememberedTool('/x')).toBeNull();
      expect(rememberedModel('/x', 'a')).toBeNull();
    }
  });

  it('treats a folder named like an object member as nothing but a key', () => {
    expect(rememberedTool('__proto__')).toBeNull();
    rememberTool('__proto__', 'codex-acp');
    expect(rememberedTool('__proto__')).toBe('codex-acp');
    expect(rememberedTool('constructor')).toBeNull();
  });
});
