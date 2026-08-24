/**
 * The folder Atlas creates and looks for inside a project.
 *
 * ⚠️ **One name, one definition** (2026-08-24). Two features need it — the door that creates the
 * folder and the open path that finds it — and they sit in the same FSD layer, so it lives here
 * rather than in either of them. A second literal is how two surfaces end up disagreeing about
 * where somebody's map lives, which is the failure mode this whole round exists to prevent.
 *
 * Chosen by the owner over `docs/ontology`: *"docs is used so much I think it would just get
 * deleted."* Visible rather than a dot-folder, because what is hidden does not get read and this
 * product's whole argument is that a person opens these files.
 */
export const PROJECT_VAULT_DIR = 'atlas';
