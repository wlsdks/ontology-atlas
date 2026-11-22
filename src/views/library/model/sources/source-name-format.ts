/**
 * A source's format is its extension, so a name that ends in it already says it. Only a file with
 * no extension leaves the format a fact the name does not state.
 */
export function nameCarriesFormat(name: string, format: string): boolean {
  return format !== "" && name.toLowerCase().endsWith(`.${format.toLowerCase()}`);
}
