import type { HarnessScanPort } from '@/entities/agent-files';
import { parseNativeError } from '@/shared/lib/desktop-shell/native-error';
import { toErrorMessage } from '@/shared/lib/failures/error-message';
import { codedFailure, failureCodeOf } from '@/shared/lib/failures/failure-code';
import {
  listTauriVaultEntries,
  readTauriVaultTextFile,
} from '@/shared/lib/vault-folder/tauri-vault-fs';

const NOT_A_DIRECTORY = /not a directory|os error 20\)/i;
/* A directory or a binary file where text was asked is not a guide, so it reads as no text. */
const NOT_TEXT = /is a directory|os error 21\)|valid utf-8/i;

function absentOrThrow(error: unknown, relativePath: string, notText = false): null {
  const raw = toErrorMessage(error) ?? String(error);
  if (failureCodeOf(raw) === 'target-missing' || NOT_A_DIRECTORY.test(raw)) return null;
  if (notText && NOT_TEXT.test(raw)) return null;
  const code = parseNativeError(raw).code ?? failureCodeOf(raw) ?? 'harness-read-failed';
  throw codedFailure(code, `${relativePath || '.'}: ${raw}`);
}

export function bridgePort(sourceRoot: string): HarnessScanPort {
  return {
    async listDir(relativePath) {
      try {
        return await listTauriVaultEntries(sourceRoot, relativePath);
      } catch (error) {
        return absentOrThrow(error, relativePath);
      }
    },
    async readText(relativePath) {
      try {
        return await readTauriVaultTextFile(sourceRoot, relativePath);
      } catch (error) {
        return absentOrThrow(error, relativePath, true);
      }
    },
  };
}
