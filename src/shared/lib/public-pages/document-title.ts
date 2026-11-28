/** A page's title joined with the site's name, or alone when the title stands by itself. */
export function documentTitle(title: string, siteName: string, absolute = false): string {
  return absolute ? title : `${title} · ${siteName}`;
}
