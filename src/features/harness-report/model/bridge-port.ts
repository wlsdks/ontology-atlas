import type { HarnessScanPort } from '@/entities/agent-files';
import { parseNativeError } from '@/shared/lib/desktop-shell/native-error';
import { toErrorMessage } from '@/shared/lib/failures/error-message';
import { codedFailure } from '@/shared/lib/failures/failure-code';
import {
  harnessSourcePathExists,
  listHarnessSourceDirectory,
  readHarnessSourceText,
} from '@/shared/lib/project-source/tauri-harness-source';

const ABSENT_AS_DIRECTORY = new Set(['harness-path-missing', 'harness-not-a-directory']);
const ABSENT_AS_TEXT = new Set([
  'harness-path-missing',
  'harness-not-a-file',
  'harness-not-text',
  'harness-file-too-large',
]);

function refuse(error: unknown, relativePath: string): never {
  const raw = toErrorMessage(error) ?? String(error);
  throw codedFailure(
    parseNativeError(error).code ?? 'harness-read-failed',
    `${relativePath || '.'}: ${raw}`,
  );
}

function absentOrThrow(error: unknown, relativePath: string, absent: ReadonlySet<string>): null {
  const code = parseNativeError(error).code;
  if (code && absent.has(code)) return null;
  return refuse(error, relativePath);
}

export function bridgePort(source: { vaultRoot: string; projectSlug: string }): HarnessScanPort {
  const { vaultRoot, projectSlug } = source;
  return {
    async listDir(relativePath) {
      try {
        return await listHarnessSourceDirectory(vaultRoot, projectSlug, relativePath);
      } catch (error) {
        return absentOrThrow(error, relativePath, ABSENT_AS_DIRECTORY);
      }
    },
    async readText(relativePath) {
      try {
        return await readHarnessSourceText(vaultRoot, projectSlug, relativePath);
      } catch (error) {
        return absentOrThrow(error, relativePath, ABSENT_AS_TEXT);
      }
    },
    async pathExists(relativePath) {
      try {
        return await harnessSourcePathExists(vaultRoot, projectSlug, relativePath);
      } catch (error) {
        return refuse(error, relativePath);
      }
    },
  };
}
