import { describe, expect, it } from 'vitest';

import { WIKI_PAGE_TEMPLATE } from '@/shared/lib/library/wiki-page-schema';

import { readOrMissing, scanPassFolders } from './pass-folder-scan';

const DRAFT = WIKI_PAGE_TEMPLATE.replace(/sources\/<file>/g, 'sources/plan.pdf');
const NODE = '---\nkind: capability\ntitle: Checkout\n---\nA cart becomes an order.\n';
const notFound = () => Object.assign(new Error('not found'), { name: 'NotFoundError' });

describe('the folders a pass scans', () => {
  it('scans the files on disk under wiki/ and the folders under sources/, and reports every link without following it', async () => {
    const files: Record<string, string> = { 'wiki/plan.md': DRAFT, 'wiki/team/checkout.md': NODE, 'wiki/.trash/old.md': 'x', 'wiki/logo.png': 'png', 'sources/team/notes.md': 'n', 'notes.md': 'y' };
    const linksIn: Record<string, string[]> = { '': [], wiki: ['escape.md'], 'wiki/team': ['elsewhere'], sources: [], 'sources/team': [] };
    const dir = (prefix: string): unknown => ({
      kind: 'directory',
      getDirectoryHandle: async (name: string) => {
        if (!Object.keys(files).some((path) => path.startsWith(`${prefix}${name}/`))) throw notFound();
        return dir(`${prefix}${name}/`);
      },
      entries: async function* () {
        const names = new Set(Object.keys(files).filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length).split('/')[0]));
        for (const name of names) {
          const nested = Object.keys(files).some((path) => path.startsWith(`${prefix}${name}/`));
          yield [name, nested ? dir(`${prefix}${name}/`) : { kind: 'file', getFile: async () => ({ text: async () => files[`${prefix}${name}`] }) }];
        }
      },
    });
    const lister = async (directory: string) => linksIn[directory] ?? [];
    expect(await scanPassFolders(dir('') as FileSystemDirectoryHandle, lister)).toEqual({
      pages: [{ path: 'wiki/plan.md', text: DRAFT }, { path: 'wiki/team/checkout.md', text: NODE }],
      dirs: ['wiki', 'wiki/team', 'sources', 'sources/team'],
      links: ['wiki/escape.md', 'wiki/team/elsewhere'],
    });
    const linkedWiki = await scanPassFolders(dir('') as FileSystemDirectoryHandle, async (directory) => (directory === '' ? ['Wiki'] : []));
    expect(linkedWiki).toEqual({ pages: [], dirs: ['sources', 'sources/team'], links: ['wiki'] });
    const empty = { getDirectoryHandle: async () => { throw notFound(); } } as unknown as FileSystemDirectoryHandle;
    await expect(scanPassFolders(empty, async () => [])).resolves.toEqual({ pages: [], dirs: [], links: [] });
  });

  it('reads a file that is not there as missing, and any other read failure as a failure', async () => {
    const missing = Object.assign(new Error('gone'), { name: 'NotFoundError' });
    const vault = {
      getDirectoryHandle: async () => vault,
      getFileHandle: async (name: string) => {
        if (name === 'gone.md') throw missing;
        return {};
      },
    } as unknown as FileSystemDirectoryHandle;
    const read = readOrMissing(vault, async () => {
      throw 'No such file or directory (os error 2)';
    });
    await expect(read('wiki/gone.md')).resolves.toBeNull();
    await expect(read('wiki/here.md')).rejects.toBe('No such file or directory (os error 2)');
  });
});
