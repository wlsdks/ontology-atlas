/** A path ends in a slash unless it names a file, as every address of the site is written. */
export function withTrailingSlash(pathname: string): string {
  return pathname.endsWith('/') || /\.[a-z0-9]+$/i.test(pathname) ? pathname : `${pathname}/`;
}
