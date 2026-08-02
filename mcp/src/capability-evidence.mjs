/**
 * One predicate for the two places that judge whether a capability reaches code:
 * the immediate write-path notice and the durable maintenance queue.
 *
 * `path` is a capability's one canonical repo-relative implementation entrypoint.
 * `hasElementsEdge` means the capability points to a resolved ontology concept.
 * A raw file path must not be smuggled into that graph relation.
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
