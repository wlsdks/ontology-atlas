import { describe, expect, it } from 'vitest';

import { canonicalToolTitle, commandRowWords, isVaultTool, labelWithoutRepeatedPath, toolLabel, withKindFallback, type ToolLabel } from './tool-label';
import en from '../../../../messages/en.json';
import ko from '../../../../messages/ko.json';

/**
 * A tool line records **what happened, not a function name.**
 *
 * This is where the real thing coming out like this was fixed:
 * ```
 * Task  mcp__atlas-vault__list_concepts
 * ```
 * This repository's design rule already forbids it — *"Use plain words for jargon"*
 * (jargon in plain words).
 */
const OURS = 'atlas-vault';

describe('tool line: translates only what it knows', () => {
  it('a tool we installed is translated into its meaning', () => {
    expect(toolLabel('mcp__atlas-vault__add_concept', OURS)).toEqual({
      kind: 'known',
      text: 'addNode',
    });
    expect(toolLabel('mcp__atlas-vault__list_concepts', OURS)).toEqual({
      kind: 'known',
      text: 'read',
    });
  });

  it('an unknown tool on our own server shows **only its name**, with nothing invented', () => {
    /*
     * It means the tool set grew. Fudging it as "did something" makes the line carry
     * nothing, and inventing something plausible diverges from what was actually done.
     */
    expect(toolLabel('mcp__atlas-vault__brand_new_thing', OURS)).toEqual({
      kind: 'raw',
      text: 'brand_new_thing',
    });
  });

  it('a third-party MCP tool only loses its server prefix', () => {
    expect(toolLabel('mcp__some-server__write_file', OURS)).toEqual({
      kind: 'raw',
      text: 'write_file',
    });
    // Even with an underscore in the server name, only the tool name should remain.
    expect(toolLabel('mcp__my_server__do_thing', OURS)).toEqual({
      kind: 'raw',
      text: 'do_thing',
    });
  });

  it('a non-MCP tool is left as it is', () => {
    expect(toolLabel('Terminal', OURS)).toEqual({ kind: 'raw', text: 'Terminal' });
    expect(toolLabel('Read File', OURS)).toEqual({ kind: 'raw', text: 'Read File' });
  });

  it('an empty title is not given an invented label', () => {
    expect(toolLabel('   ', OURS)).toEqual({ kind: 'raw', text: '' });
  });

  it('when the server name changes, our tools become third-party tools, because the name is not hard-coded', () => {
    // The contract that the test is **the injected name**, not a literal.
    expect(toolLabel('mcp__atlas-vault__add_concept', 'other-name').kind).toBe('raw');
  });
});

describe('canonicalToolTitle: one spelling for both adapters', () => {
  const envelope = { server: 'atlas-vault', tool: 'list_concepts', arguments: { kind: 'domain' } };

  it('rewrites a dotted call whose envelope names the same server and tool', () => {
    const title = canonicalToolTitle('mcp.atlas-vault.list_concepts', envelope);
    expect(title).toBe('mcp__atlas-vault__list_concepts');
    expect(toolLabel(title, OURS)).toEqual({ kind: 'known', text: 'read' });
    expect(isVaultTool(title, OURS)).toBe(true);
  });

  it('leaves a dotted title alone when the envelope is absent or names another call', () => {
    const title = 'mcp.atlas-vault.list_concepts';
    expect(canonicalToolTitle(title, undefined)).toBe(title);
    expect(canonicalToolTitle(title, { command: 'echo mcp.atlas-vault.list_concepts' })).toBe(title);
    expect(canonicalToolTitle(title, { ...envelope, tool: 'delete_concept' })).toBe(title);
    expect(canonicalToolTitle(title, { ...envelope, server: 'other' })).toBe(title);
  });

  it('leaves every other title as it arrived', () => {
    expect(canonicalToolTitle('mcp__atlas-vault__list_concepts', {})).toBe('mcp__atlas-vault__list_concepts');
    expect(canonicalToolTitle('Terminal', envelope)).toBe('Terminal');
  });
});

describe('isVaultTool — whose answer is this', () => {
  it('recognises the server we wired in', () => {
    expect(isVaultTool('mcp__atlas-vault__list_concepts', 'atlas-vault')).toBe(true);
    expect(isVaultTool('  mcp__atlas-vault__add_concept  ', 'atlas-vault')).toBe(true);
  });

  it('refuses another server, a bare tool, and a name that only looks like ours', () => {
    expect(isVaultTool('mcp__other__list_concepts', 'atlas-vault')).toBe(false);
    expect(isVaultTool('Grep', 'atlas-vault')).toBe(false);
    expect(isVaultTool('mcp__atlas-vault-evil__list_concepts', 'atlas-vault')).toBe(false);
    expect(isVaultTool('', 'atlas-vault')).toBe(false);
  });
});

describe('labelWithoutRepeatedPath: a line never prints the same path twice', () => {
  const raw = (text: string): ToolLabel => ({ kind: 'raw', text });

  it('strips the trailing path from the title and keeps the verb (measured default write tool)', () => {
    const path = '/Users/probe/Ontology Atlas/launch/wiki/architecture.md';
    expect(labelWithoutRepeatedPath(raw(`Write ${path}`), path)).toEqual({ kind: 'raw', text: 'Write' });
    expect(labelWithoutRepeatedPath(raw(`Edit: ${path}`), path)).toEqual({ kind: 'raw', text: 'Edit' });
    expect(labelWithoutRepeatedPath(raw(`Read · ${path}`), path)).toEqual({ kind: 'raw', text: 'Read' });
  });

  it('leaves a path-only title unchanged, so the line is never left empty', () => {
    const path = 'wiki/architecture.md';
    expect(labelWithoutRepeatedPath(raw(path), path)).toEqual(raw(path));
    expect(labelWithoutRepeatedPath(raw(`  ${path}  `), path)).toEqual(raw(`  ${path}  `));
  });

  it('cuts only on an exact ending and leaves similar paths and mid-title mentions alone', () => {
    expect(labelWithoutRepeatedPath(raw('Write wiki/architecture.md then stop'), 'wiki/architecture.md'))
      .toEqual(raw('Write wiki/architecture.md then stop'));
    expect(labelWithoutRepeatedPath(raw('Write docs/architecture.md'), 'wiki/architecture.md'))
      .toEqual(raw('Write docs/architecture.md'));
  });

  it('leaves known tool names and empty paths untouched', () => {
    const known: ToolLabel = { kind: 'known', text: 'addNode' };
    expect(labelWithoutRepeatedPath(known, '/a/b.md')).toBe(known);
    expect(labelWithoutRepeatedPath(raw('Write /a/b.md'), null)).toEqual(raw('Write /a/b.md'));
    expect(labelWithoutRepeatedPath(raw('Write /a/b.md'), '   ')).toEqual(raw('Write /a/b.md'));
  });
});

describe('withKindFallback — an unknown call on our own server reads as its kind', () => {
  const server = 'atlas-vault';
  const unknown = `mcp__${server}__write_wiki_file`;

  it('names the protocol kind instead of the function name, in both catalogues', () => {
    const label = withKindFallback(toolLabel(unknown, server), unknown, server, 'edit');
    expect(label).toEqual({ kind: 'kind', text: 'edit' });
    expect(en.acpChat.toolKind).toHaveProperty(label.text);
    expect(ko.acpChat.toolKind).toHaveProperty(label.text);
  });

  it("keeps a raw name when the kind names no action, and never renames someone else's tool", () => {
    expect(withKindFallback(toolLabel(unknown, server), unknown, server, 'other')).toEqual({ kind: 'raw', text: 'write_wiki_file' });
    expect(withKindFallback(toolLabel(unknown, server), unknown, server, null)).toEqual({ kind: 'raw', text: 'write_wiki_file' });
    const foreign = 'mcp__github__create_issue';
    expect(withKindFallback(toolLabel(foreign, server), foreign, server, 'edit')).toEqual({ kind: 'raw', text: 'create_issue' });
  });

  it('leaves a tool we know by name alone', () => {
    const known = `mcp__${server}__add_concept`;
    expect(withKindFallback(toolLabel(known, server), known, server, 'edit')).toEqual({ kind: 'known', text: 'addNode' });
  });
});

describe('commandRowWords: a command is printed once', () => {
  const raw = (text: string): ToolLabel => ({ kind: 'raw', text });

  it('names the act and keeps the title when the command argument repeats it', () => {
    expect(commandRowWords(raw('rg --files src'), '/bin/zsh -lc "rg --files src"')).toEqual({
      label: { kind: 'kind', text: 'execute' },
      target: 'rg --files src',
    });
    expect(commandRowWords(raw('git status --short'), 'git status --short')?.target).toBe('git status --short');
  });

  it('leaves a title that is not the command, a known label and a call without a command alone', () => {
    expect(commandRowWords(raw('Terminal'), 'rg --files src')).toBeNull();
    expect(commandRowWords({ kind: 'known', text: 'read' }, 'read')).toBeNull();
    expect(commandRowWords(raw('rg --files src'), null)).toBeNull();
    expect(commandRowWords(raw('  '), 'rg --files src')).toBeNull();
  });
});
