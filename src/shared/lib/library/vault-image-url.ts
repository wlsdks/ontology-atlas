function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * A reader image: SVG can carry script, so it goes as a data: URL, which opens in an opaque
 * origin; a raster image stays a blob URL.
 */
export async function vaultImageUrl(file: File): Promise<string> {
  if (extensionOf(file.name) !== 'svg' && file.type !== 'image/svg+xml') return URL.createObjectURL(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}
