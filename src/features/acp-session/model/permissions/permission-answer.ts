import type { AcpPermissionVerdict } from '@/shared/lib/agent-chat/tauri-acp';

import type { AcpPermissionRequest } from './permission-request';
import type { AtlasToolMode } from './atlas-tool-policy';

export type PermissionOutcome =
  | { outcome: { outcome: 'selected'; optionId: string } }
  | { outcome: { outcome: 'cancelled' } };

export function selectedOutcome(optionId: string): PermissionOutcome {
  return { outcome: { outcome: 'selected', optionId } };
}

export function cancelledOutcome(): PermissionOutcome {
  return { outcome: { outcome: 'cancelled' } };
}

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/**
 * Our server names files vault-relative and Rust judges absolute paths only, so a relative path is
 * inside by construction. Anything that could point elsewhere on any platform is not relative: a
 * leading separator or UNC share, a drive letter, `~`, padding whitespace or control characters, and
 * a `..` segment in either separator.
 */
function isVaultRelativePath(filePath: string): boolean {
  if (filePath === '' || filePath !== filePath.trim() || CONTROL_CHARACTER.test(filePath)) return false;
  if (/^[\\/]/.test(filePath) || filePath.startsWith('~') || /^[A-Za-z]:/.test(filePath)) return false;
  return !filePath.split(/[\\/]/).includes('..');
}

/**
 * The option to select without asking the person, or null when the card must be shown. Never
 * `allow_always`: that grants the directory. Atlas reads do not block the conversation; a write
 * continues only after the person has seen the typed change. Path safety and meaning approval are
 * different questions.
 */
export function autoAllowOption(
  request: AcpPermissionRequest,
  atlasMode: AtlasToolMode | null,
  verdict: AcpPermissionVerdict,
): { optionId: string } | null {
  const allowOnce = request.options.find((o) => o.kind === 'allow_once');
  if (!allowOnce) return null;
  // Reads keep their auto-allow inside dot folders; only auto-approved writes need the stricter verdict.
  const insideVault = verdict === 'allow-inside-vault' || verdict === 'allow-inside-vault-hidden';
  if (atlasMode === 'read' && (request.filePath === null || isVaultRelativePath(request.filePath) || insideVault)) {
    return allowOnce;
  }
  /*
   * A non-Atlas tool is auto-allowed only inside the vault with a read-only kind: an agent edit tool on
   * vault Markdown can rewrite frontmatter. An unknown or missing kind fails closed to asking.
   */
  const readOnlyKind = request.toolKind === 'read' || request.toolKind === 'search';
  if (atlasMode === null && readOnlyKind && insideVault) return allowOnce;
  return null;
}

/**
 * The answer sent for a request: the person's choice when it really is an option of that request (a
 * screen returning a stale request's value would allow the wrong thing), else the reject option, else
 * cancelled, since no answer leaves the other side waiting forever. `null` is a refusal.
 */
export function permissionOutcome(
  options: AcpPermissionRequest['options'],
  chosen: string | null,
): PermissionOutcome {
  if (chosen && options.some((o) => o.optionId === chosen)) return selectedOutcome(chosen);
  const rejectOnce = options.find((o) => o.kind === 'reject_once');
  return rejectOnce ? selectedOutcome(rejectOnce.optionId) : cancelledOutcome();
}
