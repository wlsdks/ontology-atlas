import { bundledVaultManifest } from './bundled-manifest';
import dogfoodManifestJson from '../../data/manifest.json';

/** This repository's own vault manifest, imported statically and nothing else of the bundle: `/download` draws it before first paint, so it is the one client route with a vault JSON in its first load. */
export const dogfoodManifest = bundledVaultManifest(dogfoodManifestJson);
