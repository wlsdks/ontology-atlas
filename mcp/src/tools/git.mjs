import {
  inspectVaultGit,
  inspectVaultGitHistory,
  snapshotVaultGit,
} from '../git-tools.mjs';
import {
  REPO_ROOT,
  VAULT_ROOT,
} from '../server/runtime.mjs';
import {
  requireOptionalBoolean,
  requireOptionalNonBlankString,
  requireOptionalPositiveInteger,
} from '../server/validate.mjs';
import { validateVaultTool } from './validate-vault.mjs';

/** The three git tools: working-tree status, recent history, and a vault snapshot commit. */

function gitStatusTool() {
  return inspectVaultGit({ repoRoot: REPO_ROOT, vaultRoot: VAULT_ROOT });
}

function gitHistoryTool({ limit = 20 } = {}) {
  requireOptionalPositiveInteger(limit, 'limit', { max: 100 });
  return inspectVaultGitHistory({
    repoRoot: REPO_ROOT,
    vaultRoot: VAULT_ROOT,
    limit,
  });
}

function gitSnapshotTool({ confirm = false, expectedHead, message } = {}) {
  requireOptionalBoolean(confirm, 'confirm');
  requireOptionalNonBlankString(expectedHead, 'expectedHead');
  requireOptionalNonBlankString(message, 'message');
  if (message !== undefined && (message.length > 200 || /[\r\n]/.test(message))) {
    throw new Error('message must be one line and at most 200 characters.');
  }

  const report = validateVaultTool();
  const validation = {
    scanned: report.scanned,
    problemFiles: report.summary.problemFiles,
    errorFiles: report.summary.errorFiles,
    warningFiles: report.summary.warningFiles,
    pathDrifts: report.pathDrift.drifts.length,
  };
  if (confirm && validation.errorFiles > 0) {
    throw new Error(
      `git_snapshot blocked: validate_vault found ${validation.errorFiles} file(s) with errors. Repair them and run a new dry-run.`,
    );
  }

  const result = snapshotVaultGit({
    repoRoot: REPO_ROOT,
    vaultRoot: VAULT_ROOT,
    confirm,
    expectedHead,
    message,
  });
  const validationBlocker =
    validation.errorFiles > 0
      ? `validate_vault reports ${validation.errorFiles} file(s) with errors; repair them before confirmation`
      : null;
  const blockedReasons = [
    ...(Array.isArray(result.blockedReasons) ? result.blockedReasons : []),
    ...(validationBlocker ? [validationBlocker] : []),
  ];
  const guardedResult = {
    ...result,
    canConfirm: result.canConfirm === true && !validationBlocker,
    blockedReasons: [...new Set(blockedReasons)],
  };
  if (!result.risk) return { ...guardedResult, validation };

  const validationWarnings = [
    ...(validation.warningFiles > 0
      ? [`validate_vault reports ${validation.warningFiles} warning-only file(s)`]
      : []),
    ...(validation.pathDrifts > 0
      ? [`validate_vault reports ${validation.pathDrifts} code-path drift(s)`]
      : []),
  ];
  return {
    ...guardedResult,
    validation,
    risk: {
      level:
        validation.errorFiles > 0
          ? 'high'
          : validationWarnings.length > 0 && result.risk.level === 'low'
            ? 'medium'
            : result.risk.level,
      warnings: [...result.risk.warnings, ...validationWarnings],
    },
  };
}

export {
  gitStatusTool,
  gitHistoryTool,
  gitSnapshotTool,
};
