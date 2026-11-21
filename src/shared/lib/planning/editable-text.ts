export type PlanningEditableText = { text: string; lineEnding: '\n' | '\r\n' };

/**
 * The text of a Markdown document as the editor holds it, or `null` when the bytes are not UTF-8
 * and saving would rewrite them. The editor works in LF; CRLF files are written back in CRLF.
 */
export function editablePlanningText(bytes: Uint8Array): PlanningEditableText | null {
  const decoded = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
  const encoded = new TextEncoder().encode(decoded);
  if (encoded.length !== bytes.length || encoded.some((byte, index) => byte !== bytes[index])) return null;
  const crlf = decoded.includes('\r\n');
  return { text: crlf ? decoded.replace(/\r\n/g, '\n') : decoded, lineEnding: crlf ? '\r\n' : '\n' };
}

export function planningTextForDisk(text: string, lineEnding: PlanningEditableText['lineEnding']): string {
  return lineEnding === '\r\n' ? text.replace(/\r?\n/g, '\r\n') : text;
}
