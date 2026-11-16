import type { AcpPermissionRequest } from '../acp-client';
import { atlasToolMode } from './atlas-tool-policy';

/**
 * The Atlas writes a person's auto-approve choice may answer: additive or rewording changes a Git
 * diff can undo. Every other write, including a tool the server adds later, still shows the card.
 */
export const STANDING_APPROVAL_ATLAS_WRITES: ReadonlySet<string> = new Set([
  'add_concept',
  'add_concepts',
  'add_relation',
  'add_relations',
  'patch_concept',
  'replace_relation',
  'rename_concept',
  'reclassify_concept',
]);

export interface StandingApprovalContext {
  enabled: boolean;
  /** The opened folder, as the session was started with it. */
  vaultRoot: string | null;
  /** The wired Atlas server's name, or null when none is wired. */
  vaultMcpServerName: string | null;
}

export interface StandingApprovalAnswer {
  optionId: string;
  /** The file name or bare tool name the transcript names. */
  target: string;
}

const PATH_SEPARATOR = /[\\/]/;

/**
 * Answers `allow_once` for the bounded auto-approve scope, or null to show the card. Every check
 * fails closed: a missing field, an unknown kind or a path it cannot judge returns null.
 */
export function standingApproval(
  request: AcpPermissionRequest,
  context: StandingApprovalContext,
): StandingApprovalAnswer | null {
  if (!context.enabled || request.toolKind === 'switch_mode') return null;
  const allowOnce = request.options.filter((option) => option.kind === 'allow_once');
  if (allowOnce.length !== 1) return null;
  const target = request.reviewKind === 'ontology-write'
    ? approvableAtlasWrite(request, context.vaultMcpServerName)
    : approvableVaultEdit(request, context.vaultRoot);
  return target ? { optionId: allowOnce[0].optionId, target } : null;
}

function approvableAtlasWrite(
  request: AcpPermissionRequest,
  serverName: string | null,
): string | null {
  const toolName = request.toolName;
  if (!serverName || !toolName || atlasToolMode(toolName, serverName) !== 'write') return null;
  const bareName = toolName.slice(`mcp__${serverName}__`.length);
  return STANDING_APPROVAL_ATLAS_WRITES.has(bareName) ? bareName : null;
}

function approvableVaultEdit(request: AcpPermissionRequest, vaultRoot: string | null): string | null {
  if (request.reviewKind !== 'permission' || request.toolKind !== 'edit') return null;
  if (request.toolName?.startsWith('mcp__')) return null;
  if (request.pathVerdict !== 'allow-inside-vault') return null;
  const filePath = request.filePath;
  const root = vaultRoot?.replace(/\/+$/, '');
  if (!filePath || !root || !filePath.startsWith('/') || !filePath.startsWith(`${root}/`)) return null;
  if (filePath.split(PATH_SEPARATOR).includes('..')) return null;
  const below = filePath.slice(root.length + 1).split(PATH_SEPARATOR).filter(Boolean);
  if (below.length === 0 || below.some((segment) => segment.startsWith('.'))) return null;
  return below[below.length - 1];
}
