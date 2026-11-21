import { RELEASE_MIN_MACOS, RELEASE_MIN_WINDOWS } from './release-facts';
import { formatAssetSize, releasePageUrl, type MacosReleaseAsset, type WindowsReleaseAsset } from './release-state';

export interface FactRow {
  label: string;
  value: string;
  /** Mono only for program text: Hangul in the mono face reads as spaced-out printout. */
  code?: boolean;
  href?: string;
  name?: string;
  narrowOnly?: boolean;
}

export interface FactRowsInput {
  published: boolean;
  primaryAsset: MacosReleaseAsset | null;
  windowsAsset: WindowsReleaseAsset | null;
  windowsPrimary: boolean;
  handheld: boolean;
  sizeOnCta: boolean;
  /** The tag the page names: the published one, or the in-development version. */
  tag: string;
  /** The publish date as the reader's locale writes it; null when none is known. */
  publishedOn: string | null;
}

export interface FactRowsCopy {
  versionLabel: string;
  requiresLabel: string;
  minOsSuffix: string;
  unpublished: string;
  shaLinkName: (fileName: string) => string;
}

/**
 * The release facts for the file the call to action points at: Windows' installer when it leads,
 * otherwise the macOS file. Unpublished, or on a handheld, the size and checksum rows do not exist.
 */
export function releaseFactRows(input: FactRowsInput, copy: FactRowsCopy): FactRow[] {
  const { published, primaryAsset, windowsAsset, windowsPrimary, handheld, sizeOnCta, tag, publishedOn } = input;
  const version = published ? [tag, publishedOn].filter(Boolean).join(' · ') : `${tag} · ${copy.unpublished}`;

  const subject = windowsPrimary && windowsAsset ? windowsAsset : primaryAsset;
  const subjectIsWindows = subject !== null && subject === windowsAsset;

  const facts: FactRow[] = [
    { label: copy.versionLabel, value: version },
    {
      label: copy.requiresLabel,
      value: subjectIsWindows
        ? `${RELEASE_MIN_WINDOWS}${copy.minOsSuffix}`
        : `${RELEASE_MIN_MACOS}${copy.minOsSuffix} · Apple Silicon`,
    },
  ];
  if (published && subject && !handheld) {
    facts.push({
      label: subjectIsWindows ? 'EXE' : 'DMG',
      value: formatAssetSize(subject.sizeBytes),
      narrowOnly: sizeOnCta,
    });
    facts.push({
      label: 'SHA-256',
      value: `${subject.sha256.slice(0, 8)}…${subject.sha256.slice(-8)}`,
      code: true,
      href: releasePageUrl(subjectIsWindows ? 'windows' : 'macos'),
      name: copy.shaLinkName(subject.fileName),
    });
  }
  return facts;
}
