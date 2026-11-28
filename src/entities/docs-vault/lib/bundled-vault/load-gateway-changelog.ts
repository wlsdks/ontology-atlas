/**
 * The composed changelog the Docs Vault build writes: the recent sections, cut on `## ` boundaries, and how many older
 * ones were folded away. It is the one file the website's prerender and the installed app both read, and it arrives
 * with `import()` so only the screen that draws it fetches the file.
 */
export interface GatewayChangelogPreview {
  body: string;
  omittedSections: number;
}

export async function loadGatewayChangelog(): Promise<GatewayChangelogPreview> {
  const { default: preview } = await import('../../data/gateway-changelog.json');
  return preview as GatewayChangelogPreview;
}
