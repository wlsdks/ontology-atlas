export type {
  ImportConflictPolicy,
  ImportPreview,
  ApplyImportInput,
  ApplyImportResult,
} from './types';
export { parseOntologyImportV1, type ParseResult } from './parse';
export { detectImportConflicts, type DetectConflictsInput } from './conflicts';
export {
  applyTBoxImport,
  type ApplyTBoxImportInput,
  type ApplyTBoxImportResult,
} from './apply-tbox';
