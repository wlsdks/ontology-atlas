/**
 * The Library's service door. Only the dialog crosses this barrel: everything else in
 * `model/import-flow.ts` is that dialog's own reasoning, and the tests reach it directly rather
 * than through a public surface with one consumer — which is what the dead-code ratchet is for.
 */
export { LibraryImportDialog } from './ui/LibraryImportDialog';
