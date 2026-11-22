import { describe, expect, it } from 'vitest';
import {
  configFileState,
  configFilesFor,
  isAgentSetupReady,
  summarizeAgentSetupFiles,
  validationStateOf,
  validationToneOf,
  type AgentConfigStatus,
} from './agent-setup-status';

const BOTH_READY: AgentConfigStatus = {
  mcpJson: true,
  codexConfig: true,
  mcpExample: false,
};

describe('configFileState', () => {
  it('calls an absent file missing even when a stale validity flag is set', () => {
    expect(configFileState(false, false)).toBe('missing');
    expect(configFileState(undefined, undefined)).toBe('missing');
  });

  it('calls a present file invalid only when validity is explicitly false', () => {
    expect(configFileState(true, false)).toBe('invalid');
    expect(configFileState(true, true)).toBe('ready');
    expect(configFileState(true, undefined)).toBe('ready');
  });
});

describe('isAgentSetupReady', () => {
  it('needs a launchable server and both active files present and not invalid', () => {
    expect(isAgentSetupReady(true, BOTH_READY)).toBe(true);
    expect(isAgentSetupReady(false, BOTH_READY)).toBe(false);
    expect(isAgentSetupReady(true, { ...BOTH_READY, codexConfig: false })).toBe(false);
    expect(isAgentSetupReady(true, { ...BOTH_READY, mcpJsonValid: false })).toBe(false);
    expect(isAgentSetupReady(true, { ...BOTH_READY, codexConfigValid: false })).toBe(false);
  });

  it('does not count the example template', () => {
    const invalidExample = { ...BOTH_READY, mcpExampleValid: false };
    expect(isAgentSetupReady(true, invalidExample)).toBe(true);
  });
});

describe('summarizeAgentSetupFiles', () => {
  it('counts a present, valid file as ready', () => {
    expect(summarizeAgentSetupFiles(BOTH_READY)).toEqual({
      readyCount: 2,
      hasMissing: false,
      hasInvalid: false,
    });
  });

  it('separates a missing file from an invalid one', () => {
    expect(summarizeAgentSetupFiles({ ...BOTH_READY, codexConfig: false })).toEqual({
      readyCount: 1,
      hasMissing: true,
      hasInvalid: false,
    });
    expect(summarizeAgentSetupFiles({ ...BOTH_READY, mcpJsonValid: false })).toEqual({
      readyCount: 1,
      hasMissing: false,
      hasInvalid: true,
    });
  });

  it('never reports a missing file as invalid', () => {
    const missingAndFlagged = { ...BOTH_READY, mcpJson: false, mcpJsonValid: false };
    expect(summarizeAgentSetupFiles(missingAndFlagged).hasInvalid).toBe(false);
  });
});

describe('validation state and tone', () => {
  it('ranks errors above warnings and treats no summary as unknown', () => {
    expect(validationStateOf(null)).toBe('unknown');
    expect(validationStateOf({ errorCount: 1, warningCount: 5 })).toBe('error');
    expect(validationStateOf({ errorCount: 0, warningCount: 2 })).toBe('warning');
    expect(validationStateOf({ errorCount: 0, warningCount: 0 })).toBe('clean');
  });

  it('is ready only for a clean vault and blocked only for errors', () => {
    expect(validationToneOf('clean')).toBe('ready');
    expect(validationToneOf('error')).toBe('blocked');
    expect(validationToneOf('warning')).toBe('warning');
    expect(validationToneOf('unknown')).toBe('warning');
  });
});

describe('configFilesFor', () => {
  it('names the files of one tool when a tool is given', () => {
    expect(configFilesFor('codex')).toBe('.codex/config.toml');
  });

  it('names every tool file when no tool is given', () => {
    const files = configFilesFor(undefined);
    expect(files).toContain('.mcp.json');
    expect(files).toContain('.codex/config.toml');
    expect(files).toContain('.cursor/mcp.json');
  });
});
