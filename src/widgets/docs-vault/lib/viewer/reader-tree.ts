import { decodeWikilinkSlug, parseWikilinkHref } from '@/shared/lib/library/source-citation';

export interface ReaderNode {
  type: string;
  value?: string;
  url?: string;
  children?: ReaderNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

const isBlank = (node: ReaderNode) => node.type === 'text' && (node.value ?? '').trim() === '';

/**
 * What a link node is to the reader: a citation (with its decoded path), a page or concept link,
 * or neither. It only reads the destination the wikilink rewrite wrote; the `a` component still
 * resolves and guards every link when it renders.
 */
function wikilinkKind(node: ReaderNode): { kind: 'citation'; path: string } | { kind: 'page' } | null {
  if (node.type !== 'link' || !node.url) return null;
  const rawSlug = parseWikilinkHref(node.url)?.rawSlug;
  if (!rawSlug) return null;
  const slug = decodeWikilinkSlug(rawSlug);
  return slug.startsWith('src:') ? { kind: 'citation', path: slug.slice('src:'.length) } : { kind: 'page' };
}

const LINK_SEPARATOR_CLASS = 'text-[color:var(--color-text-tertiary)]';
const CITATION_RUN_CLASS = 'block [&>:first-child]:ml-0';

/**
 * The Library reader's tree step, after the wikilink rewrite and before rendering; the file is never
 * changed. Whitespace between two page or concept links becomes a " · " that belongs to neither;
 * citations that end a paragraph and name their file stand together on their own line.
 */
export function readerTree(namedSource: string | undefined, onCounted: (counts: ReadonlyMap<string, number>) => void) {
  const counts = new Map<string, number>();
  const namesFile = (node: ReaderNode) => {
    const link = wikilinkKind(node);
    return link?.kind === 'citation' && link.path.normalize('NFC') !== namedSource;
  };
  const separate = (children: ReaderNode[]) => {
    for (let index = 1; index < children.length - 1; index += 1) {
      if (!isBlank(children[index]!)) continue;
      if (wikilinkKind(children[index - 1]!)?.kind !== 'page' || wikilinkKind(children[index + 1]!)?.kind !== 'page') continue;
      children[index] = {
        type: 'text',
        value: ' · ',
        data: { hName: 'span', hProperties: { className: [LINK_SEPARATOR_CLASS], dataLinkSeparator: '' } },
      };
    }
  };
  const lowerTrailingCitations = (paragraph: ReaderNode) => {
    const children = paragraph.children ?? [];
    let start = children.length;
    let named = false;
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index]!;
      if (isBlank(child)) continue;
      if (wikilinkKind(child)?.kind !== 'citation') break;
      named ||= namesFile(child);
      start = index;
    }
    if (!named || !children.slice(0, start).some((child) => !isBlank(child))) return;
    const run = children.splice(start);
    children.push({
      type: 'readerCitationRun',
      children: run,
      data: { hName: 'span', hProperties: { className: [CITATION_RUN_CLASS], dataCitationRun: '' } },
    });
  };
  const visit = (node: ReaderNode) => {
    const link = wikilinkKind(node);
    if (link?.kind === 'citation') {
      const path = link.path.normalize('NFC');
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
    if (!node.children) return;
    separate(node.children);
    if (node.type === 'paragraph') lowerTrailingCitations(node);
    for (const child of node.children) visit(child);
  };
  return (tree: ReaderNode) => {
    counts.clear();
    visit(tree);
    onCounted(new Map(counts));
  };
}
