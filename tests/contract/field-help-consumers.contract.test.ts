import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const read = (relative: string) => readFileSync(resolve(ROOT, relative), 'utf8');
const en = JSON.parse(read('messages/en.json'));
const ko = JSON.parse(read('messages/ko.json'));

/**
 * Field help that names a downstream consumer is only worth reading if the
 * consumer is real and does what the sentence says. Prose is not pinned here —
 * rewording is free. What is pinned is the code path each sentence points at,
 * and the one property of the sentence that would make it a lie: promising a
 * refusal where the implementation only warns.
 *
 * The brief that opened this round proposed "validate_vault refuses a target
 * that does not exist". It does not. `ontology-compiler.mjs` pushes
 * `dangling-graph-reference` at severity `warning` and the write lands, so the
 * copy says "reports"/"warns" and this file keeps it that way.
 */
describe('every consumer named in field help exists as a real code path', () => {
  it('the compiler turns a relation key into an edge and reports one that does not resolve', () => {
    const compiler = read('mcp/src/ontology-compiler.mjs');
    expect(compiler).toContain("code: 'dangling-graph-reference'");
    expect(compiler).toContain("severity: 'warning'");
    // The finding names the key the person wrote, which is why the help can
    // speak about "these lines" rather than about the compiler.
    expect(compiler).toMatch(/does not resolve to a vault node/);
    // validate_vault surfaces the same code, so "folder validation reports it"
    // is true from either entry point.
    expect(read('mcp/src/validate.mjs')).toContain("'dangling-graph-reference'");
  });

  it('a dangling reference is a warning, so no relation help may promise a refusal', () => {
    const claims = [
      en.meaningEditor?.relationHelp,
      en.docsVault?.frontmatterBlock?.relationsConsumerHelp,
    ];
    expect(claims.every((claim) => typeof claim === 'string' && claim.length > 0)).toBe(true);
    for (const claim of claims as string[]) {
      expect(claim.toLowerCase()).not.toMatch(/\brefus|\breject|\bblocks the\b|\bprevent/);
    }
  });

  it('the source receipt really checks each declared path against the code folder', () => {
    const witnesses = read('mcp/src/project-source-witnesses.mjs');
    // `path:` frontmatter and code-shaped `elements:` entries both become witnesses.
    expect(witnesses).toContain('frontmatter.path');
    expect(witnesses).toContain('frontmatter.elements');
    expect(witnesses).toContain('looksLikeCodePath');

    const mint = read('mcp/src/project-source-mint.mjs');
    // Supported is decided by membership in the connected folder's inventory…
    expect(mint).toContain('supported: files.has(path)');
    // …and a missing one is what turns the receipt to review, which is the
    // consequence the help text states.
    expect(mint).toContain("status = 'review_required'");
    expect(mint).toContain("id: 'declared_source_path_missing'");
  });

  it('an impact query walks relation edges, which is what the target help promises', () => {
    const engine = read('mcp/src/ontology-engine.mjs');
    expect(engine).toContain("function impact(");
    expect(engine).toContain('traversalEdges(current.slug, direction, typeSet)');
  });

  it('the compact agent brief scores a capability on its Definition/Includes/Excludes sections', () => {
    // Named here so a later help sentence about those headings has a pinned
    // consumer. They are BODY headings, not frontmatter keys — the reason no
    // help line was attached to the frontmatter `definition:` value this round.
    const brief = read('mcp/src/agent-brief-compact.mjs');
    expect(brief).toContain("markdownSection(body, 'Definition')");
    expect(brief).toContain("markdownSection(body, 'Includes')");
    expect(brief).toContain("markdownSection(body, 'Excludes')");
  });

  it('each help string is authored in both locales and attached to its field', () => {
    for (const catalog of [en, ko]) {
      expect(typeof catalog.meaningEditor.relationHelp).toBe('string');
      expect(typeof catalog.meaningEditor.targetHelp).toBe('string');
      expect(typeof catalog.docsVault.frontmatterBlock.relationsConsumerHelp).toBe('string');
      expect(typeof catalog.docsVault.frontmatterBlock.codeLocationsConsumerHelp).toBe('string');
    }
    const editor = read('src/features/ontology-meaning-editor/ui/MeaningEditorPanel.tsx');
    expect(editor).toContain("t('relationHelp')");
    expect(editor).toContain("t('targetHelp')");
    // The help must reach a screen reader as the field's description, not as
    // loose text beside an unnamed select.
    expect(editor).toContain('ariaDescribedby={describedBy}');
    const block = read('src/views/docs-vault/ui/parts/DocFrontmatterBlock.tsx');
    expect(block).toContain('t("relationsConsumerHelp")');
    expect(block).toContain('t("codeLocationsConsumerHelp")');
  });
});
