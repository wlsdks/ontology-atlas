import type { AcpPermissionRequest } from './permission-request';

const HIDDEN_OR_CONTROL_CHARACTER = /[\p{Cc}\p{Cf}\u2028\u2029]/u;

/**
 * A plain file read in the vault's connected code folder that the turn may allow without a card. Only
 * kind `read`: a search's folder can come from a pattern argument the path verdict never judged. Every
 * string argument must be the judged path itself, unpadded, so the tool cannot open another file.
 */
export function isCodeFolderFileRead(request: AcpPermissionRequest): boolean {
  if (request.reviewKind !== 'permission' || request.toolKind !== 'read') return false;
  if (request.toolName?.startsWith('mcp__') || request.pathVerdict !== 'allow-inside-code-folder') return false;
  const filePath = request.filePath;
  if (!filePath || filePath !== filePath.trim() || HIDDEN_OR_CONTROL_CHARACTER.test(filePath)) return false;
  const strings = Object.values(request.rawInput).filter((value) => typeof value === 'string');
  if (strings.length === 0 || strings.some((value) => value !== filePath)) return false;
  return Object.values(request.rawInput).every((value) => typeof value === 'string' || typeof value === 'number');
}
