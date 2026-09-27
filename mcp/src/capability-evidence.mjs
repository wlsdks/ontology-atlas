/**
 * Does a capability reach code? Shared by the write-path notice and the
 * maintenance queue. `path` is its one repo-relative
 * entrypoint; `hasElementsEdge` means it points to a resolved concept. A raw file path must
 * not be smuggled into that graph relation.
 */
export function hasCapabilityImplementationEvidence({
  path,
  hasElementsEdge = false,
} = {}) {
  return (
    (typeof path === 'string' && path.trim() !== '') ||
    hasElementsEdge === true
  );
}
