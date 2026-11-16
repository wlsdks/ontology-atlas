import { PATH_ARGUMENT_KEYS, type AcpPermissionRequest } from '../acp-client';
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

/** Bumped when a check below lets more through, so a kept choice is asked for again. */
const VAULT_EDIT_RULE = 'edit-inside-folder@1';
const ATLAS_WRITE_RULES = 'atlas-write-arguments@1';

/**
 * Everything auto-approve answers, spelled out: the two rule versions and each Atlas write. A choice kept on this Mac holds only while it
 * equals this, so widening the scope never widens what an earlier press allowed.
 */
export const STANDING_APPROVAL_SCOPE = [
  VAULT_EDIT_RULE,
  ATLAS_WRITE_RULES,
  ...[...STANDING_APPROVAL_ATLAS_WRITES].sort(),
].join(' ');

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
 * Coding agents load these as instructions. Mirrors `mcp/src/schema.mjs` (stems and character
 * class); `agent-instruction-files.contract.test.ts` holds the two together.
 */
const AGENT_INSTRUCTION_FILE_STEMS: ReadonlySet<string> = new Set(['agents', 'agents.override', 'claude', 'claude.local', 'gemini']);
const HIDDEN_OR_CONTROL_CHARACTER = /[\p{Cc}\p{Cf}\u2028\u2029]/u;

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
  if (!STANDING_APPROVAL_ATLAS_WRITES.has(bareName)) return null;
  if (bareName === 'rename_concept' && !(request.rawInput.overwrite === undefined || request.rawInput.overwrite === false)) return null;
  if (bareName === 'patch_concept' && patchRemovesContent(request.rawInput)) return null;
  return bareName;
}

/** A null or emptied frontmatter value deletes that field and an empty body blanks the node: deletions ask. */
function patchRemovesContent(rawInput: Record<string, unknown>): boolean {
  const { frontmatter, body } = rawInput;
  if (frontmatter !== undefined) {
    if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) return true;
    if (Object.values(frontmatter).some((value) => value === null || (Array.isArray(value) && value.length === 0))) return true;
  }
  return body !== undefined && (typeof body !== 'string' || body.trim() === '');
}

/** Every path-like argument must name the same file, or the judged path may not be the written one. */
function pathArgumentsAgree(rawInput: Record<string, unknown>): boolean {
  const values = PATH_ARGUMENT_KEYS.filter((key) => rawInput[key] !== undefined).map((key) => rawInput[key]);
  return values.every((value) => typeof value === 'string') && new Set(values).size <= 1;
}

function isAgentInstructionFile(fileName: string): boolean {
  const name = fileName.normalize('NFKC').toLowerCase();
  const stem = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  return AGENT_INSTRUCTION_FILE_STEMS.has(stem) || AGENT_INSTRUCTION_FILE_STEMS.has(name);
}

function approvableVaultEdit(request: AcpPermissionRequest, vaultRoot: string | null): string | null {
  if (request.reviewKind !== 'permission' || request.toolKind !== 'edit') return null;
  if (request.toolName?.startsWith('mcp__')) return null;
  if (request.pathVerdict !== 'allow-inside-vault' || !pathArgumentsAgree(request.rawInput)) return null;
  const filePath = request.filePath;
  const root = vaultRoot?.replace(/\/+$/, '');
  if (!filePath || !root || !filePath.startsWith('/') || !filePath.startsWith(`${root}/`)) return null;
  if (filePath.split(PATH_SEPARATOR).includes('..')) return null;
  const below = filePath.slice(root.length + 1).split(PATH_SEPARATOR).filter(Boolean);
  if (below.length === 0) return null;
  if (below.some((segment) => segment.startsWith('.') || HIDDEN_OR_CONTROL_CHARACTER.test(segment))) return null;
  const fileName = below[below.length - 1];
  return isAgentInstructionFile(fileName) ? null : fileName;
}
