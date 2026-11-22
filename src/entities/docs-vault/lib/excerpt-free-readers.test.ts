// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const OWNED_READERS = [
  'src/widgets/docs-vault/lib/search.ts',
  'src/widgets/search-palette/ui/SearchPalette.tsx',
  'src/views/library/ui/index-column/LibrarySection.tsx',
  'src/entities/docs-vault/lib/library/vault-library.ts',
  'src/entities/docs-vault/lib/library/wiki-retrieval.ts',
  'src/entities/docs-vault/lib/doc-navigation/related-docs.ts',
  'src/entities/docs-vault/lib/projects/derive-projects-from-vault.ts',
  'src/views/project-selector/lib/authored-description.ts',
  'src/widgets/vault-agent-panel/model/use-vault-agent.ts',
  'src/features/vault-agent/model/agent-tools/vault-read-port.ts',
  'src/features/vault-agent/model/agent-tools/tool-executor.ts',
  'src/views/architecture/ui/HarnessPage.tsx',
];

/** Every place a source file reads a member named `excerpt`, as `line:column`. */
function excerptReads(fileName: string, source: string): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const reads: string[] = [];
  const note = (node: ts.Node) => {
    const { line, character } = file.getLineAndCharacterOfPosition(node.getStart(file));
    reads.push(`${line + 1}:${character + 1}`);
  };
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'excerpt') note(node);
    if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      node.argumentExpression.text === 'excerpt'
    ) {
      note(node);
    }
    if (ts.isBindingElement(node) && (node.propertyName ?? node.name).getText(file) === 'excerpt') note(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return reads;
}

describe('readers that no longer take the excerpt from a document', () => {
  it('finds a read of excerpt in each shape a reader could write', () => {
    const source = [
      'const a = doc.excerpt;',
      "const b = doc['excerpt'];",
      'const { excerpt } = doc;',
      'const { excerpt: text } = doc;',
      'const ok = { excerpt: 1 };',
    ].join('\n');
    expect(excerptReads('probe.ts', source)).toEqual(['1:11', '2:11', '3:9', '4:9']);
  });

  it.each(OWNED_READERS)('%s reads no excerpt', (path) => {
    const source = readFileSync(join(process.cwd(), path), 'utf8');
    expect(excerptReads(path, source)).toEqual([]);
  });
});
