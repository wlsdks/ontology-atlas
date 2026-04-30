export type {
  CanonicalIdResult,
  CanonicalizeInput,
  CreateStubInput,
  StubNodeRecord,
} from "./types";
export {
  normalizeSlug,
  resolveCanonicalNodeId,
  detectCanonicalConflicts,
  createStubPlaceholder,
  mergeStubPlaceholders,
} from "./canonicalize";
