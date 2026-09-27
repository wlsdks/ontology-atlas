import ts from 'typescript';

export type ClassSource = { source: ts.SourceFile; bindings: Map<string, ts.Node[]> };

/** Every same-file binding of each name, shadowed ones included. */
export function readClassSource(fileName: string, text: string): ClassSource {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const bindings = new Map<string, ts.Node[]>();
  const bind = (name: string, node: ts.Node) => bindings.set(name, [...(bindings.get(name) ?? []), node]);
  const index = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) bind(node.name.text, node.body);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) bind(node.name.text, node.initializer);
    ts.forEachChild(node, index);
  };
  index(source);
  return { source, bindings };
}

/** A node's string literals, plus, when following, those of every binding it names. */
export function stringsOf({ bindings }: ClassSource, root: ts.Node, follow = true): string[] {
  const out: string[] = [];
  const seen = new Set<ts.Node>();
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      out.push(node.text);
    }
    for (const bound of follow && ts.isIdentifier(node) ? (bindings.get(node.text) ?? []) : []) {
      if (seen.has(bound)) continue;
      seen.add(bound);
      visit(bound);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return out;
}

export function classNameOf(element: ts.JsxOpeningLikeElement): ts.JsxAttribute | undefined {
  return element.attributes.properties.find(
    (attribute): attribute is ts.JsxAttribute =>
      ts.isJsxAttribute(attribute) && ts.isIdentifier(attribute.name) && attribute.name.text === 'className',
  );
}
