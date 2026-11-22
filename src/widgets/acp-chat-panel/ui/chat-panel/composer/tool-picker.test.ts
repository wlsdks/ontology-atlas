import { describe, expect, it } from 'vitest';

import { toolPickerOptions, toolPickerValueOf } from './tool-picker';

const runtimes = [
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
];

describe('toolPickerOptions', () => {
  it('expands only the current agent into its models', () => {
    expect(
      toolPickerOptions({ runtimes, runtimeId: 'claude', runtimeLabel: 'Claude', models: [{ id: 'opus', name: 'Opus' }] }),
    ).toEqual([
      { value: 'model:opus', label: 'Claude · Opus' },
      { value: 'runtime:codex', label: 'Codex' },
    ]);
  });

  it('lists each agent once when no models are known', () => {
    expect(toolPickerOptions({ runtimes, runtimeId: 'claude', runtimeLabel: 'Claude', models: [] }).map((o) => o.value)).toEqual([
      'runtime:claude',
      'runtime:codex',
    ]);
  });

  it('offers the current agent alone when there is no list', () => {
    expect(toolPickerOptions({ runtimes: [], runtimeId: 'claude', runtimeLabel: 'Claude', models: [] })).toEqual([
      { value: 'runtime:claude', label: 'Claude' },
    ]);
  });
});

describe('toolPickerValueOf', () => {
  it('selects the current model, or nothing while it is unknown, or the agent when there are no models', () => {
    expect(toolPickerValueOf({ runtimeId: 'claude', models: [{ id: 'opus' }], currentModelId: 'opus' })).toBe('model:opus');
    expect(toolPickerValueOf({ runtimeId: 'claude', models: [{ id: 'opus' }], currentModelId: null })).toBe('');
    expect(toolPickerValueOf({ runtimeId: 'claude', models: [], currentModelId: 'opus' })).toBe('runtime:claude');
  });
});
