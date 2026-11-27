import { CodedFailure } from '@/shared/lib/failures/failure-code';

const utf8 = new TextDecoder('utf-8', { fatal: true });

/**
 * The text of a vault file that is about to be written back. A file that is not UTF-8 is refused
 * with `not-utf8`: `File.text()` would answer replacement characters, and writing that text back
 * would replace the bytes they stand for. `path` names the file in the failure's detail.
 */
export async function readStrictUtf8Text(file: Blob, path: string): Promise<string> {
  const bytes = await file.arrayBuffer();
  try {
    return utf8.decode(bytes);
  } catch {
    throw new CodedFailure('not-utf8', path);
  }
}
