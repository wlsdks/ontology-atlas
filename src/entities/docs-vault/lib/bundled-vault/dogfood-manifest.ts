import { bundledVaultManifest } from './bundled-manifest';
import dogfoodManifestJson from '../../data/manifest.json';

/**
 * This repository's own vault manifest, imported statically and nothing else of the bundle: the
 * `/download` page draws it before first paint (docs/DECISIONS.md, 2026-07-28), so it is the one
 * client route that carries a vault JSON in its first load. Any other screen reads a sample
 * through `useStaticVaultSource`.
 */
export const dogfoodManifest = bundledVaultManifest(dogfoodManifestJson);
