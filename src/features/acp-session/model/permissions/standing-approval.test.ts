import { describe, expect, it } from 'vitest';

import type { AcpPermissionRequest } from './permission-request';
import { standingApproval, type StandingApprovalContext } from './standing-approval';

const ON: StandingApprovalContext = { enabled: true, vaultRoot: '/Users/me/vault', vaultMcpServerName: 'atlas-vault' };
const OPTIONS = [
  { optionId: 'allow-once', kind: 'allow_once', name: 'Yes' },
  { optionId: 'allow-with-updates', kind: 'allow_always', name: 'Yes, allow all edits during this session' },
  { optionId: 'reject', kind: 'reject_once', name: 'No' },
];

function edit(overrides: Partial<AcpPermissionRequest> = {}): AcpPermissionRequest {
  return {
    title: 'Edit',
    toolCallId: 'call-1',
    toolName: 'Edit',
    toolKind: 'edit',
    filePath: '/Users/me/vault/capabilities/refund.md',
    rawInput: {},
    reviewKind: 'permission',
    pathVerdict: 'allow-inside-vault',
    options: OPTIONS,
    ...overrides,
  };
}

function atlasWrite(tool: string, overrides: Partial<AcpPermissionRequest> = {}): AcpPermissionRequest {
  return edit({
    toolName: `mcp__atlas-vault__${tool}`,
    toolKind: 'other',
    filePath: null,
    reviewKind: 'ontology-write',
    pathVerdict: 'ask',
    ...overrides,
  });
}

describe('auto-approve answers allow_once only inside its bounded scope', () => {
  it.each([
    { name: 'an edit of a vault file', request: edit(), target: 'refund.md', context: ON },
    { name: 'an edit at the vault root', request: edit({ filePath: '/Users/me/vault/README.md' }), target: 'README.md', context: ON },
    { name: 'an edit when the root carries a trailing slash', request: edit(), target: 'refund.md', context: { ...ON, vaultRoot: '/Users/me/vault/' } },
    { name: 'an edit below a vault root that itself sits in a dot folder', request: edit({ filePath: '/Users/me/.vaults/v/a.md' }), target: 'a.md', context: { ...ON, vaultRoot: '/Users/me/.vaults/v' } },
    ...['add_concept', 'add_concepts', 'add_relation', 'add_relations', 'patch_concept', 'replace_relation', 'rename_concept', 'reclassify_concept']
      .map((tool) => ({ name: `Atlas ${tool}`, request: atlasWrite(tool), target: tool, context: ON })),
    { name: 'a Codex Atlas write reported as execute', request: atlasWrite('add_concept', { toolKind: 'execute' }), target: 'add_concept', context: ON },
    { name: 'a rename that leaves overwrite unset', request: atlasWrite('rename_concept', { rawInput: { from: 'a', to: 'b' } }), target: 'rename_concept', context: ON },
    { name: 'a rename with overwrite false', request: atlasWrite('rename_concept', { rawInput: { from: 'a', to: 'b', overwrite: false } }), target: 'rename_concept', context: ON },
    { name: 'a patch that sets fields and a body', request: atlasWrite('patch_concept', { rawInput: { slug: 'a', frontmatter: { title: 'A', dependencies: ['b'] }, body: 'Defines A.' } }), target: 'patch_concept', context: ON },
    { name: 'an edit whose path arguments all name the same file', request: edit({ rawInput: { file_path: '/Users/me/vault/capabilities/refund.md', path: '/Users/me/vault/capabilities/refund.md' } }), target: 'refund.md', context: ON },
    { name: 'a file whose name only contains an instruction stem', request: edit({ filePath: '/Users/me/vault/agents-overview.md' }), target: 'agents-overview.md', context: ON },
  ])('approves $name', ({ request, target, context }) => {
    expect(standingApproval(request, context)).toEqual({ optionId: 'allow-once', target });
  });

  it.each([
    ['auto-approve is off', edit(), { ...ON, enabled: false }],
    ['the path climbs with ..', edit({ filePath: '/Users/me/vault/notes/../../secret.md' }), ON],
    ['a dot folder sits at the top', edit({ filePath: '/Users/me/vault/.git/config' }), ON],
    ['a dot folder sits deeper', edit({ filePath: '/Users/me/vault/capabilities/.claude/settings.json' }), ON],
    ['the file itself is a dotfile', edit({ filePath: '/Users/me/vault/.env.local' }), ON],
    ['the file is the .mcp.json', edit({ filePath: '/Users/me/vault/.mcp.json' }), ON],
    ['the Rust verdict asks', edit({ pathVerdict: 'ask' }), ON],
    ['no Rust verdict was carried', edit({ pathVerdict: undefined }), ON],
    ['the path is relative', edit({ filePath: 'capabilities/refund.md' }), ON],
    ['the path is missing', edit({ filePath: null }), ON],
    ['the path is the vault root itself', edit({ filePath: '/Users/me/vault/' }), ON],
    ['the path is a sibling folder sharing the root prefix', edit({ filePath: '/Users/me/vault-other/a.md' }), ON],
    ['no vault root is known', edit(), { ...ON, vaultRoot: null }],
    ['the kind is execute', edit({ toolKind: 'execute' }), ON],
    ['the kind is delete', edit({ toolKind: 'delete' }), ON],
    ['the kind is move', edit({ toolKind: 'move' }), ON],
    ['the kind is fetch', edit({ toolKind: 'fetch' }), ON],
    ['the kind is read', edit({ toolKind: 'read' }), ON],
    ['the kind is switch_mode', edit({ toolKind: 'switch_mode' }), ON],
    ['the kind is missing', edit({ toolKind: null }), ON],
    ['an Atlas write arrives as a plain permission', atlasWrite('add_concept', { reviewKind: 'permission', toolKind: 'edit', filePath: '/Users/me/vault/a.md', pathVerdict: 'allow-inside-vault' }), ON],
    ['another MCP server edits a vault file', edit({ toolName: 'mcp__notion__update_page' }), ON],
    ...['delete_concept', 'remove_relation', 'merge_concepts', 'absorb_document', 'finalize_project_meaning', 'git_snapshot', 'connect_project_source', 'disconnect_project_source']
      .map((tool) => [`Atlas ${tool} asks`, atlasWrite(tool), ON] as const),
    ['an Atlas tool nobody listed', atlasWrite('future_write'), ON],
    ['an Atlas read reaches the write review', atlasWrite('get_concept'), ON],
    ['another server writes under the ontology review', atlasWrite('x', { toolName: 'mcp__other__add_concept' }), ON],
    ['no Atlas server is wired', atlasWrite('add_concept'), { ...ON, vaultMcpServerName: null }],
    ['an Atlas write switches mode', atlasWrite('add_concept', { toolKind: 'switch_mode' }), ON],
    ['no option ends with this call', edit({ options: OPTIONS.filter((option) => option.kind !== 'allow_once') }), ON],
    ['the resolved path lands in a dot folder', edit({ pathVerdict: 'allow-inside-vault-hidden' }), ON],
    ['only the .. rule can see the climb, inside the root text', edit({ filePath: '/Users/me/x/../vault/a.md' }), { ...ON, vaultRoot: '/Users/me/x/../vault' }],
    ['the kind is other', edit({ toolKind: 'other' }), ON],
    ['the kind is think', edit({ toolKind: 'think' }), ON],
    ['the kind is search', edit({ toolKind: 'search' }), ON],
    ['the kind is an unknown string', edit({ toolKind: 'write_file' }), ON],
    ['a same-length other server writes under the ontology review', atlasWrite('x', { toolName: 'mcp__other-vault__add_concept' }), ON],
    ...[true, 'true', 1, null].map((overwrite) => [`a rename sets overwrite to ${JSON.stringify(overwrite)}`, atlasWrite('rename_concept', { rawInput: { from: 'a', to: 'b', overwrite } }), ON] as const),
    ['a patch clears a frontmatter field', atlasWrite('patch_concept', { rawInput: { slug: 'a', frontmatter: { title: 'A', dependencies: null } } }), ON],
    ['a patch empties a relation list', atlasWrite('patch_concept', { rawInput: { slug: 'a', frontmatter: { dependencies: [] } } }), ON],
    ['a patch empties the body', atlasWrite('patch_concept', { rawInput: { slug: 'a', body: '' } }), ON],
    ['a patch leaves only whitespace in the body', atlasWrite('patch_concept', { rawInput: { slug: 'a', body: ' \n\t' } }), ON],
    ['a patch sends frontmatter that is not an object', atlasWrite('patch_concept', { rawInput: { slug: 'a', frontmatter: null } }), ON],
    ['two path arguments name different files', edit({ rawInput: { filePath: '/Users/me/vault/a.md', path: '/Users/me/vault/.git/config' } }), ON],
    ['a path argument is not a string', edit({ rawInput: { file_path: '/Users/me/vault/a.md', path: ['/Users/me/vault/b.md'] } }), ON],
    ...['AGENTS.md', 'docs/CLAUDE.md', 'deep/er/claude.local.md', 'GeMiNi.md', 'AGENTS.override.md', 'agents']
      .map((name) => [`the file is the instruction file ${name}`, edit({ filePath: `/Users/me/vault/${name}` }), ON] as const),
    ...['\u200B.git', 'notes\u202Eam.md', 'a\u0007b', 'line\u2028break']
      .map((segment) => [`a segment hides the character in ${JSON.stringify(segment)}`, edit({ filePath: `/Users/me/vault/${segment}/config` }), ON] as const),
    ['two options claim to end with this call', edit({ options: [...OPTIONS, { optionId: 'other-once', kind: 'allow_once', name: 'Yes too' }] }), ON],
  ] as Array<readonly [string, AcpPermissionRequest, StandingApprovalContext]>)(
    'shows the card when %s',
    (_name, request, context) => {
      expect(standingApproval(request, context)).toBeNull();
    },
  );
});
