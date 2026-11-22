import { describe, expect, it } from 'vitest';

import { applyCurrentMode, readSessionChoices, type AcpSessionChoices } from './acp-session-choices';

/**
 * `current_mode_update` carries only the mode id, so state comes from what is on hand
 * plus the standing safety decision.
 */
describe('applyCurrentMode — the adapter moved the session, not the person', () => {
  const base: AcpSessionChoices = readSessionChoices({
    modes: {
      currentModeId: 'default',
      availableModes: [
        { id: 'default', name: 'Manual', _meta: { kind: 'standard' } },
        { id: 'plan', name: 'Plan', _meta: { kind: 'plan' } },
      ],
    },
  });

  it('follows a mode already on the list and changes nothing else', () => {
    const next = applyCurrentMode(base, 'plan');
    expect(next.currentModeId).toBe('plan');
    expect(next.modes).toEqual(base.modes);
    expect(next.unverifiedModeIds).toEqual([]);
  });

  it('states a gate-removing clamp without offering it back', () => {
    /*
     * `acceptEdits` is where `claude-agent-acp` 0.74.0 lands a session whose model cannot do `auto`.
     * The screen must say where the session is; putting the row into the list would hand the person
     * a way to return to it, which is the one thing `mode-safety.ts` exists to prevent.
     */
    const next = applyCurrentMode(base, 'acceptEdits');
    expect(next.currentModeId).toBe('acceptEdits');
    expect(next.modes.map((m) => m.id)).toEqual(['default', 'plan']);
    expect(next.unverifiedModeIds).toEqual([]);
  });

  it('reflects a local permission profile without reoffering it', () => {
    const next = applyCurrentMode(base, 'permission-profile:local');
    expect(next.currentModeId).toBe('permission-profile:local');
    expect(next.modes).toEqual(base.modes);
    expect(next.unverifiedModeIds).toEqual([]);
  });

  it('shows a mode nobody advertised, marked unchecked — the dropdown must not go blank', () => {
    const next = applyCurrentMode(base, 'brand-new');
    expect(next.currentModeId).toBe('brand-new');
    expect(next.modes.map((m) => m.id)).toEqual(['default', 'plan', 'brand-new']);
    expect(next.unverifiedModeIds).toEqual(['brand-new']);
  });

  it('does not add the same unadvertised mode twice', () => {
    const once = applyCurrentMode(base, 'brand-new');
    const twice = applyCurrentMode(applyCurrentMode(once, 'plan'), 'brand-new');
    expect(twice.modes.map((m) => m.id)).toEqual(['default', 'plan', 'brand-new']);
    expect(twice.unverifiedModeIds).toEqual(['brand-new']);
  });
});
