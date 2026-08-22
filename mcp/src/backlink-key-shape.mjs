// **The shape of the values a backlink update reports.**
//
// Why this is separate (measured 2026-08-17): `pnpm dogfood:verify` was red —
//
//   ✗ rename_concept … beforeKeys[1] before drift
//
// Reproducing it showed **the behaviour was correct** — renaming carries the
// relation's rationale along with it:
//
//   before: { "capabilities/mcp-server":   "ACP 세션은 …" }
//   after : { "capabilities/mcp-server-x": "ACP 세션은 …" }
//
// What was wrong was the gate's contract. It pinned `before`/`after` to a string
// or an array of strings, and `relation_notes` is a **map**.
//
// > **A gate that fires on correct behaviour is a gate that gets switched off.**
// > It is the mirror image of a gate that catches nothing, with the same result:
// > nobody looks at it.
//
// Widened, **not loosened**: string, array of strings, and a **flat string map**.
// Nesting is still rejected.

/** Is the value a clean string — leading/trailing whitespace, empty strings, and NULs are rejected. */
export function isCleanNonBlankString(value) {
  return (
    typeof value === 'string'
    && value.length > 0
    && value.trim() === value
    && !value.includes('\u0000')
  );
}

/**
 * Is this a value a backlink key change can produce?
 *
 * A frontmatter relation slot is one of three things: a scalar reference
 * (`domain:`), an array of references (`dependencies:`), or a **rationale map**
 * (`relation_notes:`). Accepting only the first two makes renaming a node that has
 * the third fail even though it is correct.
 */
export function isBacklinkKeyValue(value) {
  if (isCleanNonBlankString(value)) return true;
  if (Array.isArray(value)) {
    return value.length > 0 && value.every((item) => isCleanNonBlankString(item));
  }
  if (value && typeof value === 'object') {
    // Flat maps only — a value that is itself an object or array is a shape this screen cannot explain.
    const entries = Object.entries(value);
    return entries.length > 0 && entries.every(
      ([key, entry]) => isCleanNonBlankString(key) && isCleanNonBlankString(entry),
    );
  }
  return false;
}
