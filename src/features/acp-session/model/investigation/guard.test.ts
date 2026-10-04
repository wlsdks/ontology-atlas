import { describe, expect, it } from 'vitest';
import type { AcpSessionChoices } from '../acp-client';
import { investigationPermissionVerified } from './guard';

const choices = (id: string | null, metaKind?: string): AcpSessionChoices => ({
  models: [], currentModelId: null, modes: id ? [{id, name:id, description:null, metaKind, meta:null}] : [], currentModeId: id,
  unverifiedModeIds: [], droppedModeCount: 0,
});

describe('permission proof for explicit investigation sends', () => {
  it('requires the measured mode and MCP consent for the mode-gated runtime', () => {
    expect(investigationPermissionVerified('codex-acp', choices('read-only'), true, false)).toBe(true);
    expect(investigationPermissionVerified('codex-acp', choices('read-only'), false, false)).toBe(false);
  });
  it('uses runtime-owned config isolation only with a verified current mode', () => {
    expect(investigationPermissionVerified('claude-acp', choices('default', 'standard'), false, false)).toBe(true);
    expect(investigationPermissionVerified('claude-acp', choices(null), false, false)).toBe(false);
  });
  it.each(['acceptEdits', 'brand-new', 'auto'])('refuses %s without changing ordinary chat mode choices', id => {
    expect(investigationPermissionVerified('claude-acp', choices(id), false, false)).toBe(false);
  });
  it('refuses a known id with unsafe metadata or a live gate-off notice', () => {
    expect(investigationPermissionVerified('claude-acp', choices('default', 'full_access'), false, false)).toBe(false);
    expect(investigationPermissionVerified('claude-acp', choices('default'), false, true)).toBe(false);
  });
  it('never credits an unsupported runtime merely because a consent flag exists', () => {
    expect(investigationPermissionVerified('unknown-runtime', choices('read-only'), true, false)).toBe(false);
  });
  it('does not upgrade a placeholder or omitted mode descriptor into a verified mode', () => {
    const unchecked = {...choices('default'),unverifiedModeIds:['default']};
    expect(investigationPermissionVerified('claude-acp', unchecked, false, false)).toBe(false);
    expect(investigationPermissionVerified('codex-acp', {...choices('read-only'),modes:[]}, true, false)).toBe(false);
  });
});
