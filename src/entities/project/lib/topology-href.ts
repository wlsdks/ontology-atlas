export function getTopologyProjectHref(slug: string): string {
  return `/?p=${encodeURIComponent(slug)}`;
}
