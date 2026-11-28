import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

import { REPO_ROOT } from '../paths.mjs';
import { structuredContentFailure } from './structured-content.mjs';

export function firstContactLocalProbeFailure(responses, {
  repoRoot = REPO_ROOT,
  vaultRoot,
} = {}) {
  const canonical = (value) => {
    try {
      return realpathSync(value);
    } catch {
      return resolve(value);
    }
  };
  const expectedRepoRoot = canonical(repoRoot);
  const expectedVaultRoot = canonical(vaultRoot);
  const checks = [
    {
      id: 73,
      label: 'connection_info',
      validate(payload) {
        if (typeof payload.vaultRoot !== 'string' || payload.vaultRoot.trim() === '') {
          return 'wrong_vault: connection_info.vaultRoot is missing';
        }
        if (typeof payload.repoRoot !== 'string' || payload.repoRoot.trim() === '') {
          return 'wrong_repo_root: connection_info.repoRoot is missing';
        }
        if (canonical(payload.vaultRoot) !== expectedVaultRoot) {
          return `wrong_vault: connection_info.vaultRoot ${JSON.stringify(payload.vaultRoot)} does not match expected ${JSON.stringify(expectedVaultRoot)}`;
        }
        if (canonical(payload.repoRoot) !== expectedRepoRoot) {
          return `wrong_repo_root: connection_info.repoRoot ${JSON.stringify(payload.repoRoot)} does not match expected ${JSON.stringify(expectedRepoRoot)}`;
        }
        if (typeof payload.sameRoot !== 'boolean' || payload.restartRequiredForRootChange !== true) {
          return 'connection_info scope metadata drift';
        }
        if (!payload.server || !Number.isInteger(payload.server.toolCount) || !Array.isArray(payload.server.toolNames)) {
          return 'connection_info server inventory metadata missing';
        }
        return null;
      },
    },
  ];
  for (const check of checks) {
    const response = responses.find((candidate) => candidate?.id === check.id);
    if (!response?.result) return `no ${check.label} live probe response`;
    if (response.result.isError === true) return `${check.label} live probe returned a tool error`;
    let parsed;
    try {
      parsed = JSON.parse(response.result.content?.[0]?.text || '{}');
    } catch (error) {
      return `${check.label} live probe returned invalid JSON: ${error.message}`;
    }
    const parityFailure = structuredContentFailure(response, parsed, check.label);
    if (parityFailure) return parityFailure;
    const failure = check.validate(parsed);
    if (failure) return failure;
  }
  return null;
}
