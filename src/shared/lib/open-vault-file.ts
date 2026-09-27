/**
 * A blob URL takes the page's origin, so a granted file opened as itself would run an `.html` or
 * `.svg` source beside the stored folder handle. Only inert kinds open, typed by extension.
 */

const TEXT = 'text/plain;charset=utf-8';

const VIEWABLE = new Map<string, string>([
  ['pdf', 'application/pdf'],
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['webp', 'image/webp'],
  ['avif', 'image/avif'],
  ['txt', TEXT],
  ['md', TEXT],
  ['markdown', TEXT],
  ['csv', TEXT],
  ['tsv', TEXT],
  ['json', TEXT],
  ['yaml', TEXT],
  ['yml', TEXT],
  ['log', TEXT],
]);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

function viewableType(name: string): string | null {
  return VIEWABLE.get(extensionOf(name)) ?? null;
}

export interface FileHandoff {
  open(url: string): void;
  save(url: string, name: string): void;
}

const browserHandoff: FileHandoff = {
  open: (url) => {
    window.open(url, '_blank', 'noopener');
  },
  save: (url, name) => {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  },
};

export function handOverVaultFile(file: File, handoff: FileHandoff = browserHandoff): 'opened' | 'saved' {
  const type = viewableType(file.name);
  const url = URL.createObjectURL(new Blob([file], { type: type ?? 'application/octet-stream' }));
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  if (type) {
    handoff.open(url);
    return 'opened';
  }
  handoff.save(url, file.name);
  return 'saved';
}

/** SVG can carry script, so it goes as a data: URL, which opens in an opaque origin. */
export async function vaultImageUrl(file: File): Promise<string> {
  if (extensionOf(file.name) !== 'svg' && file.type !== 'image/svg+xml') return URL.createObjectURL(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}
