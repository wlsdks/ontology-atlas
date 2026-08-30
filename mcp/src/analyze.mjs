// Facade for the analyze surface. The implementation lives in `analyze/`, split by
// topic; this file exists so that every importer — `index.js`, `growth-hint.mjs`,
// the CLI, and the corpus scripts — keeps one stable address for the two exports.
//
//   analyze/constants.mjs           detection tables and read limits
//   analyze/text.mjs                naming and text normalisation
//   analyze/scan-guards.mjs         option validation, containment, skipped rows
//   analyze/package-contracts.mjs   setup.py / pyproject / package.json / Cargo.toml readers
//   analyze/semantic-evidence.mjs   which documents are worth quoting, and how far to trust them
//   analyze/project-detection.mjs   project identity, README domains, existing vault nodes
//   analyze/native-evidence.mjs     Autotools/C and Cargo/Rust implementation evidence
//   analyze/source-elements.mjs     element candidates from source layout and imports
//   analyze/meaning-gate.mjs        business-first meaning gate and extraction contract
//   analyze/proposal-assessment.mjs judgement of a proposed meaning set
//   analyze/repo-structure.mjs      analyzeRepoStructure itself

export { analyzeRepoStructure } from './analyze/repo-structure.mjs';
export { buildProposalAssessment } from './analyze/proposal-assessment.mjs';
