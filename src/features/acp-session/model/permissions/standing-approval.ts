import { PATH_ARGUMENT_KEYS, type AcpPermissionRequest } from './permission-request';
import { atlasToolMode } from './atlas-tool-policy';
import { projectRootForVault } from '../runtime-wiring/vault-mcp-server';

/**
 * The Atlas writes auto-approve answers, so a map build runs to its end. Deleting and merging
 * concepts, rewriting a document in place, a commit, and any tool added later still show the card.
 */
export const STANDING_APPROVAL_ATLAS_WRITES: ReadonlySet<string> = new Set([
  'add_concept',
  'add_concepts',
  'add_relation',
  'add_relations',
  'connect_project_source',
  'disconnect_project_source',
  'finalize_project_meaning',
  'patch_concept',
  'remove_relation',
  'rename_concept',
]);

/** Bumped when a check below lets more through, so a kept choice is asked for again. */
const VAULT_EDIT_RULE = 'edit-inside-folder@1';
const ATLAS_READ_RULE = 'atlas-read-inside-folder@1';
const ATLAS_WRITE_RULES = 'atlas-write-arguments@4';

/** Everything auto-approve answers; a kept choice holds only while it equals this, so widening the scope never widens what an earlier press allowed. */
export const STANDING_APPROVAL_SCOPE = [
  VAULT_EDIT_RULE,
  ATLAS_READ_RULE,
  ATLAS_WRITE_RULES,
  ...[...STANDING_APPROVAL_ATLAS_WRITES].sort(),
].join(' ');

export interface StandingApprovalContext {
  enabled: boolean;
  vaultRoot: string | null;
  vaultMcpServerName: string | null;
}

export interface StandingApprovalAnswer {
  optionId: string;
  target: string;
}

const PATH_SEPARATOR = /[\\/]/;
/** Coding agents load these as instructions. `agent-instruction-files.contract.test.ts` holds this list to the stems the script server refused and to the Rust list in `confined-files`. */
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
  const target = approvableTarget(request, context);
  return target ? { optionId: allowOnce[0].optionId, target } : null;
}

function approvableTarget(request: AcpPermissionRequest, context: StandingApprovalContext): string | null {
  const serverName = context.vaultMcpServerName;
  const atlasMode = serverName ? atlasToolMode(request.toolName, serverName) : null;
  // Without a structured correlation the name is the title, and a shell call's title is its command.
  if (atlasMode !== null && request.toolKind === 'execute' && request.writerCorrelation?.status !== 'verified') return null;
  if (request.reviewKind === 'ontology-write') {
    return atlasMode === 'write' ? approvableAtlasWrite(request, context) : null;
  }
  if (atlasMode === 'read') return approvableAtlasRead(request, context);
  return approvableVaultEdit(request, context.vaultRoot);
}

function bareAtlasToolName(request: AcpPermissionRequest, context: StandingApprovalContext): string {
  return (request.toolName ?? '').slice(`mcp__${context.vaultMcpServerName}__`.length);
}

/**
 * The folders a person opened: the vault, and the project it sits in when Atlas made it
 * (`<project>/atlas`); the project is inferred from the folder name alone.
 */
function openedFolderRoots(vaultRoot: string | null): string[] {
  const vault = vaultRoot?.replace(/[\\/]+$/, '');
  if (!vault) return [];
  const project = projectRootForVault(vault);
  return project ? [vault, project] : [vault];
}

/** The segments of `path` below `root`, or null when it is not `root` or below it; `[]` is the root itself. */
function segmentsBelow(root: string, path: string): string[] | null {
  if (path === root) return [];
  if (!path.startsWith(`${root}/`) && !path.startsWith(`${root}\\`)) return null;
  return path.slice(root.length + 1).split(PATH_SEPARATOR).filter(Boolean);
}

function isRelativePath(path: string): boolean {
  return !/^[\\/~]/.test(path) && !/^[A-Za-z]:/.test(path);
}

/** Relative, or absolute in an opened folder; never `..`, a dot-prefixed segment or a hidden character. */
function pathInsideOpenedFolder(value: unknown, vaultRoot: string | null): boolean {
  if (typeof value !== 'string' || value === '' || value !== value.trim()) return false;
  const segments = value.split(PATH_SEPARATOR);
  if (segments.includes('..') || HIDDEN_OR_CONTROL_CHARACTER.test(value)) return false;
  if (isRelativePath(value)) return !segments.some((segment) => segment.startsWith('.') && segment !== '.');
  return openedFolderRoots(vaultRoot).some((root) => {
    const below = segmentsBelow(root, value);
    return below !== null && !below.some((segment) => segment.startsWith('.'));
  });
}

/** Every path-like argument must lie in an opened folder; a read of anything else still asks. */
function approvableAtlasRead(request: AcpPermissionRequest, context: StandingApprovalContext): string | null {
  const paths = PATH_ARGUMENT_KEYS.filter((key) => request.rawInput[key] !== undefined).map((key) => request.rawInput[key]);
  if (!paths.every((path) => pathInsideOpenedFolder(path, context.vaultRoot))) return null;
  return bareAtlasToolName(request, context);
}

function approvableAtlasWrite(request: AcpPermissionRequest, context: StandingApprovalContext): string | null {
  const bareName = bareAtlasToolName(request, context);
  if (!STANDING_APPROVAL_ATLAS_WRITES.has(bareName)) return null;
  const { rawInput } = request;
  // `overwrite` deletes the concept already at the new slug, so it asks as a deletion does.
  if (bareName === 'rename_concept' && !(rawInput.overwrite === undefined || rawInput.overwrite === false)) return null;
  if (bareName === 'connect_project_source' && !bindsOpenedFolder(rawInput, context.vaultRoot)) return null;
  if (bareName === 'patch_concept' && typeof rawInput.body === 'string' && rawInput.body.trim() === '') return null;
  return bareName;
}

/**
 * A bound code folder lets its files be read without a card, so binding passes only when it names
 * an opened folder exactly: an unnamed root is inferred and may be any folder above the vault. A
 * proposal writes nothing but inspects the folder it names, so a named one must be opened too.
 */
function bindsOpenedFolder(rawInput: Record<string, unknown>, vaultRoot: string | null): boolean {
  const rootPath = rawInput.rootPath;
  if (rawInput.confirm !== true && rootPath === undefined) return true;
  if (typeof rootPath !== 'string' || HIDDEN_OR_CONTROL_CHARACTER.test(rootPath)) return false;
  return openedFolderRoots(vaultRoot).includes(rootPath.replace(/[\\/]+$/, ''));
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
