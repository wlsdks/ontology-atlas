import { markdownTree } from '../../markdown-tree.mjs';
import { cleanHeadingLabel } from '../text.mjs';

export function authoredMarkdownLines(text) {
  const rawLines = text.split(/\r\n|\r|\n/);
  const lines = rawLines.map(() => '');
  const content = [...rawLines];
  if (content[0]?.trim() === '---') {
    let index = 0;
    do {
      content[index] = '';
      index += 1;
    } while (index < content.length && rawLines[index]?.trim() !== '---');
    if (index < content.length) content[index] = '';
  }
  const source = content.join('\n');
  // markdownTree is linear in the text, so a hostile page cannot stall the survey.
  const pending = markdownTree(source).children.map((node) => ({ node, root: true })).reverse();
  while (pending.length) {
    const { node, root } = pending.pop();
    if ((root && node.type === 'heading') || node.type === 'paragraph') {
      const start = node.position.start;
      const end = node.position.end;
      const fragments = [];
      let offset = start.offset;
      const inline = [...(node.children ?? [])].reverse();
      const omitted = [];
      while (inline.length) {
        const child = inline.pop();
        if (child.type === 'html') omitted.push(child.position);
        else if (child.children) {
          for (let index = child.children.length - 1; index >= 0; index--) inline.push(child.children[index]);
        }
      }
      for (const position of omitted) {
        fragments.push(source.slice(offset, position.start.offset));
        fragments.push(source.slice(position.start.offset, position.end.offset).replace(/[^\n]/g, ' '));
        offset = position.end.offset;
      }
      fragments.push(source.slice(offset, end.offset));
      const value = fragments.join('');
      const authored = value.split('\n');
      if (node.type === 'heading') {
        lines[start.line - 1] = `${'#'.repeat(node.depth)} ${cleanHeadingLabel(authored[0].replace(/^ {0,3}#{1,6}\s+/, '').replace(/\s+#+\s*$/, ''))}`;
      } else {
        for (let index = 0; index < authored.length; index++) lines[start.line - 1 + index] = authored[index];
      }
    } else if (node.type === 'list' || node.type === 'listItem') {
      for (let index = node.children.length - 1; index >= 0; index--) pending.push({ node: node.children[index], root: false });
    } else if (root && node.type === 'html' && /^ {0,3}<h[1-3]\b[^>]*>[^<>]*<\/h[1-3]>\s*$/i.test(node.value)) {
      lines[node.position.start.line - 1] = node.value;
    }
  }
  return lines;
}

