/**
 * A cite of read lines in the form the build writes: a file path, then `:L` and a line number
 * (`src/billing/invoice.ts:L40-L52`). The path holds a `/` or a `.`, so prose such as `Note:L1`
 * is not a cite. O(body length).
 */
const LINE_CITE = /[^\s`'"()[\]<>,;|]*[./][^\s`'"()[\]<>,;|]*:L\d+/;

export function citesReadLines(body: string): boolean {
  return LINE_CITE.test(body);
}
